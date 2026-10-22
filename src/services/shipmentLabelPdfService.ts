import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { getShipmentLabelDataService } from "./shipmentLabelService";

export const generateShipmentLabelPdfService = async (
    awbNumber: string
): Promise<Buffer> => {
    const data = await getShipmentLabelDataService(awbNumber);

    const doc = new PDFDocument({
        size: [288, 432], // 4 × 6 inch shipping label
        margin: 18,
        bufferPages: false,
    });

    const chunks: Buffer[] = [];

    const pdfBuffer = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    const left = 18;
    const right = 252;
    let y = 18;

    doc.font("Helvetica-Bold").fontSize(15)
        .text("PARCEL SHIPPING LABEL", left, y, {
            width: right - left,
            align: "center",
        });

    y += 28;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 10;

    doc.font("Helvetica-Bold").fontSize(11)
        .text("AWB NUMBER", left, y);

    y += 16;
    doc.fontSize(16).text(data.awbNumber, left, y);
    y += 28;

    const barcode = await bwipjs.toBuffer({
        bcid: "code128",
        text: data.awbNumber,
        scale: 2,
        height: 12,
        includetext: true,
        textxalign: "center",
    });

    doc.image(barcode, left, y, { width: 234, height: 48 });
    y += 58;

    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 8;

    const writeAddress = (
        heading: string,
        person: typeof data.sender
    ) => {
        doc.font("Helvetica-Bold").fontSize(11).text(heading, left, y);
        y += 16;

        doc.font("Helvetica-Bold").fontSize(10)
            .text(person.name || "-", left, y, { width: 234 });
        y += 14;

        doc.font("Helvetica").fontSize(9)
            .text(
                [
                    person.addressLine1,
                    person.addressLine2,
                    person.city,
                    person.state,
                    person.pincode,
                    person.country,
                ].filter(Boolean).join(", "),
                left,
                y,
                { width: 234 }
            );

        y = doc.y + 6;

        doc.fontSize(9).text(`Phone: ${person.phone || "-"}`, left, y);
        y += 18;
    };

    writeAddress("FROM / SENDER", data.sender);
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 8;

    writeAddress("TO / RECEIVER", data.receiver);

    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 8;

    const qrContent = `${process.env.BACKEND_BASE_URL}/api/shipment/scan/${data.awbNumber}`;

    const qrBuffer = await QRCode.toBuffer(qrContent, {
        type: "png",
        width: 150,
        margin: 2,
    });

    const qrSize = 90;
    const pageHeight = doc.page.height;
    const bottomMargin = 18;

    if (y + qrSize > pageHeight - bottomMargin) {
        y = pageHeight - bottomMargin - qrSize;
    }

    doc.image(qrBuffer, (doc.page.width - qrSize) / 2, y, {
        width: qrSize,
        height: qrSize,
    });

    doc.end();

    return pdfBuffer;
};
