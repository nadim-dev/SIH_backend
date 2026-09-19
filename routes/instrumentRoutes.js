import express from "express";
import { registerInstrument, getMyEvaluations, getEvaluationDocuments, uploadEvaluationDocument, completeEvaluationDocuments, saveEvaluationEnvironment, generateTestPlanController, getInstrumentForTesting, submitInstrumentObservations, submitEccentricityObservations, submitRepeatabilityObservations, submitFullInspection, getPendingApprovalInspections, getApprovedInspectionReports, verifyCertificate, approveInspection } from "../controllers/instrumentController.js";

import { uploadInstrumentPicture } from "../middleware/instrumentPictureUpload.js";
import { uploadEvaluationDocument as documentUpload } from "../middleware/evaluationDocumentUpload.js";
import checkAuth from "../middleware/authMiddleware.js";
const router=express.Router();



router.post('/register',checkAuth,uploadInstrumentPicture.single('nameplatePhoto'), registerInstrument);
router.get('/my-evaluations', checkAuth, getMyEvaluations);
router.get('/:applicationId/documents', checkAuth, getEvaluationDocuments);
router.post('/:applicationId/documents', checkAuth, documentUpload.single('document'), uploadEvaluationDocument);
router.post('/:applicationId/documents/complete', checkAuth, completeEvaluationDocuments);
router.post('/:applicationId/environment', checkAuth, saveEvaluationEnvironment);
router.post('/:evaluationId/test-plan', checkAuth, generateTestPlanController);
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
