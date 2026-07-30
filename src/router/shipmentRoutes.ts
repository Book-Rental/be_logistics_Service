import { Router } from "express";
import { createShipment, readyForPickup } from "../controllers/shipmentController";

const router = Router();

router.post("/create", createShipment);
router.patch("/order-item/:orderItemId/ready-for-pickup", readyForPickup);

export default router;
