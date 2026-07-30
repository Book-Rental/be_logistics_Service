import { JourneyEventType, PaymentMode, ShipmentStatus, ShipmentType } from "../models/shipment";
import Hub from "../models/hub";
import Shipment from "../models/shipment";
import { generateShipmentDetails } from "../utils/shipmentFunction";
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

    originHubId: string;
    destinationHubId: string;

    shipmentType?: ShipmentType;

    paymentMode?: PaymentMode;
    codAmount?: number;

    expectedDeliveryDate?: Date;

    createdBy: string;
}

export const createShipmentService = async (payload: CreateShipmentPayload) => {
    const {
        orderId,
        orderItemId,
        sellerId,
        buyerId,
        sender,
        receiver,
        originHubId,
        destinationHubId,
        shipmentType = ShipmentType.FORWARD,
        paymentMode = PaymentMode.PREPAID,
        codAmount = 0,
        expectedDeliveryDate,
        createdBy,
    } = payload;

    // Prevent duplicate shipment for the same order item
    const existingShipment = await Shipment.findOne({ orderItemId });

    if (existingShipment) {
        throw new Error("Shipment already exists for this order item.");
    }

    // Validate Origin Hub
    const originHub = await Hub.findById(originHubId);

    if (!originHub) {
        throw new Error("Origin hub not found.");
    }

    // Validate Destination Hub
    const destinationHub = await Hub.findById(destinationHubId);

    if (!destinationHub) {
        throw new Error("Destination hub not found.");
    }

    // Generate Shipment Number & AWB
    const { awbNumber } = await generateShipmentDetails();

    // Create Shipment
    const shipment = await Shipment.create({
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

        originHubId,
        destinationHubId,

        currentHubId: originHubId,
        currentStatus: ShipmentStatus.CREATED,

        expectedDeliveryDate,

        createdBy,

        journeyDetails: [
            {
                event: JourneyEventType.SHIPMENT_CREATED,
                status: ShipmentStatus.CREATED,

                hubId: originHubId,

                remarks: "Shipment created successfully.",

                updatedBy: createdBy,
                eventAt: new Date(),
            },
        ],
    });

    return shipment;
};
