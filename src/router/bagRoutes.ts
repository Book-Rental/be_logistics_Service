import { Router } from "express";

import { createBagController, addShipmentsToBagController, updateBagStatusController, verifyShipmentInBagController, completeBagVerificationController, verifyScannedShipmentInBagController, getAllBags, getBagById, } from "../controllers/bagController";

const router = Router();

router.post("/", createBagController);
router.post("/:bagId/shipments", addShipmentsToBagController);
router.patch("/:bagId/status", updateBagStatusController);
router.post("/verify-shipment", verifyShipmentInBagController);
router.post("/complete-verification", completeBagVerificationController);
router.post("/:bagId/verify-scan", verifyScannedShipmentInBagController);
router.get("/", getAllBags);
router.get("/:bagId", getBagById);

export default router;