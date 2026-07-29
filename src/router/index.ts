import { Router } from "express";

import agentRoutes from "./agentRoutes";
import hubRoutes from "./hubRoutes";
import authRoutes from "./authRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/agent", agentRoutes);
router.use("/hub", hubRoutes);

export default router;
