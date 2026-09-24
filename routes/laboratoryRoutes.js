import express from "express";
import checkAuth, { allowRoles } from "../middleware/authMiddleware.js";
import { createLaboratory, deleteLaboratory, getLaboratories, updateLaboratoryStatus } from "../controllers/laboratoryController.js";

const router = express.Router();
router.use(checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"));
router.get("/", getLaboratories);
router.post("/", createLaboratory);
router.patch("/:id/status", updateLaboratoryStatus);
router.delete("/:id", deleteLaboratory);

export default router;
