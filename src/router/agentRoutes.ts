import { Router } from "express";
import {
    createAgent,
    getAgentById,
    getAgnetByHubId,
    getAllAgents,
    updateAgent,
    deleteAgent,
} from "../controllers/agentController";
import upload from "../utils/upload";

const router = Router();

router.get("/", getAllAgents);
router.get("/:agentId", getAgentById);
router.get("/hub/:hubId", getAgnetByHubId);
router.post("/create", upload.single("profilePic"), createAgent);
router.patch("/:agentId", upload.single("profilePic"), updateAgent);
router.delete("/:agentId", deleteAgent);

export default router;
