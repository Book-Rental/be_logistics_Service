import { Router } from "express";
import { loginLogistics } from "../controllers/authController";

const router = Router();

router.post("/login", loginLogistics);

export default router;
