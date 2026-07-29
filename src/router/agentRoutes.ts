import { Router } from "express";
import {
    createAgent,
    getAgentById,
    getAgnetByHubId,
    getAllAgents,
} from "../controllers/agentController";
import upload from "../utils/upload";

const router = Router();

router.get("/", getAllAgents);
router.get("/:agentId", getAgentById);
router.get("/hub/:hubId", getAgnetByHubId);
router.post("/create", upload.single("profilePic"), createAgent);

export default router;
