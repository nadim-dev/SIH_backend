import express from "express";
import { registerInstrument, getMyEvaluations, getTestingDashboardSummary, getSupervisorEvaluations, getEvaluationDocuments, uploadEvaluationDocument, completeEvaluationDocuments, saveEvaluationEnvironment, generateTestPlanController, getTestExecutionData, reviewSupervisorEvaluation, getGeneratedReport, getGeneratedReports, getAllGeneratedReportsAdmin, verifyReport, getInstrumentForTesting, getWeighingTestConfig, getRepeatabilityTestConfig, getEccentricityTestConfig, getTareTestConfig, submitTareTest, completeUnimplementedTest, uploadGeneralExaminationPhoto, extractRegistrationNameplateOcr, extractNameplateOcr, uploadWeighingEvidence, deleteWeighingEvidence, submitGeneralExamination, submitInstrumentObservations, submitEccentricityObservations, submitRepeatabilityObservations, submitFullInspection, getPendingApprovalInspections, getApprovedInspectionReports, verifyCertificate, approveInspection } from "../controllers/instrumentController.js";

import { uploadInstrumentPicture } from "../middleware/instrumentPictureUpload.js";
import { uploadEvaluationDocument as documentUpload } from "../middleware/evaluationDocumentUpload.js";
import checkAuth from "../middleware/authMiddleware.js";
import { ncrEvidenceUpload } from "../middleware/ncrEvidenceUpload.js";
import { createNonComplianceReport, getNonComplianceReports, getLatestNonComplianceReport, reviewNonComplianceReport } from "../controllers/nonComplianceController.js";
import { getSupervisorDashboardSummary } from "../controllers/adminDashboardController.js";
const router=express.Router();



router.post('/register',checkAuth,uploadInstrumentPicture.single('nameplatePhoto'), registerInstrument);
router.post('/nameplate-ocr', checkAuth, uploadInstrumentPicture.single('photo'), extractRegistrationNameplateOcr);
router.get('/my-evaluations', checkAuth, getMyEvaluations);
router.get('/testing-dashboard-summary', checkAuth, getTestingDashboardSummary);
router.get('/supervisor-evaluations', checkAuth, getSupervisorEvaluations);
router.get('/supervisor-dashboard-summary', checkAuth, getSupervisorDashboardSummary);
router.get('/supervisor-reports', checkAuth, getGeneratedReports);
router.get('/admin/generated-reports', checkAuth, getAllGeneratedReportsAdmin);
router.get('/:applicationId/documents', checkAuth, getEvaluationDocuments);
router.post('/:applicationId/documents', checkAuth, documentUpload.single('document'), uploadEvaluationDocument);
router.post('/:applicationId/documents/complete', checkAuth, completeEvaluationDocuments);
router.post('/:applicationId/environment', checkAuth, saveEvaluationEnvironment);
router.post('/:evaluationId/test-plan', checkAuth, generateTestPlanController);
router.get('/:applicationId/test-execution', checkAuth, getTestExecutionData);
router.patch('/:applicationId/supervisor-review', checkAuth, reviewSupervisorEvaluation);
router.get('/:applicationId/report', checkAuth, getGeneratedReport);
router.get('/admin/pending-approval', getPendingApprovalInspections);
router.get('/admin/approved-reports', getApprovedInspectionReports);
router.get('/certificate/:number', verifyCertificate);
router.get('/reports/verify/:reportId', verifyReport);
router.post('/:id/approve', approveInspection);
router.post('/ncr', checkAuth, ncrEvidenceUpload.array('evidence', 10), createNonComplianceReport);
router.get('/ncr', checkAuth, getNonComplianceReports);
router.get('/ncr/instrument/:instrumentId', checkAuth, getLatestNonComplianceReport);
router.patch('/ncr/:ncrId/review', checkAuth, reviewNonComplianceReport);
router.get('/:id', getInstrumentForTesting);
router.post('/:id/general-examination/photo', uploadInstrumentPicture.single('photo'), uploadGeneralExaminationPhoto);
router.post('/:id/general-examination/nameplate-ocr', checkAuth, uploadInstrumentPicture.single('photo'), extractNameplateOcr);
router.post('/:id/weighing-test/evidence', checkAuth, uploadInstrumentPicture.single('photo'), uploadWeighingEvidence);
router.delete('/:id/weighing-test/evidence', checkAuth, deleteWeighingEvidence);
router.post('/:id/general-examination/complete', checkAuth, submitGeneralExamination);
router.get('/:id/weighing-test/config', checkAuth, getWeighingTestConfig);
router.get('/:id/repeatability-test/config', checkAuth, getRepeatabilityTestConfig);
router.get('/:id/eccentricity-test/config', checkAuth, getEccentricityTestConfig);
router.get('/:id/tare-test/config', checkAuth, getTareTestConfig);
router.post('/:id/submit-tare', submitTareTest);
router.post('/:id/complete-test/:code', checkAuth, completeUnimplementedTest);
router.post('/:id/submit-observations', submitInstrumentObservations);
router.post('/:id/submit-eccentricity', submitEccentricityObservations);
router.post('/:id/submit-repeatability', submitRepeatabilityObservations);
router.post('/:id/submit-full-inspection', submitFullInspection);


export default router;
