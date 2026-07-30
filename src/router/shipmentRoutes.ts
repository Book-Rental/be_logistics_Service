import { Router } from "express";
import { createShipment } from "../controllers/shipmentController";

const router = Router();

router.post('/create', createShipment);

export default router

