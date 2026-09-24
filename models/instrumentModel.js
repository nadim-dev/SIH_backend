import mongoose from 'mongoose';


const InstrumentSchema = new mongoose.Schema(
  {
    manufacturer: { type: String, required: true, trim: true },
    modelNumber: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, trim: true, unique: true },
    instrumentType: {
      type: String,
      required: true,
      enum: [
        'Bench Scale',
        'Platform Scale',
        'Counter / Retail Scale',
        'Precision / Analytical Balance',
        'Crane / Hanging Scale',
        'Weighbridge / Vehicle Scale'
      ]
    },
    registeredBy:{
       type: mongoose.Schema.Types.ObjectId,
       ref: "User",
       required: true
    },
    accuracyClass: {
      type: String,
      required: true,
      enum: ['I', 'II', 'III', 'IIII']
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'g', 'mg', 't'],
      default: 'kg'
    },
    technology: {
      type: String,
      enum: ['Electronic', 'Mechanical'],
      default: 'Electronic',
    },
    indicationType: {
      type: String,
      enum: ['Digital', 'Analog'],
      default: 'Digital',
    },
    tareDevice: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'Yes',
    },
    tareType: { type: String, enum: ['Additive', 'Subtractive'], default: 'Subtractive' },
    maximumTare: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    hasPrintingDevice: {
      type: Boolean,
      default: false,
    },
    max: { type: mongoose.Schema.Types.Decimal128, required: true },
    min: { type: mongoose.Schema.Types.Decimal128, required: true },
    e: { type: mongoose.Schema.Types.Decimal128, required: true },
    d: { type: mongoose.Schema.Types.Decimal128, required: true },
    n: { type: Number, required: true }, // Scale division count: Max / e
    nameplatePhotoUrl: { type: String },
    status: {
      type: String,
      enum: ['REGISTERED', 'TEST_IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
      default: 'REGISTERED'
    },
    testResult: { type: String, enum: ['PASS', 'FAIL'] }
  },
  {
    timestamps: true,
    toJSON: {
      // Helper to convert Decimal128 to clean strings when sending JSON to React
      transform: (doc, ret) => {
      ['max', 'min', 'e', 'd', 'maximumTare'].forEach((key) => {
          if (ret[key]) ret[key] = ret[key].toString();
        });
        return ret;
      }
    }
  }
);

export default mongoose.model('Instrument', InstrumentSchema);
