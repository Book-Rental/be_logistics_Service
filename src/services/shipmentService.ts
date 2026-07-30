import { JourneyEventType, PaymentMode, ShipmentStatus, ShipmentType } from "../models/shipment";
import Hub from "../models/hub";
import Shipment from "../models/shipment";
import { generateShipmentDetails } from "../utils/shipmentFunction";
import { findHubByPincode } from "./hubService";
import mongoose from "mongoose";
import Agent, { AgentStatus } from "../models/Agent";
import { StatusCode } from "../utils/StatusCodes";
import { randomUUID } from "crypto";
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
    // 1. Initialize an atomic execution block channel
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

        // 2. Prevent duplicate shipment checks inside the transaction session
        const existingShipment = await Shipment.findOne({ orderItemId }).session(session).lean();
        if (existingShipment) {
            throw new Error("Shipment already exists for this order item.");
        }

        // 3. Validate Origin Hub mapping boundaries
        const originHub = await findHubByPincode(sender.pincode);
        if (!originHub) {
            throw new Error(`Origin hub not found for pincode: ${sender.pincode}`);
        }

        // 4. Validate Destination Hub mapping boundaries
        const destinationHub = await findHubByPincode(receiver.pincode);
        if (!destinationHub) {
            throw new Error(`Destination hub not found for pincode: ${receiver.pincode}`);
        }

        // 5. Generate tracking identifiers
        const awbNumber = `AWB-${randomUUID()}`;

        // 6. Create the Document using the array structure required for transactions
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
                    currentStatus: ShipmentStatus.CREATED,
                    expectedDeliveryDate,
                    createdBy,
                    journeyDetails: [
                        {
                            event: JourneyEventType.SHIPMENT_CREATED,
                            status: ShipmentStatus.CREATED,
                            hubId: originHub._id,
                            remarks: "Shipment created successfully.",
                            updatedBy: createdBy,
                            eventAt: new Date(),
                        },
                    ],
                },
            ],
            { session } // 🚀 Links creation process directly to the transaction session
        );

        // 7. If insertion runs successfully, commit the modifications down to your disk storage layer
        await session.commitTransaction();
        return shipment;
    } catch (error) {
        // ❌ Rollback: Instantly roll back and drop changes if any stage throws an exception
        await session.abortTransaction();
        throw error;
    } finally {
        // Cleanly close network listener channel
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
            }).session(session);

            if (!pickupAgent) {
                throw new Error("No pickup agent available for this hub.");
            }

            // Assign pickup agent
            shipment.pickUpAgentId = pickupAgent._id;
            shipment.currentAgentId = pickupAgent._id;

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
            pickupAgent.isAvailable = false;
            pickupAgent.status = AgentStatus.ON_DELIVERY;
            pickupAgent.currentShipmentId = shipment._id;

            await pickupAgent.save({ session });
            await shipment.save({ session });
        });

        return shipment;
    } finally {
        session.endSession();
    }
};
