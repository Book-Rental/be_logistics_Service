import { Router } from "express";
import {
    createBookInspectionController,
} from "../controllers/bookInspection.controller";
import upload from "../utils/upload";

const router = Router();

router.post(
    "/:shipmentId",
    upload.array("images", 5),
    createBookInspectionController
);

export default router;