import mongoose from "mongoose";
import {
    JourneyEventType,
    JourneyType,
    PaymentMode,
    ShipmentStatus,
    ShipmentType,
} from "../models/shipment";
import { findHubByPincode } from "./hubService";
import { CreateShipmentPayload } from "./shipmentService";
import Shipment from "../models/shipment";
import { generateProductionAWB } from "../utils/shipment";

export const createReturnShipmentService = async (payload: CreateShipmentPayload) => {
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
                            event: JourneyEventType.RETURN_SHIPMENT_CREATED,
                            status: ShipmentStatus.CREATED,
                            hubId: originHub._id,
                            agentId: null,
                            remarks: "Return Shipment  created successfully.",
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
