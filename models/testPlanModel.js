import mongoose from "mongoose";
const testPlanSchema = new mongoose.Schema(
  {
    evaluationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Evaluation",
      required: true,
      unique: true,
    },
    instrumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instrument",
      required: true,
    },
    standard: { type: String, required: true },
    standardVersion: { type: String, required: true },
    tests: [
      {
        sequence: Number,
        code: String,
        name: String,
        category: String,
        clause: String,
        status: String,
      },
    ],
    status: {
      type: String,
      enum: ["GENERATED", "IN_PROGRESS", "COMPLETED"],
      default: "GENERATED",
    },
  },
  { timestamps: true },
);
export default mongoose.model("TestPlan", testPlanSchema);
