import Evaluation from "../models/evaluationModel.js";
import Instrument from "../models/instrumentModel.js";
import NonComplianceReport from "../models/nonComplianceReportModel.js";
import Inspection from "../models/Inspection.js";
import Report from "../models/reportModel.js";
import TestPlan from "../models/testPlanModel.js";
import User from "../models/userModel.js";
import Notification from "../models/notificationModel.js";
import { createReportHash } from "../utils/reportHash.js";
import { uploadBufferToCloudinary } from "../utils/uploadImagetoCloudinary.js";

const reportFieldByTestType = {
  GENERAL_EXAMINATION: "generalExamination",
  WEIGHING_PERFORMANCE: "weighingTest",
  REPEATABILITY: "repeatabilityTest",
  ECCENTRICITY: "eccentricityTest",
  TARE: "tareTest",
};

export const createNonComplianceReport = async (req, res) => {
  try {
    const { instrumentId, failedItems, remarks, testType } = req.body;
    if (!instrumentId || !remarks?.trim()) return res.status(400).json({ message: "Instrument and remarks are required." });
    if (req.user.role !== "TESTING OFFICER") return res.status(403).json({ message: "Only the assigned testing officer can submit a non-compliance report." });
    if (!reportFieldByTestType[testType]) return res.status(400).json({ message: "A valid failed test type is required." });
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ message: "Instrument not found." });
    const evaluation = await Evaluation.findOne({ instrumentId, testingOfficerId: req.user._id }).sort({ createdAt: -1 });
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found for this instrument." });
    const existingPending = await NonComplianceReport.findOne({ evaluationId: evaluation._id, status: "PENDING" });
    if (existingPending) return res.status(409).json({ message: "A non-compliance report is already awaiting supervisor review." });

    const parsedFailedItems = Array.isArray(failedItems) ? failedItems : JSON.parse(failedItems || "[]");
    if (!parsedFailedItems.length) return res.status(400).json({ message: "At least one failed test item is required." });
    const parsedTestData = req.body.testData ? (typeof req.body.testData === "string" ? JSON.parse(req.body.testData) : req.body.testData) : {};
    const inspection = await Inspection.findOne({ evaluationId: evaluation._id }) || await Inspection.findOne({ instrumentId });
    if (!inspection) return res.status(404).json({ message: "Inspection data must be saved before submitting the failed test." });

    const inspectionField = reportFieldByTestType[testType];
    if (testType === "GENERAL_EXAMINATION") {
      const checklist = Array.isArray(parsedTestData.checklist) ? parsedTestData.checklist : [];
      if (!checklist.some((item) => item.result === "FAIL")) return res.status(400).json({ message: "Failed general examination results were not provided." });
      inspection.generalExamination = { checklist, photos: parsedTestData.photos || {}, passed: false, submittedAt: new Date(), submittedBy: req.user._id };
      await inspection.save();
    } else if (inspection[inspectionField]?.passed !== false) {
      return res.status(400).json({ message: "Failed test readings have not been saved to the inspection." });
    }

    const evidence = await Promise.all((req.files || []).map(async (file) => {
      const uploaded = await uploadBufferToCloudinary(file.buffer, { folder: "SIH/non-compliance-evidence", resource_type: "auto" });
      return { url: uploaded.secure_url, publicId: uploaded.public_id, originalName: file.originalname, resourceType: uploaded.resource_type };
    }));

    const report = await NonComplianceReport.create({
      ncrId: `NCR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      evaluationId: evaluation._id,
      inspectionId: inspection._id,
      instrumentId,
      testType,
      failedItems: parsedFailedItems,
      remarks: remarks.trim(), evidence, submittedBy: req.user._id,
    });

    await Evaluation.findByIdAndUpdate(evaluation._id, { $set: { complianceStatus: "NON_COMPLIANT", complianceResult: "FAIL", status: "SUPERVISOR_REVIEW", reviewStatus: "PENDING", testingStatus: "COMPLETED" } });
    return res.status(201).json({ success: true, data: report });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to create non-compliance report." });
  }
};

export const getNonComplianceReports = async (req, res) => {
  const reports = await NonComplianceReport.find().populate("instrumentId", "manufacturer modelNumber serialNumber instrumentType accuracyClass").populate("evaluationId", "applicationNumber").sort({ createdAt: -1 });
  return res.json({ success: true, data: reports });
};

export const getLatestNonComplianceReport = async (req, res) => {
  const report = await NonComplianceReport.findOne({ instrumentId: req.params.instrumentId }).sort({ createdAt: -1 });
  return res.json({ success: true, data: report });
};

export const reviewNonComplianceReport = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") return res.status(403).json({ success: false, message: "Only lab supervisors can review non-compliance reports." });
    const { status, supervisorRemarks = "" } = req.body;
    if (!["APPROVED", "REJECTED", "CORRECTION_REQUIRED", "RESUMED"].includes(status)) return res.status(400).json({ success: false, message: "Invalid review status." });
    const report = await NonComplianceReport.findById(req.params.ncrId);
    if (!report) return res.status(404).json({ success: false, message: "NCR not found." });
    const evaluation = await Evaluation.findById(report.evaluationId);
    if (!evaluation) return res.status(404).json({ success: false, message: "Evaluation not found." });
    const reviewedAt = new Date();
    let generatedReport = null;

    if (status === "APPROVED") {
      if (report.status !== "PENDING") return res.status(409).json({ success: false, message: "Only a pending NCR can be approved." });
      const [instrument, supervisor, testPlan] = await Promise.all([
        Instrument.findById(report.instrumentId),
        User.findById(req.user._id).populate("labId", "name"),
        TestPlan.findOne({ evaluationId: evaluation._id }),
      ]);
      const inspection = await Inspection.findOne({ evaluationId: evaluation._id }) || await Inspection.findOne({ instrumentId: report.instrumentId });
      if (!inspection || !instrument) return res.status(404).json({ success: false, message: "Saved inspection results or instrument are missing." });
      inspection.allTestsPassed = false;
      inspection.inspectionStatus = "NON_COMPLIANT";
      await inspection.save();
      const approvedAt = reviewedAt;
      generatedReport = await Report.findOneAndUpdate(
        { evaluationId: evaluation._id },
        { $set: {
          evaluationId: evaluation._id,
          inspectionId: inspection._id,
          instrumentId: instrument._id,
          reportStatus: "GENERATED",
          complianceStatus: "NON_COMPLIANT",
          instrumentDetails: instrument.toObject(),
          testPlan: testPlan?.toObject() || null,
          testResults: inspection.toObject(),
          supervisorId: req.user._id,
          laboratoryName: supervisor?.labId?.name || null,
          approvedAt,
        } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      generatedReport.reportHash = createReportHash(generatedReport.toObject());
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      generatedReport.qrCode = `${frontendUrl}/verify-report/${generatedReport._id}`;
      await generatedReport.save();
      report.reportId = generatedReport._id;
      evaluation.reportId = generatedReport._id;
      evaluation.reportStatus = "GENERATED";
      evaluation.completedAt = approvedAt;
      evaluation.progress = 100;
      evaluation.status = "COMPLETED";
      evaluation.complianceStatus = "NON_COMPLIANT";
      evaluation.complianceResult = "FAIL";
      evaluation.reviewStatus = "APPROVED";
      evaluation.supervisorId = req.user._id;
    } else if (status === "RESUMED") {
      evaluation.complianceStatus = "PENDING";
      evaluation.complianceResult = "PENDING";
      evaluation.reviewStatus = "RESUMED";
      evaluation.status = "TESTING";
      evaluation.testingStatus = "IN_PROGRESS";
    } else {
      evaluation.reviewStatus = "CORRECTION_REQUIRED";
    }

    report.status = status;
    report.supervisorRemarks = supervisorRemarks;
    report.reviewedBy = req.user._id;
    report.reviewedAt = reviewedAt;
    await Promise.all([report.save(), evaluation.save()]);
    if (status === "APPROVED") await Notification.create({ recipientId: report.submittedBy, recipientRole: "TESTING_OFFICER", message: `A non-compliance report for ${evaluation.applicationNumber} was approved and finalized.` });
    return res.json({ success: true, data: report, generatedReportId: generatedReport?._id || null, applicationNumber: evaluation.applicationNumber });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to review non-compliance report." });
  }
};
