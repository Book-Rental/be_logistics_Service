import { Router } from "express";
import agentRoutes from "./agentRoutes";
import hubRoutes from "./hubRoutes";
import authRoutes from "./authRoutes";
import shipmentRoutes from "./shipmentRoutes";
import employeeRoutes from "./employeeRoutes";
import bookinspectionRoutes from "./bookinspectionRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/agent", agentRoutes);
router.use("/hub", hubRoutes);
router.use("/shipment", shipmentRoutes);
router.use("/employee", employeeRoutes);
router.use("/book-inspection", bookinspectionRoutes);

export default router;
