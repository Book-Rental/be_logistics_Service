import { Router } from "express";
import {
    createHub,
    getAllHubs,
    getHubByHubId,
    getShipmentsByHub,
} from "../controllers/hubController";

const router = Router();

router.get("/", getAllHubs);
router.get("/:hubId", getHubByHubId);
router.post("/create", createHub);
router.get("/shipment/:hubId", getShipmentsByHub);

export default router;
