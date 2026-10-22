import QRCode from "qrcode";
import Shipment from "../models/shipment";

export const getShipmentLabelDataService = async (awbNumber: string) => {
    const shipment = await Shipment.findOne({ awbNumber })
        .populate<{ originHubId: any; destinationHubId: any }>(
            "originHubId"
        )
        .populate<{ destinationHubId: any }>(
            "destinationHubId"
        )
        .lean();

    if (!shipment) {
        const error = new Error("Shipment not found.");
        Object.assign(error, { statusCode: 404 });
        throw error;
    }

    // The QR identifies the parcel without embedding customer details.
    const qrCodeDataUrl = await QRCode.toDataURL(awbNumber);

    return {
        awbNumber: shipment.awbNumber,
        sender: shipment.sender,
        receiver: shipment.receiver,
        originHub: shipment.originHubId,
        destinationHub: shipment.destinationHubId,
        shipmentType: shipment.shipmentType,
        paymentMode: shipment.paymentMode,
        qrCodeDataUrl,
    };
};