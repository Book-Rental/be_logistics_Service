import Shipment, { InspectionStatus, JourneyEventType, ShipmentStatus, } from "../models/shipment";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

export const createBookInspection = async (
    shipmentId: string,
    inspectionData: any,
    files: Express.Multer.File[] = []
) => {
    const {
        inspectedBy,
        condition,
        inspectionStatus,
        notes,
    } = inspectionData;

    // 1. Find shipment using shipment ID
    const shipment = await Shipment.findById(shipmentId);

    if (!shipment) {
        throw new Error("Shipment not found");
    }

    // 2. Inspection is allowed only for Pickup Assigned
    if (
        shipment.currentStatus !==
        ShipmentStatus.OUT_FOR_PICKUP
    ) {
        throw new Error(
            `Inspection is allowed only when shipment status is "${ShipmentStatus.OUT_FOR_PICKUP}"`
        );
    }

    // 3. Only assigned pickup agent can inspect
    if (
        !shipment.currentAgentId ||
        shipment.currentAgentId.toString() !==
        inspectedBy.toString()
    ) {
        throw new Error(
            "Only the assigned pickup agent can perform the inspection"
        );
    }

    // 4. Upload inspection images
    const imageUrls: string[] = [];

    for (const file of files) {
        const imageUrl = await uploadToCloudinary(
            file.buffer,
            "book-rental/InspectionOfBOok",
            file.originalname
        );

        imageUrls.push(imageUrl);
    }

    // 5. Save inspection details
    shipment.inspection = {
        condition,
        inspectionStatus:
            inspectionStatus ||
            InspectionStatus.COMPLETED,
        inspectedBy,
        inspectedAt: new Date(),
        notes: notes || "",
        images: imageUrls,
    };

    // 6. Add inspection journey event
    shipment.journeyDetails.push({
        event: JourneyEventType.INSPECTION_COMPLETED,

        status: ShipmentStatus.PICKUP_ASSIGNED,

        hubId:
            shipment.currentHubId ||
            shipment.originHubId,

        tripId: shipment.currentTripId || null,

        agentId: inspectedBy,

        remarks: `Book inspection completed. Condition: ${condition}`,

        updatedBy: inspectedBy,

        eventAt: new Date(),
    });

    // 7. Inspection completed → Pickup completed
    shipment.currentStatus =
        ShipmentStatus.PICKUP_COMPLETED;

    // 8. Add Pickup Completed journey event
    shipment.journeyDetails.push({
        event: JourneyEventType.PICKUP_COMPLETED,

        status: ShipmentStatus.PICKUP_COMPLETED,

        hubId:
            shipment.currentHubId ||
            shipment.originHubId,

        tripId: shipment.currentTripId || null,

        agentId: inspectedBy,

        remarks:
            "Pickup completed after book inspection.",

        updatedBy: inspectedBy,

        eventAt: new Date(),
    });

    // 9. Save shipment
    await shipment.save();

    return {
        shipment,
    };
};

export const triggerRefund = async (
    orderItemId: string,
    condition: string
) => {
    const response = await fetch(
        `${process.env.ORDER_SERVICE_URL}/api/transaction/refund/${orderItemId}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                condition,
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message || "Failed to trigger refund"
        );
    }

    return data;
};
export const triggerSellerPayout = async (
    orderItemId: string
) => {
    const response = await fetch(
        `${process.env.ORDER_SERVICE_URL}/api/transaction/seller-payout/${orderItemId}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message || "Failed to trigger seller payout"
        );
    }

    return data;
};