import Bag, { BagStatus } from "../models/Bag";
import Shipment, { JourneyEventType, JourneyType, ShipmentStatus } from "../models/shipment";
import Hub from "../models/hub";
import mongoose from "mongoose";
import HubEmployee, { HubEmployeeStatus } from "../models/HubEmployee";

const bagShipmentStatusMap: Partial<
    Record<BagStatus, ShipmentStatus>
> = {
    [BagStatus.SEALED]: ShipmentStatus.SORTING_COMPLETED,

    [BagStatus.IN_TRANSIT]: ShipmentStatus.IN_TRANSIT,

    [BagStatus.ARRIVED]: ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,
};

interface CreateBagInput {
    fromHubId: string;
    toHubId: string;
}

export const createBag = async ({
    fromHubId,
    toHubId,
}: CreateBagInput) => {
    const bagId = `BAG-${Date.now()}`;

    const bag = await Bag.create({
        bagId,
        fromHubId,
        toHubId,
        shipmentIds: [],
    });

    return bag;
};

export const addShipmentsToBag = async (
    bagId: string,
    shipmentIds: string[]
) => {
    const bag = await Bag.findOne({ bagId });

    if (!bag) {
        throw new Error("Bag not found");
    }

    if (bag.status !== "CREATED") {
        throw new Error(
            "Shipments can only be added to a bag in CREATED status"
        );
    }

    if (!shipmentIds || shipmentIds.length === 0) {
        throw new Error("At least one shipmentId is required");
    }

    const fromHub = await Hub.findOne({
        hubId: bag.fromHubId,
    });

    if (!fromHub) {
        throw new Error("Source hub not found");
    }

    const shipments = await Shipment.find({
        _id: { $in: shipmentIds },
    });

    if (shipments.length !== shipmentIds.length) {
        throw new Error("One or more shipments not found");
    }

    for (const shipment of shipments) {
        if (
            !shipment.currentHubId ||
            shipment.currentHubId.toString() !== fromHub._id.toString()
        ) {
            throw new Error(
                `Shipment ${shipment._id} is not currently at source hub`
            );
        }
    }

    const bagWithShipment = await Bag.findOne({
        bagId: { $ne: bag.bagId },
        status: { $ne: BagStatus.RELEASED },
        shipmentIds: { $in: shipmentIds },
    });

    if (bagWithShipment) {
        const clashId = bagWithShipment.shipmentIds
            .map((id) => id.toString())
            .find((id) => shipmentIds.includes(id));

        throw new Error(
            `Shipment ${clashId} is already in bag ${bagWithShipment.bagId}`
        );
    }

    const existingShipmentIds = bag.shipmentIds.map(
        (id) => id.toString()
    );

    const newShipmentIds = shipments
        .filter(
            (shipment) =>
                !existingShipmentIds.includes(shipment._id.toString())
        )
        .map((shipment) => shipment._id);

    if (newShipmentIds.length === 0) {
        throw new Error("All shipments are already in this bag");
    }

    bag.shipmentIds.push(...newShipmentIds);

    await bag.save();

    return bag;
};

export const verifyShipmentInBag = async (
    bagId: string,
    shipmentId: string
) => {
    const bag = await Bag.findOne({ bagId });

    if (!bag) {
        throw new Error("Bag not found");
    }

    if (bag.status !== BagStatus.OPENED) {
        throw new Error(
            "Bag must be OPENED before verifying shipments"
        );
    }

    const shipmentBelongsToBag = bag.shipmentIds.some(
        (id) => id.toString() === shipmentId
    );

    if (!shipmentBelongsToBag) {
        throw new Error(
            "This shipment does not belong to the bag"
        );
    }

    const alreadyVerified = bag.verifiedShipmentIds.some(
        (id) => id.toString() === shipmentId
    );

    if (alreadyVerified) {
        throw new Error(
            "Shipment is already verified in this bag"
        );
    }

    bag.verifiedShipmentIds.push(
        new mongoose.Types.ObjectId(shipmentId)
    );

    await bag.save();

    return bag;
};

export const updateBagStatus = async (
    bagId: string,
    status: BagStatus,
    assignedAgentId?: string
) => {
    const bag = await Bag.findOne({ bagId });

    if (!bag) {
        throw new Error("Bag not found");
    }

    const validTransitions: Record<BagStatus, BagStatus[]> = {
        [BagStatus.CREATED]: [BagStatus.SEALED],

        [BagStatus.SEALED]: [BagStatus.ASSIGNED],

        [BagStatus.ASSIGNED]: [BagStatus.IN_TRANSIT],

        [BagStatus.IN_TRANSIT]: [BagStatus.ARRIVED],

        [BagStatus.ARRIVED]: [BagStatus.RECEIVED],

        [BagStatus.RECEIVED]: [BagStatus.OPENED],

        [BagStatus.OPENED]: [],

        [BagStatus.VERIFIED]: [BagStatus.RELEASED],

        [BagStatus.RELEASED]: [],
    };

    const allowedStatuses = validTransitions[bag.status];

    if (!allowedStatuses.includes(status)) {
        throw new Error(
            `Cannot change bag status from ${bag.status} to ${status}`
        );
    }

    if (status === BagStatus.ASSIGNED && !assignedAgentId) {
        throw new Error(
            "assignedAgentId is required when assigning the bag"
        );
    }

    if (status === BagStatus.ASSIGNED) {
        bag.assignedAgentId = assignedAgentId as any;
    }

    const shipmentStatus = bagShipmentStatusMap[status];

    if (shipmentStatus && bag.shipmentIds.length > 0) {
        const shipments = await Shipment.find({
            _id: { $in: bag.shipmentIds },
        });

        if (shipments.length !== bag.shipmentIds.length) {
            throw new Error(
                "One or more shipments in the bag could not be found"
            );
        }

        for (const shipment of shipments) {

            shipment.currentStatus = shipmentStatus;

            if (status === BagStatus.SEALED) {
                shipment.currentAgentId = null;
            }

            if (status === BagStatus.ARRIVED) {
                const destinationHub = await Hub.findOne({
                    hubId: bag.toHubId,
                });

                if (destinationHub) {
                    shipment.currentHubId = destinationHub._id;
                }
                shipment.journeyType = JourneyType.DELIVERY;

                shipment.currentAgentId = null;
            }

            let journeyEvent: JourneyEventType;

            switch (status) {
                case BagStatus.SEALED:
                    journeyEvent = JourneyEventType.SORTING_COMPLETED;
                    break;

                case BagStatus.IN_TRANSIT:
                    journeyEvent = JourneyEventType.TRIP_STARTED;
                    break;

                case BagStatus.ARRIVED:
                    journeyEvent = JourneyEventType.ARRIVED_AT_HUB;
                    break;

                default:
                    continue;
            }

            shipment.journeyDetails.push({
                event: journeyEvent,
                status: shipmentStatus,
                hubId: shipment.currentHubId || null,
                tripId: null,
                agentId:
                    status === BagStatus.SEALED
                        ? null
                        : bag.assignedAgentId || null,
                remarks: `Shipment status updated due to bag ${bag.bagId} status change to ${status}.`,
                updatedBy: null,
                eventAt: new Date(),
            });

            await shipment.save();
        }
    }

    bag.status = status;

    switch (status) {
        case BagStatus.SEALED:
            bag.sealedAt = new Date();
            break;

        case BagStatus.IN_TRANSIT:
            bag.dispatchedAt = new Date();
            break;

        case BagStatus.ARRIVED:
            bag.arrivedAt = new Date();
            break;

        case BagStatus.RECEIVED:
            bag.receivedAt = new Date();
            break;

        case BagStatus.RELEASED:
            bag.releasedAt = new Date();

            if (bag.assignedAgentId) {
                await HubEmployee.findByIdAndUpdate(
                    bag.assignedAgentId,
                    {
                        status: HubEmployeeStatus.ACTIVE,
                        isAvailable: true,
                        currentShipmentId: null,
                    }
                );
            }

            bag.assignedAgentId = undefined;

            break;
    }

    await bag.save();

    return bag;
};

export const completeBagVerification = async (
    bagId: string
) => {
    const bag = await Bag.findOne({ bagId });

    if (!bag) {
        throw new Error("Bag not found");
    }

    if (bag.status !== BagStatus.OPENED) {
        throw new Error(
            "Bag must be OPENED before completing verification"
        );
    }

    const totalShipments = bag.shipmentIds.length;
    const verifiedShipments = bag.verifiedShipmentIds.length;

    if (totalShipments === 0) {
        throw new Error(
            "No shipments found in this bag"
        );
    }

    if (verifiedShipments !== totalShipments) {
        throw new Error(
            `Verification incomplete. ${verifiedShipments} of ${totalShipments} shipments verified`
        );
    }

    bag.status = BagStatus.VERIFIED;

    await bag.save();

    return bag;
};

export const verifyScannedShipmentInBag = async (
    bagId: string,
    awbNumber: string
) => {
    const shipment = await Shipment.findOne({ awbNumber })
        .select("_id awbNumber")
        .lean();

    if (!shipment) {
        throw new Error("Shipment not found for this AWB number");
    }

    // Reuse the existing bag verification logic.
    const bag = await verifyShipmentInBag(
        bagId,
        shipment._id.toString()
    );

    return {
        awbNumber: shipment.awbNumber,
        shipmentId: shipment._id,
        bag,
    };
};
