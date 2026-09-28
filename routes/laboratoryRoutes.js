import express from "express";
import checkAuth, { allowRoles } from "../middleware/authMiddleware.js";
import { createLaboratory, deleteLaboratory, getLaboratories, getLaboratoriesUsingCurrentOimlVersion, getLaboratoryProfileForAdmin, getMyLaboratoryProfile, updateLaboratoryStatus, updateMyLaboratoryProfile } from "../controllers/laboratoryController.js";
import { uploadInstrumentPicture } from "../middleware/instrumentPictureUpload.js";

const router = express.Router();
router.get("/my/profile", checkAuth, allowRoles("LAB SUPERVISOR"), getMyLaboratoryProfile);
router.patch("/my/profile", checkAuth, allowRoles("LAB SUPERVISOR"), uploadInstrumentPicture.single("logo"), updateMyLaboratoryProfile);
router.use(checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"));
router.get("/oiml-standards", getLaboratoriesUsingCurrentOimlVersion);
router.get("/:id/profile", getLaboratoryProfileForAdmin);
router.get("/", getLaboratories);
router.post("/", createLaboratory);
router.patch("/:id/status", updateLaboratoryStatus);
router.delete("/:id", deleteLaboratory);

export default router;
