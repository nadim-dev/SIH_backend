import mongoose from 'mongoose';

const TestPointSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  description: { type: String, required: true },
  load: { type: mongoose.Schema.Types.Decimal128, required: true },
  mpe: { type: mongoose.Schema.Types.Decimal128, required: true }
});

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
    testPoints: [TestPointSchema]
    ,observations: { type: [mongoose.Schema.Types.Mixed], default: [] }
    ,testResult: { type: String, enum: ['PASS', 'FAIL'] }
  },
  {
    timestamps: true,
    toJSON: {
      // Helper to convert Decimal128 to clean strings when sending JSON to React
      transform: (doc, ret) => {
        ['max', 'min', 'e', 'd'].forEach((key) => {
          if (ret[key]) ret[key] = ret[key].toString();
        });
        if (ret.testPoints) {
          ret.testPoints.forEach((tp) => {
            if (tp.load) tp.load = tp.load.toString();
            if (tp.mpe) tp.mpe = tp.mpe.toString();
          });
        }
        return ret;
      }
    }
  }
);

export default mongoose.model('Instrument', InstrumentSchema);
