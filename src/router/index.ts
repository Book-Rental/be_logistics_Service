import { Router } from "express";
import agentRoutes from "./agentRoutes";
import hubRoutes from "./hubRoutes";
import authRoutes from "./authRoutes";
import shipmentRoutes from "./shipmentRoutes";
import employeeRoutes from "./employeeRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/agent", agentRoutes);
router.use("/hub", hubRoutes);
router.use("/shipment", shipmentRoutes);
router.use("/employee", employeeRoutes);

export default router;
