import mongoose from "mongoose";

const nonComplianceReportSchema = new mongoose.Schema(
  {
    ncrId: { type: String, unique: true, index: true },
    evaluationId: { type: mongoose.Schema.Types.ObjectId, ref: "Evaluation", required: true, index: true },
    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Instrument", required: true, index: true },
    failedItems: [{ key: String, label: { type: String, required: true } }],
    remarks: { type: String, required: true, trim: true },
    evidence: [{ url: String, publicId: String, originalName: String, resourceType: String }],
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED", "RESUMED"], default: "PENDING", index: true },
    supervisorRemarks: { type: String, trim: true, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("NonComplianceReport", nonComplianceReportSchema);
