import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    evaluationId: { type: mongoose.Schema.Types.ObjectId, ref: "Evaluation", required: true, unique: true, index: true },
    inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection", required: true },
    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Instrument", required: true },
    reportStatus: { type: String, enum: ["GENERATED", "FINALIZED"], default: "GENERATED" },
    complianceStatus: { type: String, enum: ["COMPLIANT", "NON_COMPLIANT"] },
    reportHash: { type: String, default: null, index: true },
    qrCode: { type: String, default: null },
    instrumentDetails: { type: mongoose.Schema.Types.Mixed, required: true },
    testPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    testResults: { type: mongoose.Schema.Types.Mixed, required: true },
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    laboratoryName: { type: String, default: null },
    approvedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export default mongoose.model("Report", reportSchema);
