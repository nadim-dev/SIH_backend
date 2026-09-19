import mongoose from "mongoose";

const evaluationSchema = new mongoose.Schema(
  {
    // --------------------------------------------------
    // REFERENCES
    // --------------------------------------------------

    instrumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instrument",
      required: true,
      index: true,
    },

    testingOfficerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --------------------------------------------------
    // APPLICATION
    // --------------------------------------------------

    applicationNumber: {
      type: String,
      unique: true,
      required: true,
    },

    // --------------------------------------------------
    // OVERALL STATUS
    // --------------------------------------------------

    status: {
       type: String,
       enum: [
         "DOCUMENTS_PENDING",
         "DOCUMENT_REVIEW",
     
         "ENVIRONMENT_PENDING",
     
         "TEST_PLAN_PENDING",
     
         "TESTING",
     
         "COMPLIANCE_EVALUATION",
     
         "SUPERVISOR_REVIEW",
         "CORRECTION_REQUIRED",
     
         "REPORT_GENERATION",
         "COMPLETED",
         "REJECTED",
      ],
       default: "DOCUMENTS_PENDING",
       index: true,
     },     

    // --------------------------------------------------
    // WORKFLOW PROGRESS
    // --------------------------------------------------

    documentsStatus: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED"],
      default: "PENDING",
    },

    testPlanStatus: {
      type: String,
      enum: ["LOCKED", "PENDING", "COMPLETED"],
      default: "LOCKED",
    },

    environmentStatus: {
      type: String,
      enum: ["LOCKED", "PENDING", "COMPLETED"],
      default: "LOCKED",
    },

    testingStatus: {
      type: String,
      enum: ["LOCKED", "PENDING", "IN_PROGRESS", "COMPLETED"],
      default: "LOCKED",
    },

    complianceStatus: {
      type: String,
      enum: ["LOCKED", "PENDING", "COMPLIANT", "NON_COMPLIANT"],
      default: "LOCKED",
    },

    reviewStatus: {
      type: String,
      enum: [
        "LOCKED",
        "PENDING",
        "APPROVED",
        "CORRECTION_REQUIRED",
      ],
      default: "LOCKED",
    },

    reportStatus: {
      type: String,
      enum: ["LOCKED", "PENDING", "GENERATED"],
      default: "LOCKED",
    },

    // --------------------------------------------------
    // PROGRESS
    // --------------------------------------------------

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // --------------------------------------------------
    // TEST PLAN
    // --------------------------------------------------

    testPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestPlan",
      default: null,
    },

    // --------------------------------------------------
    // TEST ENVIRONMENT
    // --------------------------------------------------

    testEnvironmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestEnvironment",
      default: null,
    },

    // --------------------------------------------------
    // COMPLIANCE
    // --------------------------------------------------

    complianceResult: {
      type: String,
      enum: ["PENDING", "PASS", "FAIL"],
      default: "PENDING",
    },

    // --------------------------------------------------
    // SUPERVISOR REVIEW
    // --------------------------------------------------

    supervisorRemarks: {
      type: String,
      trim: true,
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    // --------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------

    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
      default: null,
    },

    reportHash: {
      type: String,
      default: null,
    },

    qrCode: {
      type: String,
      default: null,
    },

    // --------------------------------------------------
    // TIMESTAMPS
    // --------------------------------------------------

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Evaluation", evaluationSchema);