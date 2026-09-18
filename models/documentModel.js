import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    evaluationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Evaluation",
      required: true,
      index: true,
    },

    documentType: {
      type: String,
      enum: [
        "TYPE_APPROVAL_CERTIFICATE",
        "CALIBRATION_CERTIFICATE",
        "TECHNICAL_DOCUMENTATION",
        "USER_MANUAL",
        "OTHER",
      ],
      required: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    fileUrl: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Document", documentSchema);