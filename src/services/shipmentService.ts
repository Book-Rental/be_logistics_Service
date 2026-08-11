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
import { getOrderItemDetails, updateOrderItemStatus, } from "../helper/orderHelper";
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
                    updatedAt: 1             // 🟢 If tied, pick whoever was updated longest ago (Round Robin)
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
                { $group: { _id: "$currentStatus", count: { $sum: 1 } } }
            ])
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
                totalCount,         // Grand overall total of data matching JourneyType
                ...statusWiseCounts // Dynamic mapping like {"Pickup Assigned": 8, "Out For Pickup": 5}
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
        // 2. Get Shipment
        // =====================================================

        const shipment = await Shipment.findById(shipmentId);

        if (!shipment) {
            const error: any = new Error("Shipment not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // =====================================================
        // 3. Validate Requested Status Transition
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
        // 4. Validate Agent
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
        // 7. PICKUP Assigened - Update Order Service
        // =====================================================

        if (
            status === ShipmentStatus.PICKUP_ASSIGNED
        ) {
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
        // 5. Validate Hub
        // =====================================================

        if (
            [
                ShipmentStatus.ARRIVED_AT_ORIGIN_HUB,
                ShipmentStatus.SORTING_COMPLETED,
                ShipmentStatus.IN_TRANSIT,
                ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,
            ].includes(status) &&
            !hubId
        ) {
            const error: any = new Error(
                "Hub Id is required."
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // =====================================================
        // 6. Normalize IDs
        // =====================================================

        const normalizedAgentId = agentId
            ? new mongoose.Types.ObjectId(agentId)
            : shipment.currentAgentId ?? undefined;

        const normalizedHubId = hubId
            ? new mongoose.Types.ObjectId(hubId)
            : shipment.currentHubId ?? undefined;

        const normalizedUpdatedBy =
            new mongoose.Types.ObjectId(updatedBy);



        // =====================================================
        // 8. ARRIVED AT ORIGIN HUB
        // =====================================================

        if (
            status === ShipmentStatus.ARRIVED_AT_ORIGIN_HUB
        ) {
            // -------------------------------------------------
            // Validate origin hub
            // -------------------------------------------------

            if (!shipment.originHubId) {
                const error: any = new Error(
                    "Origin Hub Id is missing in shipment."
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            // -------------------------------------------------
            // Validate destination hub
            // -------------------------------------------------

            if (!shipment.destinationHubId) {
                const error: any = new Error(
                    "Destination Hub Id is missing in shipment."
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            // -------------------------------------------------
            // FIRST:
            // Always update to ARRIVED_AT_ORIGIN_HUB
            // -------------------------------------------------

            shipment.currentStatus =
                ShipmentStatus.ARRIVED_AT_ORIGIN_HUB;

            shipment.currentHubId =
                shipment.originHubId;

            shipment.currentAgentId =
                normalizedAgentId;

            // -------------------------------------------------
            // Add origin hub journey
            // -------------------------------------------------

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

                eventAt: new Date(),
            });

            // -------------------------------------------------
            // Check same hub
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
            // We have already recorded:
            //
            // ARRIVED_AT_ORIGIN_HUB
            //
            // Now automatically record:
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

            // -------------------------------------------------
            // Add destination hub journey
            // -------------------------------------------------

            shipment.journeyDetails.push({
                event:
                    "Arrived At Hub",

                status:
                    ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,

                hubId:
                    shipment.destinationHubId,

                agentId: null,

                remarks:
                    "Origin hub and destination hub are the same. Shipment automatically moved to destination hub.",

                updatedBy:
                    normalizedUpdatedBy,

                eventAt: new Date(),
            });

            await shipment.save();

            return shipment;
        }

        // =====================================================
        // 9. ARRIVED AT DESTINATION HUB
        // =====================================================

        if (
            status ===
            ShipmentStatus.ARRIVED_AT_DESTINATION_HUB
        ) {
            shipment.currentStatus =
                ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;

            shipment.currentHubId =
                shipment.destinationHubId;

            shipment.currentAgentId = null;

            shipment.journeyType =
                JourneyType.DELIVERY;
        }

        // =====================================================
        // 10. OUT FOR DELIVERY
        // =====================================================

        if (
            status === ShipmentStatus.OUT_FOR_DELIVERY
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
        // 11. DELIVERED
        // =====================================================

        if (
            status === ShipmentStatus.DELIVERED
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
        // 12. NORMAL STATUS UPDATE
        // =====================================================

        shipment.currentStatus = status;

        if (agentId) {
            shipment.currentAgentId =
                normalizedAgentId;
        }

        if (hubId) {
            shipment.currentHubId =
                normalizedHubId;
        }

        // =====================================================
        // 13. Add Journey
        // =====================================================

        shipment.journeyDetails.push({
            event,
            status,
            hubId: normalizedHubId,
            agentId: normalizedAgentId,
            remarks: remarks || "",
            updatedBy: normalizedUpdatedBy,
            eventAt: new Date(),
        });

        // =====================================================
        // 14. Save
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



export interface AssignDeliveryAgentPayload {
    agentId: string;
    shipmentIds: string[];
    updatedBy: string;
}

export const assignAgentToShipmentsService = async (
    payload: AssignDeliveryAgentPayload
) => {
    const session = await mongoose.startSession();

    try {
        const { agentId, shipmentIds, updatedBy } = payload;

        await session.withTransaction(async () => {
            // Validate Agent
            const agent = await Agent.findById(agentId).session(session);

            if (!agent) {
                const error: any = new Error("Agent not found.");
                error.statusCode = StatusCode.Not_Found;
                throw error;
            }

            if (!agent.isActive || !agent.isAvailable) {
                const error: any = new Error(
                    "Selected agent is not available."
                );
                error.statusCode = StatusCode.Bad_Request;
                throw error;
            }

            for (const shipmentId of shipmentIds) {
                if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
                    throw new Error(`Invalid shipment id: ${shipmentId}`);
                }

                const shipment: any = await Shipment.findById(shipmentId).session(session);

                if (!shipment) {
                    throw new Error(`Shipment ${shipmentId} not found.`);
                }

                // Shipment must be in destination hub
                if (
                    shipment.currentStatus !==
                    ShipmentStatus.ARRIVED_AT_DESTINATION_HUB
                ) {
                    throw new Error(
                        `Shipment ${shipment.awbNumber} is not ready for delivery assignment.`
                    );
                }
                // Validate that the delivery agent belongs to the shipment's destination hub
                if (
                    shipment.destinationHubId.toString() !== agent.hubId.toString()
                ) {
                    throw new Error(
                        `Delivery agent does not belong to the shipment's destination hub.`
                    );
                }
                // Assign Delivery Agent
                shipment.currentAgentId = agent._id;
                shipment.currentStatus =
                    ShipmentStatus.DELIVERY_AGENT_ASSIGNED;
                shipment.journeyType = JourneyType.DELIVERY;

                // Maintain Agent History
                if (
                    !shipment.agentIds.some(
                        (id: mongoose.Types.ObjectId) =>
                            id.toString() === agent._id.toString()
                    )
                ) {
                    shipment.agentIds.push(agent._id);
                }

                // Maintain Hub History
                if (
                    !shipment.hubIds.some(
                        (id: mongoose.Types.ObjectId) =>
                            id.toString() === agent.hubId.toString()
                    )
                ) {
                    shipment.hubIds.push(agent.hubId);
                }

                // Journey Entry
                shipment.journeyDetails.push({
                    event: JourneyEventType.DELIVERY_AGENT_ASSIGNED,
                    status: ShipmentStatus.DELIVERY_AGENT_ASSIGNED,
                    hubId: shipment.currentHubId,
                    agentId: agent._id,
                    remarks: `Assigned to delivery agent ${agent.fullName}`,
                    updatedBy: new mongoose.Types.ObjectId(updatedBy),
                    eventAt: new Date(),
                });

                await shipment.save({ session });
            }

            // Optional: mark agent unavailable
            // agent.status = AgentStatus.ON_DELIVERY;
            // agent.isAvailable = false;
            await agent.save({ session });
        });

        return {
            success: true,
            assignedAgentId: agentId,
            totalAssigned: shipmentIds.length,
        };
    } catch (error) {
        throw error;
    } finally {
        session.endSession();
    }
};