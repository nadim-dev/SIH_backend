import mongoose from "mongoose";

const testEnvironmentSchema = new mongoose.Schema(
  {
    evaluationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Evaluation",
      required: true,
      unique: true,
      index: true,
    },

    temperature: {
      type: Number,
      required: true,
    },

    relativeHumidity: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    barometricPressure: {
      type: Number,
      default: null,
    },

    source: {
      type: String,
      enum: ["MANUAL", "SENSOR"],
      default: "MANUAL",
    },

    recordedAt: {
      type: Date,
      default: Date.now,
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // sensorId: {
    //   type: String,
    //   default: null,
    // },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "TestEnvironment",
  testEnvironmentSchema
);