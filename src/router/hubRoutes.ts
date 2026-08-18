import { Router } from "express";
import {
    checkHubServiceability,
    createHub,
    getAllHubs,
    getHubByHubId,
    getShipmentsByHub,
    getShipmentsByReceiverZipCode,
} from "../controllers/hubController";

const router = Router();
// 1. Specific static routes (Place these first)
router.get("/check-serviceability", checkHubServiceability);
router.get("/", getAllHubs);

// 2. Specific nested routes (Place these before generic dynamic params)
router.get("/shipment/:hubId", getShipmentsByHub);
router.get("/shipment/bypincode/:hubId", getShipmentsByReceiverZipCode);

// 3. Generic dynamic parameter routes (Place these last)
router.get("/:hubId", getHubByHubId);

// 4. State-changing routes
router.post("/create", createHub);

export default router;
