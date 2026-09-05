import express from "express";
import { registerInstrument, getInstrumentForTesting, submitInstrumentObservations, submitEccentricityObservations, submitRepeatabilityObservations, submitFullInspection, getPendingApprovalInspections, getApprovedInspectionReports, approveInspection } from "../controllers/instrumentController.js";

import { uploadInstrumentPicture } from "../middleware/instrumentPictureUpload.js";
const router=express.Router();



router.post('/register', uploadInstrumentPicture.single('nameplatePhoto'), registerInstrument);
router.get('/admin/pending-approval', getPendingApprovalInspections);
router.get('/admin/approved-reports', getApprovedInspectionReports);
router.get('/certificate/:number', verifyCertificate);
router.post('/:id/approve', approveInspection);
router.get('/:id', getInstrumentForTesting);
router.post('/:id/submit-observations', submitInstrumentObservations);
router.post('/:id/submit-eccentricity', submitEccentricityObservations);
router.post('/:id/submit-repeatability', submitRepeatabilityObservations);
router.post('/:id/submit-full-inspection', submitFullInspection);


export default router;
