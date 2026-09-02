import {
    JourneyEventType,
    JourneyType,
    PaymentMode,
    ShipmentStatus,
    ShipmentType,
} from "../models/shipment";
import Shipment from "../models/shipment";
import { findHubByPincode } from "./hubService";
import mongoose from "mongoose";
import { StatusCode } from "../utils/StatusCodes";
import { randomUUID } from "crypto";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { getOrderItemDetails, updateOrderItemStatus } from "../helper/orderHelper";
import {
    generateProductionAWB,
    SHIPMENT_STATUS_TRANSITIONS,
    UpdateShipmentStatusPayload,
} from "../utils/shipment";
import hubEmployee, { HubEmployeeRole, HubEmployeeStatus } from "../models/HubEmployee";
import { triggerRefund, triggerSellerPayout } from "./bookInspection.service";
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

export const readyForPickupService = async (shipmentId: string) => {
    const session = await mongoose.startSession();

    let updatedShipment: any = null;

    try {
        let shipment: any;

        await session.withTransaction(async () => {
            // -----------------------------------------
            // 1. Find Shipment
            // -----------------------------------------

            shipment = await Shipment.findById(shipmentId).session(session);

            if (!shipment) {
                const error: any = new Error("Shipment not found.");

                error.statusCode = StatusCode.Not_Found;

                throw error;
            }

            // -----------------------------------------
            // 2. Validate Shipment Status
            // -----------------------------------------

            if (shipment.currentStatus !== ShipmentStatus.CREATED) {
                const error: any = new Error(
                    `Shipment is already in '${shipment.currentStatus}' status.`
                );

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // -----------------------------------------
            // 3. Find Available Agent
            // -----------------------------------------

            const pickupAgent = await hubEmployee
                .findOne({
                    hubId: shipment.originHubId,

                    // Only Agent
                    role: HubEmployeeRole.AGENT,

                    // Agent must be active
                    // isActive: true,

                    // Agent must be available
                    isAvailable: true,

                    // Agent must be Active
                    status: HubEmployeeStatus.ACTIVE,
                })
                .sort({
                    updatedAt: 1,
                })
                .session(session);

            if (!pickupAgent) {
                const error: any = new Error("No pickup agent available for this hub.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // -----------------------------------------
            // 4. Assign Pickup Agent
            // -----------------------------------------

            shipment.pickUpAgentId = pickupAgent._id;

            shipment.currentAgentId = pickupAgent._id;

            // -----------------------------------------
            // 5. Maintain Agent History
            // -----------------------------------------

            if (
                !shipment.agentIds.some((id: any) => id.toString() === pickupAgent._id.toString())
            ) {
                shipment.agentIds.push(pickupAgent._id);
            }

            // -----------------------------------------
            // 6. Update Shipment Status
            // -----------------------------------------

            shipment.currentStatus = ShipmentStatus.READY_FOR_PICKUP;

            // -----------------------------------------
            // 7. Journey - Ready For Pickup
            // -----------------------------------------

            shipment.journeyDetails.push({
                event: JourneyEventType.READY_FOR_PICKUP,

                status: ShipmentStatus.READY_FOR_PICKUP,

                hubId: shipment.originHubId,

                remarks: "Shipment is ready for pickup.",

                updatedBy: null,

                eventAt: new Date(),
            });

            // -----------------------------------------
            // 8. Update Status - Pickup Assigned
            // -----------------------------------------

            shipment.currentStatus = ShipmentStatus.PICKUP_ASSIGNED;

            // -----------------------------------------
            // 9. Journey - Agent Assigned
            // -----------------------------------------

            shipment.journeyDetails.push({
                event: JourneyEventType.PICKUP_AGENT_ASSIGNED,

                status: ShipmentStatus.PICKUP_ASSIGNED,

                hubId: shipment.originHubId,

                agentId: pickupAgent._id,

                remarks: `Pickup assigned to ${pickupAgent.fullName}`,

                updatedBy: null,

                eventAt: new Date(),
            });

            // -----------------------------------------
            // 10. Update Agent
            // -----------------------------------------

            pickupAgent.isAvailable = false;

            pickupAgent.status = HubEmployeeStatus.ON_DELIVERY;

            pickupAgent.currentShipmentId = shipment._id;

            await pickupAgent.save({
                session,
            });

            // -----------------------------------------
            // 11. Save Shipment
            // -----------------------------------------

            updatedShipment = await shipment.save({
                session,
            });
        });

        // -----------------------------------------
        // 12. Update Order Service
        // -----------------------------------------

        if (updatedShipment && updatedShipment.shipmentType === ShipmentType.FORWARD) {
            try {
                await updateOrderItemStatus(
                    updatedShipment.orderId.toString(),
                    updatedShipment.orderItemId.toString(),
                    "shipped"
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${updatedShipment._id}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode = StatusCode.Internal_Server_Error;

                throw error;
            }
        } else if (updatedShipment && updatedShipment.shipmentType === ShipmentType.RETURN) {
            try {
                await updateOrderItemStatus(
                    updatedShipment.orderId.toString(),
                    updatedShipment.orderItemId.toString(),
                    "return_in_progress"
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${updatedShipment._id}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode = StatusCode.Internal_Server_Error;

                throw error;
            }
        }

        return updatedShipment;
    } finally {
        await session.endSession();
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
            journeyType: shipment.journeyType,
            paymentMode: shipment.paymentMode,
            codAmount: shipment.codAmount,

            currentStatus: shipment.currentStatus,
            expectedDeliveryDate: shipment.expectedDeliveryDate,

            inspection: shipment.inspection,

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
        // -----------------------------------------
        // 1. Validate Agent ID
        // -----------------------------------------

        if (!mongoose.Types.ObjectId.isValid(agentId)) {
            const error: any = new Error("Invalid Agent ID.");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // -----------------------------------------
        // 2. Check Agent Exists
        // -----------------------------------------

        const agent = await hubEmployee
            .findOne({
                _id: agentId,
                role: HubEmployeeRole.AGENT,
                // isActive: true,
            })
            .lean();

        if (!agent) {
            const error: any = new Error("Agent not found.");

            error.statusCode = StatusCode.Not_Found;

            throw error;
        }

        // -----------------------------------------
        // 3. Pagination
        // -----------------------------------------

        const { skip, limit, page } = buildPaginationQuery(query);

        // -----------------------------------------
        // 4. Shipment Filter
        // -----------------------------------------

        const filter: any = {
            currentAgentId: agent._id,
        };

        if (query.currentStatus) {
            filter.currentStatus = query.currentStatus;
        }

        if (query.JourneyType) {
            filter.journeyType = query.JourneyType;
        }

        // -----------------------------------------
        // 5. Count Filter
        // -----------------------------------------

        const countFilter: any = {
            currentAgentId: agent._id,
        };

        if (query.JourneyType) {
            countFilter.journeyType = query.JourneyType;
        }

        // -----------------------------------------
        // 6. Fetch Shipments + Counts
        // -----------------------------------------

        const [shipments, totalFilteredRecords, statusCountsRaw] = await Promise.all([
            // -----------------------------------------
            // Paginated Shipments
            // -----------------------------------------

            Shipment.find(filter)
                .populate({
                    path: "originHubId",
                    select: "hubName hubCode",
                })
                .populate({
                    path: "destinationHubId",
                    select: "hubName hubCode",
                })
                .populate({
                    path: "currentHubId",
                    select: "hubName hubCode",
                })
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            // -----------------------------------------
            // Total filtered records
            // -----------------------------------------

            Shipment.countDocuments(filter),

            // -----------------------------------------
            // Status-wise Counts
            // -----------------------------------------

            Shipment.aggregate([
                {
                    $match: countFilter,
                },
                {
                    $group: {
                        _id: "$currentStatus",
                        count: {
                            $sum: 1,
                        },
                    },
                },
            ]),
        ]);

        // -----------------------------------------
        // 7. Transform Status Counts
        // -----------------------------------------

        let totalCount = 0;

        const statusWiseCounts: Record<string, number> = {};

        statusCountsRaw.forEach((item: any) => {
            if (item._id) {
                statusWiseCounts[item._id] = item.count;

                totalCount += item.count;
            }
        });

        // -----------------------------------------
        // 8. Fetch Order Details
        // -----------------------------------------

        const shipmentData = await Promise.all(
            shipments.map(async (shipment: any) => {
                let orderDetails = null;

                try {
                    orderDetails = await getOrderItemDetails(
                        shipment.orderId,
                        shipment.orderItemId
                    );
                } catch (err) {
                    console.error(
                        `Failed to fetch order details for shipment ${shipment._id}`,
                        err
                    );
                }

                return {
                    ...shipment,
                    inspection: shipment.inspection,
                    orderDetails,
                };
            })
        );

        // -----------------------------------------
        // 9. Pagination Metadata
        // -----------------------------------------

        const totalPages = Math.ceil(totalFilteredRecords / limit) || 1;

        // -----------------------------------------
        // 10. Return Response
        // -----------------------------------------

        return {
            shipments: shipmentData,

            counts: {
                totalCount,
                ...statusWiseCounts,
            },

            meta: {
                totalRecords: totalFilteredRecords,

                totalPages,

                currentPage: page,

                limit,

                hasMore: page < totalPages,
            },
        };
    } catch (error) {
        throw error;
    }
};

export const updateShipmentStatusService = async (payload: UpdateShipmentStatusPayload) => {
    try {
        const { shipmentId, status, event, remarks, agentId, hubId, updatedBy } = payload;

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

        const allowedStatuses = SHIPMENT_STATUS_TRANSITIONS[shipment.currentStatus];

        if (!allowedStatuses?.includes(status)) {
            const error: any = new Error(
                `Shipment cannot move from "${shipment.currentStatus}" to "${status}".`
            );

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // =====================================================
        // 7. Validate Agent Exists
        // =====================================================

        if (agentId) {
            const agent = await hubEmployee
                .findOne({
                    _id: agentId,
                    role: HubEmployeeRole.AGENT,
                    // isActive: true,
                })
                .lean();

            if (!agent) {
                const error: any = new Error("Agent not found or inactive.");

                error.statusCode = StatusCode.Not_Found;

                throw error;
            }
        }

        // =====================================================
        // 8. Normalize IDs
        // =====================================================

        const normalizedAgentId = agentId
            ? new mongoose.Types.ObjectId(agentId)
            : (shipment.currentAgentId ?? null);

        const normalizedHubId = hubId
            ? new mongoose.Types.ObjectId(hubId)
            : (shipment.currentHubId ?? null);

        const normalizedUpdatedBy = new mongoose.Types.ObjectId(updatedBy);

        // =====================================================
        // 9. Agent Validation
        // =====================================================

        if (status === ShipmentStatus.PICKUP_ASSIGNED && !agentId) {
            const error: any = new Error("Pickup Agent Id is required.");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        if (status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED && !agentId) {
            const error: any = new Error("Delivery Agent Id is required.");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // =====================================================
        // 10. Hub Validation
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
            const error: any = new Error("Hub Id is required.");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // =====================================================
        // 11. PICKUP ASSIGNED
        // =====================================================

        if (status === ShipmentStatus.PICKUP_ASSIGNED) {
            try {
                const orderItemStatus =
                    shipment.shipmentType === ShipmentType.RETURN
                        ? "return_in_progress"
                        : "shipped";

                await updateOrderItemStatus(
                    shipment.orderId.toString(),
                    shipment.orderItemId.toString(),
                    orderItemStatus
                );
            } catch (apiError: any) {
                console.error(
                    `Order service synchronization failed for shipment: ${shipmentId}`,
                    apiError.message
                );

                const error: any = new Error(
                    "Failed to synchronize shipment state updates with the Order Service."
                );

                error.statusCode = StatusCode.Internal_Server_Error;

                throw error;
            }
        }

        // =====================================================
        // 12. ARRIVED AT ORIGIN HUB
        // =====================================================

        if (status === ShipmentStatus.ARRIVED_AT_ORIGIN_HUB) {
            // -------------------------------------------------
            // Validate Origin Hub
            // -------------------------------------------------

            if (!shipment.originHubId) {
                const error: any = new Error("Origin Hub Id is missing in shipment.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // -------------------------------------------------
            // Validate Destination Hub
            // -------------------------------------------------

            if (!shipment.destinationHubId) {
                const error: any = new Error("Destination Hub Id is missing in shipment.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // -------------------------------------------------
            // Add ARRIVED_AT_ORIGIN_HUB
            // -------------------------------------------------

            shipment.currentStatus = ShipmentStatus.ARRIVED_AT_ORIGIN_HUB;

            shipment.currentHubId = shipment.originHubId;

            shipment.currentAgentId = normalizedAgentId;

            shipment.journeyDetails.push({
                event: event || "Shipment arrived at origin hub",

                status: ShipmentStatus.ARRIVED_AT_ORIGIN_HUB,

                hubId: shipment.originHubId,

                agentId: normalizedAgentId,

                remarks: remarks || "",

                updatedBy: normalizedUpdatedBy,

                eventAt: new Date(),
            });

            // -------------------------------------------------
            // Check Same Hub
            // -------------------------------------------------

            const isSameHub =
                shipment.originHubId.toString() === shipment.destinationHubId.toString();

            // -------------------------------------------------
            // Different Hub
            // -------------------------------------------------

            if (!isSameHub) {
                await shipment.save();

                return shipment;
            }

            // =================================================
            // SAME HUB
            // =================================================

            shipment.currentStatus = ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;

            shipment.currentHubId = shipment.destinationHubId;

            shipment.currentAgentId = null;

            shipment.journeyType = JourneyType.DELIVERY;

            shipment.journeyDetails.push({
                event: event || "Arrived At Hub",

                status: ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,

                hubId: shipment.destinationHubId,

                agentId: null,

                remarks:
                    "Origin hub and destination hub are the same. Shipment automatically moved from origin hub to destination hub.",

                updatedBy: normalizedUpdatedBy,

                eventAt: new Date(),
            });

            await shipment.save();

            return shipment;
        }

        // =====================================================
        // 13. ARRIVED AT DESTINATION HUB
        // =====================================================

        if (status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB) {
            if (!shipment.destinationHubId) {
                const error: any = new Error("Destination Hub Id is missing in shipment.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            shipment.currentStatus = ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;

            shipment.currentHubId = shipment.destinationHubId;

            shipment.currentAgentId = null;

            shipment.journeyType = JourneyType.DELIVERY;

            shipment.journeyDetails.push({
                event: event || "Shipment arrived at destination hub",

                status: ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,

                hubId: shipment.destinationHubId,

                agentId: null,

                remarks: remarks || "",

                updatedBy: normalizedUpdatedBy,

                eventAt: new Date(),
            });

            await shipment.save();

            return shipment;
        }

        // =====================================================
        // 14. DELIVERY AGENT ASSIGNED
        // =====================================================

        if (status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED) {
            if (!agentId) {
                const error: any = new Error("Delivery Agent Id is required.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            shipment.currentAgentId = normalizedAgentId;

            shipment.journeyType = JourneyType.DELIVERY;
        }

        // =====================================================
        // 15. OUT FOR DELIVERY
        // =====================================================

        if (status === ShipmentStatus.OUT_FOR_DELIVERY ) {
            if (!agentId && !shipment.currentAgentId) {
                const error: any = new Error("Delivery Agent Id is required.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }
            if(shipment.shipmentType === ShipmentType.FORWARD){
                
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

                error.statusCode = StatusCode.Internal_Server_Error;

                throw error;
            }
            }
        }

        // =====================================================
        // 16. DELIVERED
        // =====================================================

        if (status === ShipmentStatus.DELIVERED) {
            try {
                const orderItemStatus =
                    shipment.shipmentType === ShipmentType.RETURN
                        ? "returned"
                        : "delivered";

                await updateOrderItemStatus(
                    shipment.orderId.toString(),
                    shipment.orderItemId.toString(),
                    orderItemStatus
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
        // 17. NORMAL STATUS UPDATE
        // =====================================================

        shipment.currentStatus = status;

        if (agentId) {
            shipment.currentAgentId = normalizedAgentId ?? undefined;
        }

        if (hubId) {
            shipment.currentHubId = normalizedHubId ?? undefined;
        }

        // =====================================================
        // 18. Add Journey Entry
        // =====================================================

        shipment.journeyDetails.push({
            event,
            status,

            hubId: shipment.currentHubId ?? normalizedHubId,

            agentId: shipment.currentAgentId ?? normalizedAgentId,

            remarks: remarks || "",

            updatedBy: normalizedUpdatedBy,

            eventAt: new Date(),
        });

        // =====================================================
        // 19. Save Shipment
        // =====================================================

        await shipment.save();

        if (
            status === ShipmentStatus.DELIVERED &&
            shipment.shipmentType === ShipmentType.RETURN
        ) {
            const condition = shipment.inspection?.condition;

            if (!condition) {
                const error: any = new Error(
                    "Book inspection condition is missing. Cannot process refund."
                );

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            await triggerRefund(
                shipment.orderItemId.toString(),
                condition
            );

            await triggerSellerPayout(
                shipment.orderItemId.toString()
            );
        }

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
            // =====================================================
            // 1. Validate updatedBy
            // =====================================================

            if (!updatedBy || !mongoose.Types.ObjectId.isValid(updatedBy)) {
                const error: any = new Error("Invalid updatedBy.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // =====================================================
            // 2. Validate shipment IDs
            // =====================================================

            if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
                const error: any = new Error("shipmentIds must be a non-empty array.");

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            for (const shipmentId of shipmentIds) {
                if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
                    const error: any = new Error(`Invalid shipment ID: ${shipmentId}`);

                    error.statusCode = StatusCode.Bad_Request;

                    throw error;
                }
            }

            // =====================================================
            // 3. Validate requested status
            // =====================================================

            if (!Object.values(ShipmentStatus).includes(status)) {
                const error: any = new Error(`Invalid shipment status: ${status}`);

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // =====================================================
            // 4. Check whether agent is required
            // =====================================================

            const requiresAgent =
                status === ShipmentStatus.PICKUP_ASSIGNED ||
                status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED;

            if (requiresAgent && !agentId) {
                const error: any = new Error(
                    `agentId is required when changing shipment status to "${status}".`
                );

                error.statusCode = StatusCode.Bad_Request;

                throw error;
            }

            // =====================================================
            // 5. Validate Agent
            // =====================================================

            let agent: any = null;

            if (agentId) {
                // ---------------------------------------------
                // Validate Agent ID
                // ---------------------------------------------

                if (!mongoose.Types.ObjectId.isValid(agentId)) {
                    const error: any = new Error("Invalid agentId.");

                    error.statusCode = StatusCode.Bad_Request;

                    throw error;
                }

                // ---------------------------------------------
                // Find Agent from HubEmployee
                // ---------------------------------------------

                agent = await hubEmployee
                    .findOne({
                        _id: agentId,

                        // Only Agent
                        role: HubEmployeeRole.AGENT,

                        // Only active agents
                        // isActive: true,

                        // Agent must be available
                        isAvailable: true,
                    })
                    .session(session);

                if (!agent) {
                    const error: any = new Error("Agent not found or agent is not available.");

                    error.statusCode = StatusCode.Not_Found;

                    throw error;
                }
            }

            // =====================================================
            // 6. Process every shipment
            // =====================================================

            for (const shipmentId of shipmentIds) {
                const shipment: any = await Shipment.findById(shipmentId).session(session);

                if (!shipment) {
                    const error: any = new Error(`Shipment ${shipmentId} not found.`);

                    error.statusCode = StatusCode.Not_Found;

                    throw error;
                }

                // =================================================
                // 7. Get CURRENT status
                // =================================================

                const currentStatus = shipment.currentStatus as ShipmentStatus;

                // =================================================
                // 8. Validate transition
                // =================================================

                const allowedStatuses = SHIPMENT_STATUS_TRANSITIONS[currentStatus];

                if (!allowedStatuses?.includes(status)) {
                    const error: any = new Error(
                        `Shipment ${shipment.awbNumber || shipment._id
                        } cannot move from "${currentStatus}" to "${status}".`
                    );

                    error.statusCode = StatusCode.Bad_Request;

                    throw error;
                }

                // =================================================
                // 9. Validate Agent belongs to required Hub
                // =================================================

                if (agentId && agent) {
                    let requiredHubId = shipment.currentHubId;

                    // ---------------------------------------------
                    // Delivery Agent
                    // ---------------------------------------------

                    if (
                        status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED ||
                        status === ShipmentStatus.OUT_FOR_DELIVERY
                    ) {
                        requiredHubId = shipment.destinationHubId;
                    }

                    // ---------------------------------------------
                    // Pickup Agent
                    // ---------------------------------------------

                    if (status === ShipmentStatus.PICKUP_ASSIGNED) {
                        requiredHubId = shipment.originHubId;
                    }

                    // ---------------------------------------------
                    // Validate Agent Hub
                    // ---------------------------------------------

                    if (
                        requiredHubId &&
                        agent.hubId &&
                        requiredHubId.toString() !== agent.hubId.toString()
                    ) {
                        const error: any = new Error(
                            `Agent ${agent.fullName} does not belong to the required hub for shipment ${shipment.awbNumber || shipment._id
                            }.`
                        );

                        error.statusCode = StatusCode.Bad_Request;

                        throw error;
                    }

                    // =============================================
                    // Assign Agent
                    // =============================================

                    shipment.currentAgentId = agent._id;

                    // =============================================
                    // Maintain Agent History
                    // =============================================

                    const agentAlreadyExists = shipment.agentIds.some(
                        (id: mongoose.Types.ObjectId) => id.toString() === agent._id.toString()
                    );

                    if (!agentAlreadyExists) {
                        shipment.agentIds.push(agent._id);
                    }
                }

                // =================================================
                // 10. OUT FOR DELIVERY
                // =================================================

                if (status === ShipmentStatus.OUT_FOR_DELIVERY) {
                    if (!shipment.currentAgentId) {
                        const error: any = new Error(
                            `Delivery Agent is required for shipment ${shipment.awbNumber || shipment._id
                            }.`
                        );

                        error.statusCode = StatusCode.Bad_Request;

                        throw error;
                    }
                    if (shipment.shipmentType === ShipmentType.FORWARD) {
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
                                "Failed to synchronize shipment state with the Order Service."
                            );

                            error.statusCode = StatusCode.Internal_Server_Error;

                            throw error;
                        }
                    }
                }

                // =================================================
                // 11. PICKUP ASSIGNED
                // =================================================

                if (status === ShipmentStatus.PICKUP_ASSIGNED) {
                    try {
                        const orderItemStatus =
                            shipment.shipmentType === ShipmentType.RETURN
                                ? "return_in_progress"
                                : "shipped";

                        await updateOrderItemStatus(
                            shipment.orderId.toString(),
                            shipment.orderItemId.toString(),
                            orderItemStatus
                        );
                    } catch (apiError: any) {
                        console.error(
                            `Order service synchronization failed for shipment: ${shipmentId}`,
                            apiError.message
                        );

                        const error: any = new Error(
                            "Failed to synchronize shipment state with the Order Service."
                        );

                        error.statusCode = StatusCode.Internal_Server_Error;

                        throw error;
                    }
                }

                // =================================================
                // 12. Update Journey Type
                // =================================================

                if (
                    status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB ||
                    status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED ||
                    status === ShipmentStatus.OUT_FOR_DELIVERY
                ) {
                    shipment.journeyType = JourneyType.DELIVERY;
                }

                // =================================================
                // 13. Update Current Hub
                // =================================================

                if (status === ShipmentStatus.ARRIVED_AT_ORIGIN_HUB) {
                    shipment.currentHubId = shipment.originHubId;
                }

                if (status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB) {
                    shipment.currentHubId = shipment.destinationHubId;
                }

                // =================================================
                // 14. Maintain Hub History
                // =================================================

                if (shipment.currentHubId) {
                    const hubExists = shipment.hubIds.some(
                        (id: mongoose.Types.ObjectId) =>
                            id.toString() === shipment.currentHubId.toString()
                    );

                    if (!hubExists) {
                        shipment.hubIds.push(shipment.currentHubId);
                    }
                }

                // =================================================
                // 15. Clear Agent at Destination Hub
                // =================================================

                if (status === ShipmentStatus.ARRIVED_AT_DESTINATION_HUB) {
                    shipment.currentAgentId = null;
                }

                // =================================================
                // 16. Update Shipment Status
                // =================================================

                shipment.currentStatus = status;

                // =================================================
                // 17. Add Journey History
                // =================================================

                shipment.journeyDetails.push({
                    event: status,

                    status,

                    hubId: shipment.currentHubId || null,

                    agentId: shipment.currentAgentId || null,

                    remarks: remarks || "",

                    updatedBy: new mongoose.Types.ObjectId(updatedBy),

                    eventAt: new Date(),
                });

                // =================================================
                // 18. Save Shipment
                // =================================================

                await shipment.save({
                    session,
                });

                updatedShipments.push(shipment);
            }
        });

        // =====================================================
        // 19. Return Response
        // =====================================================

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

export const deleteShipmentService = async (shipmentId: string) => {
    try {
        if (!shipmentId) {
            const error: any = new Error("shipmentId is required.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
            const error: any = new Error("Invalid shipmentId.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        const shipment = await Shipment.findById(shipmentId);

        if (!shipment) {
            const error: any = new Error("Shipment not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        await Shipment.deleteOne({ _id: shipmentId });

        return {
            success: true,
            message: "Shipment deleted successfully.",
        };
    } catch (error) {
        throw error;
    }
};

export const getShipmentStatuseByAwbNumberService = async (awbNumber: string) => {
    try {
        const shipment = await Shipment.findOne({ awbNumber })
            .populate({
                path: "currentAgentId",
                select: "agentId fullName phoneNumber email vehicleType status currentLocation",
            })
            .lean();

        if (!shipment) {
            const error: any = new Error("Shipment not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        const currentAgent = shipment.currentAgentId as any;
        console.log("cuurent agent id ", currentAgent);
        return {
            shipmentId: shipment._id,
            awbNumber: shipment.awbNumber,

            currentStatus: shipment.currentStatus,

            pickupAgent: currentAgent
                ? {
                    _id: currentAgent._id,
                    agentId: currentAgent.agentId,
                    fullName: currentAgent.fullName,
                    phone: currentAgent.phoneNumber,
                    vehicleType: currentAgent.vehicleType,
                }
                : null,

            journeyDetails: shipment.journeyDetails.map((item: any) => ({
                event: item.event,
                status: item.status,
                eventAt: item.eventAt,
            })),
        };
    } catch (error) {
        throw error;
    }
};
