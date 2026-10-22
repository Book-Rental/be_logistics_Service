import { Router } from "express";
import {
    assignAgentToShipments,
    createShipment,
    deleteShipment,
    downloadShipmentLabelPdf,
    getShipmentByAgentId,
    getShipmentById,
    getShipmentByOrderItemId,
    getShipmentLabel,
    getShipmentScanDetails,
    getShipmentStatusByAWBNumber,
    readyForPickup,
    updateShipmentStatus,
} from "../controllers/shipmentController";
import { createReturnShipment } from "../controllers/returnShipment";

const router = Router();

router.post("/create", createShipment);
router.post("/cretae-return-shipment", createReturnShipment);
router.patch("/order-item/:shipmentID/ready-for-pickup", readyForPickup);
router.get("/order-item/:orderItemId", getShipmentByOrderItemId);
router.get("/shipmentStatuse/:awbNumber", getShipmentStatusByAWBNumber);
router.get("/:awbNumber/label", getShipmentLabel);
router.get("/:awbNumber/label/pdf", downloadShipmentLabelPdf);
router.get(
    "/scan/:awbNumber",
    getShipmentScanDetails
);
router.get("/:shipmentID", getShipmentById);
router.get("/agent/:agentId", getShipmentByAgentId);
router.patch("/:shipmentId/status", updateShipmentStatus);
router.post("/bulk-update", assignAgentToShipments);
router.delete("/:shipmentId", deleteShipment);

export default router;
