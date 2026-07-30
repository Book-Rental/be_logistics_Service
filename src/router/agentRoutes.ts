import { Router } from "express";
import {
    createAgent,
    getAgentById,
    getAgnetByHubId,
    getAllAgents,
    updateAgent,
    deleteAgent,
    getAgentShipments,
} from "../controllers/agentController";
import upload from "../utils/upload";

const router = Router();

router.get("/", getAllAgents);
router.get("/:agentId", getAgentById);
router.get("/hub/:hubId", getAgnetByHubId);
router.get("/shipments/:agentId", getAgentShipments);
router.post("/create", upload.single("photo"), createAgent);
router.patch("/:agentId", upload.single("photo"), updateAgent);
router.delete("/:agentId", deleteAgent);

export default router;
