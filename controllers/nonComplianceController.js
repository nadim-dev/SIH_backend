import Evaluation from "../models/evaluationModel.js";
import Instrument from "../models/instrumentModel.js";
import NonComplianceReport from "../models/nonComplianceReportModel.js";
import { uploadBufferToCloudinary } from "../utils/uploadImagetoCloudinary.js";

export const createNonComplianceReport = async (req, res) => {
  try {
    const { instrumentId, failedItems, remarks } = req.body;
    if (!instrumentId || !remarks?.trim()) return res.status(400).json({ message: "Instrument and remarks are required." });
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ message: "Instrument not found." });
    const evaluation = await Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 });
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found for this instrument." });

    const evidence = await Promise.all((req.files || []).map(async (file) => {
      const uploaded = await uploadBufferToCloudinary(file.buffer, { folder: "SIH/non-compliance-evidence", resource_type: "auto" });
      return { url: uploaded.secure_url, publicId: uploaded.public_id, originalName: file.originalname, resourceType: uploaded.resource_type };
    }));

    const report = await NonComplianceReport.create({
      ncrId: `NCR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      evaluationId: evaluation._id,
      instrumentId,
      failedItems: Array.isArray(failedItems) ? failedItems : JSON.parse(failedItems || "[]"),
      remarks: remarks.trim(), evidence, submittedBy: req.user._id,
    });

    await Evaluation.findByIdAndUpdate(evaluation._id, { $set: { complianceStatus: "NON_COMPLIANT", complianceResult: "FAIL", status: "CORRECTION_REQUIRED", reviewStatus: "PENDING", testingStatus: "IN_PROGRESS" } });
    return res.status(201).json({ success: true, data: report });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to create non-compliance report." });
  }
};

export const getNonComplianceReports = async (req, res) => {
  const reports = await NonComplianceReport.find().populate("instrumentId", "manufacturer modelNumber serialNumber").sort({ createdAt: -1 });
  return res.json({ success: true, data: reports });
};

export const getLatestNonComplianceReport = async (req, res) => {
  const report = await NonComplianceReport.findOne({ instrumentId: req.params.instrumentId }).sort({ createdAt: -1 });
  return res.json({ success: true, data: report });
};

export const reviewNonComplianceReport = async (req, res) => {
  const { status, supervisorRemarks = "" } = req.body;
  if (!["APPROVED", "REJECTED", "CORRECTION_REQUIRED", "RESUMED"].includes(status)) return res.status(400).json({ message: "Invalid review status." });
  const report = await NonComplianceReport.findById(req.params.ncrId);
  if (!report) return res.status(404).json({ message: "NCR not found." });
  report.status = status; report.supervisorRemarks = supervisorRemarks; report.reviewedBy = req.user._id; report.reviewedAt = new Date(); await report.save();
  const evaluationUpdate = status === "RESUMED"
    ? { complianceStatus: "PENDING", complianceResult: "PENDING", reviewStatus: "RESUMED", status: "TESTING", testingStatus: "IN_PROGRESS", supervisorRemarks, reviewedAt: report.reviewedAt }
    : { reviewStatus: status === "APPROVED" ? "APPROVED" : "CORRECTION_REQUIRED", supervisorRemarks, reviewedAt: report.reviewedAt };
  await Evaluation.findByIdAndUpdate(report.evaluationId, { $set: evaluationUpdate });
  return res.json({ success: true, data: report });
};
