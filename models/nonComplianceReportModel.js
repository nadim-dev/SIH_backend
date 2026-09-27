import mongoose from "mongoose";

const nonComplianceReportSchema = new mongoose.Schema(
  {
    ncrId: { type: String, unique: true, index: true },
    evaluationId: { type: mongoose.Schema.Types.ObjectId, ref: "Evaluation", required: true, index: true },
    inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection", default: null },
    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Instrument", required: true, index: true },
    testType: { type: String, enum: ["GENERAL_EXAMINATION", "WEIGHING_PERFORMANCE", "REPEATABILITY", "ECCENTRICITY", "TARE"], required: true },
    failedItems: [{ key: String, label: { type: String, required: true } }],
    remarks: { type: String, required: true, trim: true },
    evidence: [{ url: String, publicId: String, originalName: String, resourceType: String }],
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED", "RESUMED"], default: "PENDING", index: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report", default: null },
    supervisorRemarks: { type: String, trim: true, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("NonComplianceReport", nonComplianceReportSchema);
