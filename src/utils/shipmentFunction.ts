import Shipment from "../models/shipment";

export const generateShipmentDetails = async () => {
    const lastShipment = await Shipment.findOne()
        .sort({ createdAt: -1 })
        .select("shipmentId awbNumber");

    let nextSequence = 1;

    if (lastShipment?.shipmentId) {
        const match = lastShipment.shipmentId.match(/\d+$/);

        if (match) {
            nextSequence = Number(match[0]) + 1;
        }
    }
    const awbNumber = `AWB${String(nextSequence).padStart(10, "0")}`;

    return {
        awbNumber,
    };
};
