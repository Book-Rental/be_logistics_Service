import { Router } from "express";
import { createShipment, getShipmentByAgentId, getShipmentById, getShipmentByOrderItemId, readyForPickup, updateShipmentStatus } from "../controllers/shipmentController";

const router = Router();

router.post("/create", createShipment);
router.patch("/order-item/:orderItemId/ready-for-pickup", readyForPickup);
router.get(
    "/order-item/:orderItemId",
    getShipmentByOrderItemId
);
router.get('/:shipmentID', getShipmentById);
router.get('/agent/:agentId', getShipmentByAgentId);
router.patch(
    "/:shipmentId/status",
    updateShipmentStatus
);

export default router;
