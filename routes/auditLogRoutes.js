import express from "express";
import { getAuditLogs } from "../controllers/auditLogController.js";
import checkAuth, { allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/", checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"), getAuditLogs);

export default router;
