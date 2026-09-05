import mongoose from 'mongoose';

// Reusable schema for individual observation lines
const ObservationRowSchema = new mongoose.Schema({
  stepIndex: Number,
  label: String, // e.g. "Zero Load", "Center", "Run 1"
  load: { type: mongoose.Schema.Types.Decimal128, required: true },
  indicated: { type: mongoose.Schema.Types.Decimal128, required: true },
  deltaL: { type: mongoose.Schema.Types.Decimal128, required: true },
  trueP: { type: mongoose.Schema.Types.Decimal128, required: true },
  correctedErrorEc: { type: mongoose.Schema.Types.Decimal128, required: true },
  mpeLimit: { type: mongoose.Schema.Types.Decimal128, required: true },
  passed: { type: Boolean, required: true }
});

const InspectionSchema = new mongoose.Schema(
  {
    instrumentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Instrument', 
      required: true,
      index: true 
    },
    
    // -------------------------------------------------------------
    // MODULE 1: WEIGHING PERFORMANCE TEST (Increasing & Decreasing)
    // -------------------------------------------------------------
    weighingTest: {
      baselineE0: { type: mongoose.Schema.Types.Decimal128, required: true },
      readings: [ObservationRowSchema],
      passed: { type: Boolean, default: false }
    },

    // -------------------------------------------------------------
    // MODULE 2: ECCENTRICITY TEST (Corner Loading - 5 Positions)
    // -------------------------------------------------------------
    eccentricityTest: {
      testLoad: { type: mongoose.Schema.Types.Decimal128 },
      positions: [ObservationRowSchema], // Center, Front-Left, Front-Right, Rear-Right, Rear-Left
      passed: { type: Boolean, default: false }
    },

    // -------------------------------------------------------------
    // MODULE 3: REPEATABILITY TEST (Consistency - 3 Runs)
    // -------------------------------------------------------------
    repeatabilityTest: {
      testLoad: { type: mongoose.Schema.Types.Decimal128 },
      runs: [ObservationRowSchema],
      pMax: { type: mongoose.Schema.Types.Decimal128 },
      pMin: { type: mongoose.Schema.Types.Decimal128 },
      variationRange: { type: mongoose.Schema.Types.Decimal128 }, // Pmax - Pmin
      mpeLimit: { type: mongoose.Schema.Types.Decimal128 },
      passed: { type: Boolean, default: false }
    },

    // Overall Physical Test Status
    allTestsPassed: { type: Boolean, default: false },
    inspectionStatus: {
      type: String,
      enum: ['IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
      default: 'IN_PROGRESS'
    } ,

    // -------------------------------------------------------------
    // AUDIT & MAKER-CHECKER WORKFLOW
    // -------------------------------------------------------------
    testedBy: {
      officerId: { type: String, default: 'OFFICER-042' },
      officerName: { type: String, default: 'Field Inspector' },
      submittedAt: { type: Date }
    },

    supervisorAudit: {
      reviewedBy: { type: String }, // e.g. "Senior Inspector Sharma"
      reviewedAt: { type: Date },
      decision: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
      },
      remarks: { type: String, default: '' },
      digitalSignatureToken: { type: String }
    },

    // -------------------------------------------------------------
    // LEGAL CERTIFICATE METADATA
    // -------------------------------------------------------------
    certificate: {
      certificateNumber: { type: String, unique: true, sparse: true },
      issueDate: { type: Date },
      validUntil: { type: Date },
      qrVerificationUrl: { type: String }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Inspection', InspectionSchema);
