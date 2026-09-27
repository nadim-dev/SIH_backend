import express from "express";
import checkAuth from "../middleware/authMiddleware.js";
import { getAdminDashboardSummary } from "../controllers/adminDashboardController.js";

const router = express.Router();
router.get("/summary", checkAuth, getAdminDashboardSummary);

export default router;
