import { Router } from "express";
import { createHub, getAllHubs, getHubByHubId } from "../controllers/hubController";

const router = Router();

router.get("/", getAllHubs);
router.get("/:hubId", getHubByHubId);
router.post("/create", createHub);

export default router;
