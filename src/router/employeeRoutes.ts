import { Router } from "express";

import {
    createHubEmployee,

    getAllEmployees,
    getEmployeeByHubId,
    getEmployeeById,
} from "../controllers/employesController";
import upload from "../utils/upload";

const router = Router();

router.get("/getAllEmployees", getAllEmployees);
router.get("/:employeeId", getEmployeeById);
router.get("/hub/:hubId", getEmployeeByHubId);
router.post("/create", upload.single("photo"), createHubEmployee);

export default router;
