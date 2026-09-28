import mongoose from "mongoose";

const testDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  draftKey: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

testDraftSchema.index({ userId: 1, draftKey: 1 }, { unique: true });

export default mongoose.model("TestDraft", testDraftSchema);
