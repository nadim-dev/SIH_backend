import express from "express";
import checkAuth from "../middleware/authMiddleware.js";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notificationController.js";

const router = express.Router();
router.get("/", checkAuth, getMyNotifications);
router.patch("/read-all", checkAuth, markAllNotificationsRead);
router.patch("/:id/read", checkAuth, markNotificationRead);
export default router;
