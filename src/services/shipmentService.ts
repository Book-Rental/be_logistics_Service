import {
    JourneyEventType,
    JourneyType,
    PaymentMode,
    ShipmentStatus,
    ShipmentType,
} from "../models/shipment";
import Hub from "../models/hub";
import Shipment from "../models/shipment";
import { generateShipmentDetails } from "../utils/shipmentFunction";
import { findHubByPincode } from "./hubService";
import mongoose from "mongoose";
import Agent, { AgentStatus } from "../models/Agent";
import { StatusCode } from "../utils/StatusCodes";
import { randomUUID } from "crypto";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { getOrderItemDetails, updateOrderItemStatus } from "../helper/orderHelper";
import {
    generateProductionAWB,
    SHIPMENT_STATUS_TRANSITIONS,
    UpdateShipmentStatusPayload,
} from "../utils/shipment";
interface ContactPayload {
    name: string;
    phone: string;
    email?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
}

export interface CreateShipmentPayload {
    orderId: string;
    orderItemId: string;

    sellerId: string;
    buyerId: string;

    sender: ContactPayload;
    receiver: ContactPayload;

    shipmentType?: ShipmentType;

    paymentMode?: PaymentMode;
    codAmount?: number;

    expectedDeliveryDate?: Date;

    createdBy: string;
}

export const createShipmentService = async (payload: CreateShipmentPayload) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            orderId,
            orderItemId,
            sellerId,
            buyerId,
            sender,
            receiver,
            shipmentType = ShipmentType.FORWARD,
            paymentMode = PaymentMode.PREPAID,
            codAmount = 0,
            expectedDeliveryDate,
            createdBy,
        } = payload;

        // Check duplicate shipment
        const existingShipment = await Shipment.findOne({ orderItemId }).session(session).lean();

        if (existingShipment) {
            throw new Error("Shipment already exists for this order item.");
        }

        // Find Origin Hub
        const originHub = await findHubByPincode(sender.pincode);

        if (!originHub) {
            throw new Error(`Origin hub not found for pincode: ${sender.pincode}`);
        }

        // Find Destination Hub
        const destinationHub = await findHubByPincode(receiver.pincode);

        if (!destinationHub) {
            throw new Error(`Destination hub not found for pincode: ${receiver.pincode}`);
        }

        // Generate AWB
        const awbNumber = generateProductionAWB();

        const [shipment] = await Shipment.create(
            [
                {
                    awbNumber,

                    orderId,
                    orderItemId,

                    sellerId,
                    buyerId,

                    sender,
                    receiver,

                    shipmentType,
                    paymentMode,
                    codAmount,

                    originHubId: originHub._id,
                    destinationHubId: destinationHub._id,

                    currentHubId: originHub._id,
                    currentAgentId: null,
                    currentTripId: null,

                    currentStatus: ShipmentStatus.CREATED,

                    expectedDeliveryDate,

                    // History
                    hubIds: [originHub._id],
                    agentIds: [],

                    journeyType: JourneyType.PICKUP,

                    journeyDetails: [
                        {
                            event: JourneyEventType.SHIPMENT_CREATED,
                            status: ShipmentStatus.CREATED,
                            hubId: originHub._id,
                            agentId: null,
                            remarks: "Shipment created successfully.",
                            updatedBy: createdBy,
                            eventAt: new Date(),
                        },
                    ],

                    createdBy,
                },
            ],
            { session }
        );

        await session.commitTransaction();

        return shipment;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

export const readyForPickupService = async (orderItemId: string) => {
    const session = await mongoose.startSession();

    try {
        let shipment: any;

        await session.withTransaction(async () => {
            shipment = await Shipment.findOne({ orderItemId }).session(session);
            console.log("shipment", shipment);
            if (!shipment) {
                throw new Error("Shipment not found.");
            }

            if (shipment.currentStatus !== ShipmentStatus.CREATED) {
                const error: any = new Error(
                    `Shipment is already in '${shipment.currentStatus}' status.`
                );
                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }
            const pickupAgent = await Agent.findOne({
                hubId: shipment.originHubId,
                isActive: true,
                isAvailable: true,
                status: AgentStatus.ACTIVE,
            })
                .sort({
                    activeShipmentsCount: 1, // 🟢 Pick whoever has the least work first (Fair Share)
                    updatedAt: 1, // 🟢 If tied, pick whoever was updated longest ago (Round Robin)
                })
                .session(session);

            if (!pickupAgent) {
                throw new Error("No pickup agent available for this hub.");
            }

            // Assign pickup agent
            shipment.pickUpAgentId = pickupAgent._id;
            shipment.currentAgentId = pickupAgent._id;

            // Maintain agent history
            if (
                !shipment.agentIds.some((id: any) => id.toString() === pickupAgent._id.toString())
            ) {
                shipment.agentIds.push(pickupAgent._id);
            }

            // Update shipment status
            shipment.currentStatus = ShipmentStatus.READY_FOR_PICKUP;

            // Journey - Ready for Pickup
            shipment.journeyDetails.push({
                event: JourneyEventType.READY_FOR_PICKUP,
                status: ShipmentStatus.READY_FOR_PICKUP,
                hubId: shipment.originHubId,
                remarks: "Shipment is ready for pickup.",
                updatedBy: null,
                eventAt: new Date(),
            });

            // Journey - Agent Assigned
            shipment.currentStatus = ShipmentStatus.PICKUP_ASSIGNED;

            shipment.journeyDetails.push({
                event: JourneyEventType.PICKUP_AGENT_ASSIGNED,
                status: ShipmentStatus.PICKUP_ASSIGNED,
                hubId: shipment.originHubId,
                agentId: pickupAgent._id,
                remarks: `Pickup assigned to ${pickupAgent.fullName}`,
                updatedBy: null,
                eventAt: new Date(),
            });

            // Update Agent
            // pickupAgent.isAvailable = false;
            // pickupAgent.status = AgentStatus.ON_DELIVERY;
            pickupAgent.currentShipmentId = shipment._id;

            await pickupAgent.save({ session });
            await shipment.save({ session });
        });

        return shipment;
    } finally {
        session.endSession();
    }
};

export const getShipmentByIdService = async (shipmentId: string) => {
    try {
        // Validate Shipment ID
        if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
            const error: any = new Error("Invalid Shipment ID.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // Fetch Shipment
        const shipment: any = await Shipment.findById(shipmentId)
            .populate("originHubId", "hubName hubCode address phoneNumber")
            .populate("destinationHubId", "hubName hubCode address phoneNumber")
            .populate("currentHubId", "hubName hubCode address")
            .populate("currentAgentId", "fullName phoneNumber vehicleType status")
            .lean();

        if (!shipment) {
            const error: any = new Error("Shipment not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // Fetch Order Details from Order Service
        let orderDetails = null;

        try {
            orderDetails = await getOrderItemDetails(shipment.orderId, shipment.orderItemId);
        } catch (err) {
            console.error("Failed to fetch order details:", err);
        }
        console.log("shipment", shipment.hubIds);
        return {
            shipmentId: shipment._id,
            awbNumber: shipment.awbNumber,

            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,

            sellerId: shipment.sellerId,
            buyerId: shipment.buyerId,

            sender: shipment.sender,
            receiver: shipment.receiver,

            shipmentType: shipment.shipmentType,
            paymentMode: shipment.paymentMode,
            codAmount: shipment.codAmount,

            currentStatus: shipment.currentStatus,
            expectedDeliveryDate: shipment.expectedDeliveryDate,

            infrastructure: {
                originHub: shipment.originHubId,
                destinationHub: shipment.destinationHubId,
                currentHub: shipment.currentHubId,
            },
            hubIds: shipment.hubIds,
            agentIds: shipment.agentIds,

            assignedAgent: shipment.currentAgentId,

            // 👇 Order details from Order Service
            orderDetails,

            journeyHistory: shipment.journeyDetails,

            createdAt: shipment.createdAt,
            updatedAt: shipment.updatedAt,
        };
    } catch (error) {
        throw error;
    }
};

export const getShipmentByAgentIdService = async (
    agentId: string,
    query: {
        page?: number;
        limit?: number;
        currentStatus?: string;
        JourneyType?: JourneyType;
    } = {}
) => {
    try {
        // Validate Agent Id
        if (!mongoose.Types.ObjectId.isValid(agentId)) {
            const error: any = new Error("Invalid Agent ID.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        const agent = await Agent.findById(agentId);

        if (!agent) {
            const error: any = new Error("Agent not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // Pagination
        const { skip, limit, page } = buildPaginationQuery(query);

        // Filter for Paginated Results
        const filter: any = {
            currentAgentId: agent._id,
        };

        if (query.currentStatus) {
            filter.currentStatus = query.currentStatus;
        }
        if (query.JourneyType) {
            filter.journeyType = query.JourneyType;
        }

        // Base filter for counts (ignores status filter to get totals across all states)
        const countFilter: any = {
            currentAgentId: agent._id,
        };
        if (query.JourneyType) {
            countFilter.journeyType = query.JourneyType;
        }

        // Fetch Shipments, Total Records, and Status Aggregations in parallel
        const [shipments, totalFilteredRecords, statusCountsRaw] = await Promise.all([
            Shipment.find(filter)
                .populate("originHubId", "hubName hubCode")
                .populate("destinationHubId", "hubName hubCode")
                .populate("currentHubId", "hubName hubCode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Shipment.countDocuments(filter),

            Shipment.aggregate([
                { $match: countFilter },
                { $group: { _id: "$currentStatus", count: { $sum: 1 } } },
            ]),
        ]);

        // Transform Aggregation Array into Key-Value Map and calculate Overall Total
        let totalCount = 0;
        const statusWiseCounts: Record<string, number> = {};

        statusCountsRaw.forEach((item) => {
            if (item._id) {
                statusWiseCounts[item._id] = item.count;
                totalCount += item.count; // Accumulate grand total across all states
            }
        });

        // Append Order Details
        const shipmentData = await Promise.all(
            shipments.map(async (shipment: any) => {
                let orderDetails = null;

                try {
                    orderDetails = await getOrderItemDetails(
                        shipment.orderId,
                        shipment.orderItemId
                    );
                } catch (err) {
                    console.error(`Failed to fetch order details for shipment ${shipment._id}`);
                }

                return {
                    ...shipment,
                    orderDetails,
                };
            })
        );

        return {
            shipments: shipmentData,
            counts: {
                totalCount, // Grand overall total of data matching JourneyType
                ...statusWiseCounts, // Dynamic mapping like {"Pickup Assigned": 8, "Out For Pickup": 5}
            },
            meta: {
                totalRecords: totalFilteredRecords, // Total records matching the status filter
                totalPages: Math.ceil(totalFilteredRecords / limit),
                currentPage: page,
                limit,
                hasMore: page < Math.ceil(totalFilteredRecords / limit),
            },
        };
    } catch (error) {
        throw error;
    }
};


export const updateShipmentStatusService = async (
    payload: UpdateShipmentStatusPayload
) => {
    try {
        const {
            shipmentId,
            status,
            event,
            remarks,
            agentId,
            hubId,
            updatedBy,
        } = payload;

        // =====================================================
        // 1. Validate Shipment ID
        // =====================================================

        if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
            const error: any = new Error("Invalid Shipment Id.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 2. Validate Updated By
        // =====================================================

        if (!updatedBy || !mongoose.Types.ObjectId.isValid(updatedBy)) {
            const error: any = new Error("Invalid updatedBy.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 3. Validate Agent ID if provided
        // =====================================================

        if (agentId && !mongoose.Types.ObjectId.isValid(agentId)) {
            const error: any = new Error("Invalid Agent Id.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 4. Validate Hub ID if provided
        // =====================================================

        if (hubId && !mongoose.Types.ObjectId.isValid(hubId)) {
            const error: any = new Error("Invalid Hub Id.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 5. Get Shipment
        // =====================================================

        const shipment = await Shipment.findById(shipmentId);

        if (!shipment) {
            const error: any = new Error("Shipment not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // =====================================================
        // 6. Validate Status Transition
        // =====================================================

        const allowedStatuses =
            SHIPMENT_STATUS_TRANSITIONS[shipment.currentStatus];

        if (!allowedStatuses?.includes(status)) {
            const error: any = new Error(
                `Shipment cannot move from "${shipment.currentStatus}" to "${status}".`
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 7. Normalize IDs
        // =====================================================

        const normalizedAgentId = agentId
            ? new mongoose.Types.ObjectId(agentId)
            : shipment.currentAgentId ?? null;

        const normalizedHubId = hubId
            ? new mongoose.Types.ObjectId(hubId)
            : shipment.currentHubId ?? null;

        const normalizedUpdatedBy =
            new mongoose.Types.ObjectId(updatedBy);

        // =====================================================
        // 8. Agent Validation
        // =====================================================

        if (
            status === ShipmentStatus.PICKUP_ASSIGNED &&
            !agentId
        ) {
            const error: any = new Error(
                "Pickup Agent Id is required."
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        if (
            status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED &&
            !agentId
        ) {
            const error: any = new Error(
                "Delivery Agent Id is required."
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 9. Hub Validation
        // =====================================================

        if (
            [
                ShipmentStatus.ARRIVED_AT_ORIGIN_HUB,
                ShipmentStatus.SORTING_COMPLETED,
                ShipmentStatus.IN_TRANSIT,
                ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,
            ].includes(status) &&
            !hubId &&
            !shipment.currentHubId
        ) {
            const error: any = new Error(
                "Hub Id is required."
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 10. PICKUP ASSIGNED
        // =====================================================

        if (status === ShipmentStatus.PICKUP_ASSIGNED) {
            try {
                await updateOrderItemStatus(
                    shipment.orderId.toString(),
                    shipment.orderItemId.toString(),
                    "shipped"
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${shipmentId}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode =
                    StatusCode.Internal_Server_Error;

                throw error;
            }
        }

        // =====================================================
        // 11. ARRIVED AT ORIGIN HUB
        // =====================================================

        if (status === ShipmentStatus.ARRIVED_AT_ORIGIN_HUB) {

            // -------------------------------------------------
            // Validate Origin Hub
            // -------------------------------------------------

            if (!shipment.originHubId) {
                const error: any = new Error(
                    "Origin Hub Id is missing in shipment."
                );

                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            // -------------------------------------------------
            // Validate Destination Hub
            // -------------------------------------------------

            if (!shipment.destinationHubId) {
                const error: any = new Error(
                    "Destination Hub Id is missing in shipment."
                );

                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            // -------------------------------------------------
            // STEP 1
            // Always append ARRIVED_AT_ORIGIN_HUB
            // -------------------------------------------------

            shipment.currentStatus =
                ShipmentStatus.ARRIVED_AT_ORIGIN_HUB;

            shipment.currentHubId =
                shipment.originHubId;

            shipment.currentAgentId =
                normalizedAgentId;

            shipment.journeyDetails.push({
                event:
                    event ||
                    "Shipment arrived at origin hub",

                status:
                    ShipmentStatus.ARRIVED_AT_ORIGIN_HUB,

                hubId:
                    shipment.originHubId,

                agentId:
                    normalizedAgentId,

                remarks:
                    remarks || "",

                updatedBy:
                    normalizedUpdatedBy,

                eventAt:
                    new Date(),
            });

            // -------------------------------------------------
            // Check whether origin and destination are same
            // -------------------------------------------------

            const isSameHub =
                shipment.originHubId.toString() ===
                shipment.destinationHubId.toString();

            // -------------------------------------------------
            // DIFFERENT HUB
            // -------------------------------------------------

            if (!isSameHub) {
                await shipment.save();

                return shipment;
            }

            // =================================================
            // SAME HUB
            // =================================================
            //
            // Journey will contain:
            //
            // 1. ARRIVED_AT_ORIGIN_HUB
            // 2. ARRIVED_AT_DESTINATION_HUB
            //
            // But currentStatus will finally be:
            //
            // ARRIVED_AT_DESTINATION_HUB
            //
            // =================================================

            shipment.currentStatus =
                ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;

            shipment.currentHubId =
                shipment.destinationHubId;

            shipment.currentAgentId = null;

            shipment.journeyType =
                JourneyType.DELIVERY;

            shipment.journeyDetails.push({
                event:
                    "Shipment arrived at destination hub",

                status:
                    ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,

                hubId:
                    shipment.destinationHubId,

                agentId: null,

                remarks:
                    "Origin hub and destination hub are the same. Shipment automatically moved from origin hub to destination hub.",

                updatedBy:
                    normalizedUpdatedBy,

                eventAt:
                    new Date(),
            });

            await shipment.save();

            return shipment;
        }

        // =====================================================
        // 12. ARRIVED AT DESTINATION HUB
        // =====================================================

        if (
            status ===
            ShipmentStatus.ARRIVED_AT_DESTINATION_HUB
        ) {
            if (!shipment.destinationHubId) {
                const error: any = new Error(
                    "Destination Hub Id is missing in shipment."
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            shipment.currentStatus =
                ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;

            shipment.currentHubId =
                shipment.destinationHubId;

            shipment.currentAgentId = null;

            shipment.journeyType =
                JourneyType.DELIVERY;

            shipment.journeyDetails.push({
                event:
                    event ||
                    "Shipment arrived at destination hub",

                status:
                    ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,

                hubId:
                    shipment.destinationHubId,

                agentId: null,

                remarks:
                    remarks || "",

                updatedBy:
                    normalizedUpdatedBy,

                eventAt:
                    new Date(),
            });

            await shipment.save();

            return shipment;
        }

        // =====================================================
        // 13. DELIVERY AGENT ASSIGNED
        // =====================================================

        if (
            status ===
            ShipmentStatus.DELIVERY_AGENT_ASSIGNED
        ) {
            if (!agentId) {
                const error: any = new Error(
                    "Delivery Agent Id is required."
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            shipment.currentAgentId =
                normalizedAgentId;

            shipment.journeyType =
                JourneyType.DELIVERY;
        }

        // =====================================================
        // 14. OUT FOR DELIVERY
        // =====================================================

        if (
            status ===
            ShipmentStatus.OUT_FOR_DELIVERY
        ) {
            if (
                !agentId &&
                !shipment.currentAgentId
            ) {
                const error: any = new Error(
                    "Delivery Agent Id is required."
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            try {
                await updateOrderItemStatus(
                    shipment.orderId.toString(),
                    shipment.orderItemId.toString(),
                    "out_for_delivery"
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${shipmentId}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode =
                    StatusCode.Internal_Server_Error;

                throw error;
            }
        }

        // =====================================================
        // 15. DELIVERED
        // =====================================================

        if (
            status ===
            ShipmentStatus.DELIVERED
        ) {
            try {
                await updateOrderItemStatus(
                    shipment.orderId.toString(),
                    shipment.orderItemId.toString(),
                    "delivered"
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${shipmentId}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode =
                    StatusCode.Internal_Server_Error;

                throw error;
            }
        }

        // =====================================================
        // 16. NORMAL STATUS UPDATE
        // =====================================================

        shipment.currentStatus = status;

        if (agentId) {
            shipment.currentAgentId =
                normalizedAgentId ?? undefined;
        }

        if (hubId) {
            shipment.currentHubId =
                normalizedHubId ?? undefined;
        }

        // =====================================================
        // 17. Add Journey Entry
        // =====================================================

        shipment.journeyDetails.push({
            event,
            status,

            hubId:
                shipment.currentHubId ??
                normalizedHubId,

            agentId:
                shipment.currentAgentId ??
                normalizedAgentId,

            remarks:
                remarks || "",

            updatedBy:
                normalizedUpdatedBy,

            eventAt:
                new Date(),
        });

        // =====================================================
        // 18. Save Shipment
        // =====================================================

        await shipment.save();

        return shipment;

    } catch (error) {
        throw error;
    }
};

export const getShipmentByOrderItemIdService = async (orderItemId: string) => {
    if (!mongoose.Types.ObjectId.isValid(orderItemId)) {
        const error: any = new Error("Invalid Order Item Id.");
        error.statusCode = StatusCode.Bad_Request;
        throw error;
    }

    const shipment = await Shipment.findOne({ orderItemId })
        .populate("currentAgentId", "fullName phoneNumber vehicleType")
        .lean();

    if (!shipment) {
        const error: any = new Error("Shipment not found.");
        error.statusCode = StatusCode.Not_Found;
        throw error;
    }

    return {
        shipmentId: shipment._id,
        awbNumber: shipment.awbNumber,
        currentStatus: shipment.currentStatus,

        pickupAgent: shipment.currentAgentId,

        journey: shipment.journeyDetails.map((item: any) => ({
            event: item.event,
            status: item.status,
            eventAt: item.eventAt,
        })),
    };
};

export interface BulkUpdateShipmentPayload {
    shipmentIds: string[];
    agentId?: string;
    status: ShipmentStatus;
    remarks?: string;
    updatedBy: string;
}

export const bulkUpdateShipmentService = async (payload: BulkUpdateShipmentPayload) => {
    const session = await mongoose.startSession();

    try {
        const { shipmentIds, agentId, status, remarks, updatedBy } = payload;

        const updatedShipments: any[] = [];

        await session.withTransaction(async () => {
            // --------------------------------------------------
            // 1. Validate updatedBy
            // --------------------------------------------------
            if (!mongoose.Types.ObjectId.isValid(updatedBy)) {
                const error: any = new Error("Invalid updatedBy.");
                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            // --------------------------------------------------
            // 2. Validate shipment IDs
            // --------------------------------------------------
            for (const shipmentId of shipmentIds) {
                if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
                    const error: any = new Error(`Invalid shipment ID: ${shipmentId}`);
                    error.statusCode = StatusCode.Bad_Request;
                    throw error;
                }
            }

            // --------------------------------------------------
            // 3. Validate new status
            // --------------------------------------------------
            if (!Object.values(ShipmentStatus).includes(status)) {
                const error: any = new Error(`Invalid shipment status: ${status}`);
                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            // --------------------------------------------------
            // 4. Check whether this status requires an agent
            // --------------------------------------------------
            const requiresAgent =
                status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED ||
                status === ShipmentStatus.PICKUP_ASSIGNED;

            if (requiresAgent && !agentId) {
                const error: any = new Error(
                    `agentId is required when changing shipment status to "${status}".`
                );
                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            // --------------------------------------------------
            // 5. Validate agent only when agentId is provided
            // --------------------------------------------------
            let agent: any = null;

            if (agentId) {
                if (!mongoose.Types.ObjectId.isValid(agentId)) {
                    const error: any = new Error("Invalid agentId.");
                    error.statusCode = StatusCode.Bad_Request;
                    throw error;
                }

                agent = await Agent.findById(agentId).session(session);

                if (!agent) {
                    const error: any = new Error("Agent not found.");
                    error.statusCode = StatusCode.Not_Found;
                    throw error;
                }

                if (!agent.isActive || !agent.isAvailable) {
                    const error: any = new Error("Selected agent is not available.");
                    error.statusCode = StatusCode.Bad_Request;
                    throw error;
                }
            }

            // --------------------------------------------------
            // 6. Process every shipment
            // --------------------------------------------------
            for (const shipmentId of shipmentIds) {
                const shipment: any = await Shipment.findById(shipmentId).session(session);

                if (!shipment) {
                    const error: any = new Error(`Shipment ${shipmentId} not found.`);
                    error.statusCode = StatusCode.Not_Found;
                    throw error;
                }

                // --------------------------------------------------
                // IMPORTANT:
                // Get CURRENT status from database.
                // Do not receive currentStatus from request.
                // --------------------------------------------------
                const currentStatus = shipment.currentStatus as ShipmentStatus;

                // --------------------------------------------------
                // 7. Check status transition
                // --------------------------------------------------
                const allowedStatuses = SHIPMENT_STATUS_TRANSITIONS[currentStatus];

                if (!allowedStatuses?.includes(status)) {
                    const error: any = new Error(
                        `Shipment ${shipment.awbNumber || shipment._id} cannot move from "${currentStatus}" to "${status}".`
                    );

                    error.statusCode = StatusCode.Bad_Request;
                    throw error;
                }

                // --------------------------------------------------
                // 8. Agent assignment
                // --------------------------------------------------
                if (agentId && agent) {
                    // For delivery, agent should belong to
                    // destination/current hub.
                    const requiredHubId = shipment.destinationHubId || shipment.currentHubId;

                    if (
                        requiredHubId &&
                        agent.hubId &&
                        requiredHubId.toString() !== agent.hubId.toString()
                    ) {
                        const error: any = new Error(
                            `Agent ${agent.fullName} does not belong to the required hub for shipment ${shipment.awbNumber || shipment._id}.`
                        );

                        error.statusCode = StatusCode.Bad_Request;
                        throw error;
                    }

                    // Assign agent
                    shipment.currentAgentId = agent._id;

                    // Maintain agent history
                    if (
                        !shipment.agentIds.some(
                            (id: mongoose.Types.ObjectId) => id.toString() === agent._id.toString()
                        )
                    ) {
                        shipment.agentIds.push(agent._id);
                    }
                }

                // --------------------------------------------------
                // 9. Update status
                // --------------------------------------------------
                shipment.currentStatus = status;

                // --------------------------------------------------
                // 10. Journey type
                // --------------------------------------------------
                if (
                    status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB ||
                    status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED ||
                    status === ShipmentStatus.OUT_FOR_DELIVERY
                ) {
                    shipment.journeyType = JourneyType.DELIVERY;
                }

                // --------------------------------------------------
                // 11. Update current hub when arriving
                // --------------------------------------------------
                if (status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB) {
                    shipment.currentHubId = shipment.destinationHubId;
                }

                // --------------------------------------------------
                // 12. Maintain hub history
                // --------------------------------------------------
                if (shipment.currentHubId) {
                    const hubExists = shipment.hubIds.some(
                        (id: mongoose.Types.ObjectId) =>
                            id.toString() === shipment.currentHubId.toString()
                    );

                    if (!hubExists) {
                        shipment.hubIds.push(shipment.currentHubId);
                    }
                }

                // --------------------------------------------------
                // 13. Clear current agent when shipment reaches hub
                // --------------------------------------------------
                if (status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB) {
                    shipment.currentAgentId = null;
                }

                // --------------------------------------------------
                // 14. Journey history
                // --------------------------------------------------
                shipment.journeyDetails.push({
                    event: status,
                    status,
                    hubId: shipment.currentHubId || null,
                    agentId: shipment.currentAgentId || null,
                    remarks: remarks || "",
                    updatedBy: new mongoose.Types.ObjectId(updatedBy),
                    eventAt: new Date(),
                });

                // --------------------------------------------------
                // 15. Save shipment
                // --------------------------------------------------
                await shipment.save({ session });

                updatedShipments.push(shipment);
            }

            // --------------------------------------------------
            // 16. Update agent availability
            // --------------------------------------------------
            if (agentId && agent) {
                agent.status = AgentStatus.ON_DELIVERY;
                agent.isAvailable = false;

                await agent.save({ session });
            }
        });

        return {
            success: true,
            totalUpdated: updatedShipments.length,
            shipments: updatedShipments,
        };
    } catch (error) {
        throw error;
    } finally {
        await session.endSession();
    }
};
