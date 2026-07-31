import { Router } from "express";
import { createShipment, getShipmentByAgentId, getShipmentById, readyForPickup } from "../controllers/shipmentController";

const router = Router();

router.post("/create", createShipment);
router.patch("/order-item/:orderItemId/ready-for-pickup", readyForPickup);
router.get('/:shipmentID',getShipmentById);
router.get('/agent/:agentId',getShipmentByAgentId);

export default router;
