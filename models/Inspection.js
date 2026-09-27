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
  indicated: { type: mongoose.Schema.Types.Decimal128 },
  correctedError: { type: mongoose.Schema.Types.Decimal128 },
  passed: { type: Boolean, default: false },
  passed: { type: Boolean, required: true }
});
const TestLoadSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  description: { type: String, required: true },
  load: { type: mongoose.Schema.Types.Decimal128, required: true },
  mpe: { type: mongoose.Schema.Types.Decimal128, required: true },
}, { _id: false });
const RepeatabilityRunSchema = new mongoose.Schema({
  runNumber: { type: Number, required: true },
  loadApplied: { type: mongoose.Schema.Types.Decimal128, required: true },
  indication: { type: mongoose.Schema.Types.Decimal128, default: null },
}, { _id: false });
const EccentricityPointSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  label: { type: String, required: true },
  loadApplied: { type: mongoose.Schema.Types.Decimal128, required: true },
  indication: { type: mongoose.Schema.Types.Decimal128, default: null },
}, { _id: false });
const TarePointSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  tareValue: { type: mongoose.Schema.Types.Decimal128, required: true },
  netLoad: { type: mongoose.Schema.Types.Decimal128, required: true },
  indicated: { type: mongoose.Schema.Types.Decimal128, required: true },
  correctedError: { type: mongoose.Schema.Types.Decimal128, required: true },
  mpeLimit: { type: mongoose.Schema.Types.Decimal128, required: true },
  passed: { type: Boolean, required: true },
}, { _id: false });

const InspectionSchema = new mongoose.Schema(
  {
    evaluationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Evaluation',
      index: true,
    },

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
      baselineE0: { type: mongoose.Schema.Types.Decimal128 },
      testLoads: [TestLoadSchema],
      readings: [ObservationRowSchema],
      evidence: [{
        url: { type: String, required: true },
        publicId: { type: String, default: null },
        uploadedAt: { type: Date, default: Date.now },
        location: {
          latitude: { type: Number, default: null },
          longitude: { type: Number, default: null },
          address: { type: String, default: null },
        },
      }],
      passed: { type: Boolean, default: false }
    },

    // -------------------------------------------------------------
    // MODULE 2: ECCENTRICITY TEST (Corner Loading - 5 Positions)
    // -------------------------------------------------------------
    eccentricityTest: {
      generatedLoad: { type: mongoose.Schema.Types.Decimal128 },
      generatedPoints: [EccentricityPointSchema],
      testLoad: { type: mongoose.Schema.Types.Decimal128 },
      positions: [ObservationRowSchema], // Center, Front-Left, Front-Right, Rear-Right, Rear-Left
      evidence: [{ url: String, publicId: String, uploadedAt: { type: Date, default: Date.now }, location: { latitude: Number, longitude: Number, address: String } }],
      passed: { type: Boolean, default: false }
    },

    // -------------------------------------------------------------
    // MODULE 3: REPEATABILITY TEST (Consistency - 3 Runs)
    // -------------------------------------------------------------
    repeatabilityTest: {
      testType: { type: String, default: "REPEATABILITY" },
      verificationType: { type: String, default: "INITIAL_VERIFICATION" },
      testLoad: { type: mongoose.Schema.Types.Decimal128 },
      loadPercentageOfMax: { type: Number, default: 80 },
      numberOfRuns: { type: Number, default: 3 },
      runs: [RepeatabilityRunSchema],
      maxIndication: { type: mongoose.Schema.Types.Decimal128 },
      minIndication: { type: mongoose.Schema.Types.Decimal128 },
      variation: { type: mongoose.Schema.Types.Decimal128 },
      variationRange: { type: mongoose.Schema.Types.Decimal128 },
      mpeLimit: { type: mongoose.Schema.Types.Decimal128 },
      evidence: [{ url: String, publicId: String, uploadedAt: { type: Date, default: Date.now }, location: { latitude: Number, longitude: Number, address: String } }],
      passed: { type: Boolean, default: false }
    },
    tareTest: {
      tareType: String,
      tareValues: [mongoose.Schema.Types.Decimal128],
      points: [TarePointSchema],
      evidence: [{ url: String, publicId: String, uploadedAt: { type: Date, default: Date.now }, location: { latitude: Number, longitude: Number, address: String } }],
      passed: { type: Boolean, default: false },
    },

    // -------------------------------------------------------------
    // MODULE 0: GENERAL EXAMINATION
    // -------------------------------------------------------------
    generalExamination: {
      checklist: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true },
          result: {
            type: String,
            enum: ['PASS', 'FAIL', 'NA'],
            required: true,
          },
          textValue: { type: String, default: '' },
        },
      ],
      photos: {
        nameplate: { type: String, default: null },
        level: { type: String, default: null },
        seal: { type: String, default: null },
        display: { type: String, default: null },
      },
      passed: { type: Boolean, default: false },
      submittedAt: { type: Date, default: null },
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    // Overall Physical Test Status
    allTestsPassed: { type: Boolean, default: false },
    inspectionStatus: {
      type: String,
      enum: ['IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NON_COMPLIANT'],
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
