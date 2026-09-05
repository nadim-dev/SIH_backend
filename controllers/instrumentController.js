import mongoose from "mongoose";
import Decimal from "decimal.js";
import { registerInstrumentSchema } from "../validators/instrumentValidation.js";
import Instrument from "../models/instrumentModel.js";
import Inspection from "../models/Inspection.js";
import { uploadBufferToCloudinary } from "../utils/uploadImagetoCloudinary.js";
import { sanitize } from "../utils/sanitize.js";
import { observationsSchema, eccentricityObservationsSchema } from "../validators/instrumentValidation.js";
import crypto from "node:crypto";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// OIML R 76 Table 3 Metrological Validator
function validateTable3(accuracyClass, max, min, e, d) {
  const maxDec = new Decimal(max);
  const minDec = new Decimal(min);
  const eDec = new Decimal(e);
  const dDec = new Decimal(d);

  if (maxDec.isNegative() || maxDec.isZero())
    throw new Error("Max capacity must be greater than 0.");
  if (minDec.isNegative() || minDec.isZero())
    throw new Error("Min capacity must be greater than 0.");
  if (eDec.isNegative() || eDec.isZero())
    throw new Error("Verification interval (e) must be greater than 0.");
  if (dDec.isNegative() || dDec.isZero())
    throw new Error("Display step (d) must be greater than 0.");

  if (dDec.greaterThan(eDec)) {
    throw new Error(
      `Display step (d=${d}) cannot be larger than verification step (e=${e}).`,
    );
  }
  if (eDec.greaterThan(dDec.times(10))) {
    throw new Error(
      `Verification step (e=${e}) cannot exceed 10 times display step (10d=${dDec.times(10).toString()}).`,
    );
  }
  if (minDec.greaterThanOrEqualTo(maxDec)) {
    throw new Error(
      `Minimum capacity (Min=${min}) must be less than Maximum capacity (Max=${max}).`,
    );
  }

  // Calculate division count n = Max / e
  const nDec = maxDec.dividedBy(eDec);
  const n = nDec.toNumber();

  switch (accuracyClass) {
    case "I":
      if (nDec.lessThan(50000))
        throw new Error(`Class I requires n >= 50,000 (Current n = ${n}).`);
      if (minDec.lessThan(eDec.times(100)))
        throw new Error(
          `Class I requires Min >= 100e (${eDec.times(100).toString()}).`,
        );
      break;

    case "II":
      if (nDec.lessThan(100) || nDec.greaterThan(100000))
        throw new Error(
          `Class II requires 100 <= n <= 100,000 (Current n = ${n}).`,
        );
      if (minDec.lessThan(eDec.times(20)))
        throw new Error(
          `Class II requires Min >= 20e (${eDec.times(20).toString()}).`,
        );
      break;

    case "III":
      if (nDec.lessThan(500) || nDec.greaterThan(10000))
        throw new Error(
          `Class III requires 500 <= n <= 10,000 (Current n = ${n}).`,
        );
      if (minDec.lessThan(eDec.times(20)))
        throw new Error(
          `Class III requires Min >= 20e (${eDec.times(20).toString()}).`,
        );
      break;

    case "IIII":
      if (nDec.lessThan(100) || nDec.greaterThan(1000))
        throw new Error(
          `Class IIII requires 100 <= n <= 1,000 (Current n = ${n}).`,
        );
      if (minDec.lessThan(eDec.times(10)))
        throw new Error(
          `Class IIII requires Min >= 10e (${eDec.times(10).toString()}).`,
        );
      break;

    default:
      throw new Error(`Invalid accuracy class: ${accuracyClass}`);
  }

  return { n };
}

// Generate the 5 load points according to OIML R 76-1 Section 3.5.1
function generateTestPoints(max, min, e) {
  const maxDec = new Decimal(max);
  const minDec = new Decimal(min);
  const eDec = new Decimal(e);

  return [
    {
      step: 0,
      description: "Zero Load (Baseline)",
      load: mongoose.Types.Decimal128.fromString("0.000"),
      mpe: mongoose.Types.Decimal128.fromString(eDec.times(0.5).toString()),
    },
    {
      step: 1,
      description: "Minimum Capacity (Min)",
      load: mongoose.Types.Decimal128.fromString(minDec.toString()),
      mpe: mongoose.Types.Decimal128.fromString(eDec.times(0.5).toString()),
    },
    {
      step: 2,
      description: "First MPE Boundary (500e)",
      load: mongoose.Types.Decimal128.fromString(
        Decimal.min(eDec.times(500), maxDec).toString(),
      ),
      mpe: mongoose.Types.Decimal128.fromString(eDec.times(0.5).toString()),
    },
    {
      step: 3,
      description: "Second MPE Boundary (2000e / 50% Max)",
      load: mongoose.Types.Decimal128.fromString(
        Decimal.min(eDec.times(2000), maxDec.times(0.5)).toString(),
      ),
      mpe: mongoose.Types.Decimal128.fromString(eDec.times(1.0).toString()),
    },
    {
      step: 4,
      description: "Maximum Capacity (Max)",
      load: mongoose.Types.Decimal128.fromString(maxDec.toString()),
      mpe: mongoose.Types.Decimal128.fromString(eDec.times(1.5).toString()),
    },
  ];
}

// Handler: Register Instrument
export const registerInstrument = async (req, res) => {
  console.log("register instrument controller is running");
  try {
    if (!req.file)
      return res.status(400).json({ success: false, error: "Nameplate photo is required." });
    
    const cleanBody = sanitize(req.body);
    const {manufacturer,modelNumber,serialNumber,instrumentType,accuracyClass,unit,max,min,e,d} = registerInstrumentSchema.parse(cleanBody);

    // 1. Check for Duplicate Serial Number
    const existing = await Instrument.findOne({ serialNumber });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `An instrument with serial number "${serialNumber}" is already registered.`,
      });
    }

    // 2. Perform Exact OIML Table 3 Math Checks
    const { n } = validateTable3(accuracyClass, max, min, e, d);

    // 3. Compute the 5 Test Load Points
    const testPoints = generateTestPoints(max, min, e);

    // 4. Save to Database
    const newInstrument = new Instrument({
      manufacturer,
      modelNumber,
      serialNumber,
      instrumentType,
      accuracyClass,
      unit,
      max: mongoose.Types.Decimal128.fromString(max),
      min: mongoose.Types.Decimal128.fromString(min),
      e: mongoose.Types.Decimal128.fromString(e),
      d: mongoose.Types.Decimal128.fromString(d),
      n,
      nameplatePhotoUrl: null,
      testPoints,
    });

    if (req.file) {
      const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "SIH/instruments/nameplates",
        public_id: `${serialNumber}-${Date.now()}`,
      });
      newInstrument.nameplatePhotoUrl = uploaded.secure_url;
    }
    const saved = await newInstrument.save();

    return res.status(201).json({
      success: true,
      message:
        "Instrument verified against OIML Table 3 and registered successfully.",
      instrumentId: saved._id,
      data: saved,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

export const getInstrumentForTesting = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument)
      return res
        .status(404)
        .json({ success: false, error: "Instrument not found." });
    return res.json({ success: true, data: instrument });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid instrument id." });
  }
};

export const submitInstrumentObservations = async (req, res) => {
  try {
    const instrumentId = req.params.id || req.body.instrumentId || req.body.id;
    if (!instrumentId || !mongoose.isValidObjectId(instrumentId)) {
      return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    }

    const payload = observationsSchema.parse(sanitize(req.body));
    if (payload.readings.length !== 9) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: Expected exactly 9 test readings.",
      });
    }

    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) {
      return res.status(404).json({ success: false, message: "Instrument not found" });
    }

    const e = new Decimal(instrument.e.toString());
    const halfE = e.times(0.5);
    const testPoints = [
      ...instrument.testPoints.map((point) => point.toObject()),
      ...instrument.testPoints.slice(0, 4).reverse().map((point, index) => ({
        ...point.toObject(),
        step: instrument.testPoints.length + index,
        description: `Unload to ${point.description.replace(/\s*\([^)]*\)/, "")}`,
      })),
    ];

    const readingsByStep = new Map(payload.readings.map((reading) => [reading.step, reading]));
    if (readingsByStep.size !== 9 || [...Array(9).keys()].some((step) => !readingsByStep.has(step))) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: readings must contain each step from 0 through 8 exactly once.",
      });
    }

    const step0 = readingsByStep.get(0);
    const I0 = new Decimal(step0.indicated.toString());
    const deltaL0 = new Decimal(step0.deltaL.toString());
    const L0 = new Decimal(testPoints[0].load.toString());
    const E0 = I0.plus(halfE).minus(deltaL0).minus(L0);

    let serverCalculatedAllPassed = true;
    const verifiedObservations = testPoints.map((point) => {
      const reading = readingsByStep.get(point.step);
      const I = new Decimal(reading.indicated.toString());
      const deltaL = new Decimal(reading.deltaL.toString());
      const L = new Decimal(point.load.toString());
      const mpe = new Decimal(point.mpe.toString());
      const P = I.plus(halfE).minus(deltaL);
      const Ec = P.minus(L).minus(E0);
      const passed = Ec.abs().lte(mpe);

      if (!passed) serverCalculatedAllPassed = false;

      return {
        stepIndex: point.step,
        label: point.description,
        load: mongoose.Types.Decimal128.fromString(L.toFixed(4)),
        indicated: mongoose.Types.Decimal128.fromString(I.toFixed(4)),
        deltaL: mongoose.Types.Decimal128.fromString(deltaL.toFixed(4)),
        trueP: mongoose.Types.Decimal128.fromString(P.toFixed(4)),
        correctedErrorEc: mongoose.Types.Decimal128.fromString(Ec.toFixed(4)),
        mpeLimit: mongoose.Types.Decimal128.fromString(mpe.toFixed(4)),
        passed,
      };
    });

    let inspection = await Inspection.findOne({ instrumentId });
    if (!inspection) {
      inspection = new Inspection({
        instrumentId,
        testedBy: {
          officerId: req.user?.id || "OFFICER-001",
          officerName: req.user?.name || "Field Inspector",
          submittedAt: new Date(),
        },
      });
    }

    inspection.weighingTest = {
      baselineE0: mongoose.Types.Decimal128.fromString(E0.toFixed(4)),
      readings: verifiedObservations,
      passed: serverCalculatedAllPassed,
    };

    // This is only one part of the inspection. Later tests will determine the final result.
    instrument.status = "TEST_IN_PROGRESS";
    await Promise.all([inspection.save(), instrument.save()]);

    return res.status(200).json({
      success: true,
      conformsToOiml: serverCalculatedAllPassed,
      instrumentStatus: instrument.status,
      baselineE0: E0.toFixed(4),
      verifiedRowsCount: verifiedObservations.length,
      inspectionId: inspection._id,
      message: serverCalculatedAllPassed
        ? "Weighing performance verified and recorded for the remaining inspection tests."
        : "Test recorded, but scale failed to conform to statutory MPE limits.",
    });
  } catch (error) {
    console.error("Submission Error:", error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const submitEccentricityObservations = async (req, res) => {
  try {
    const instrumentId = req.params.id;
    if (!mongoose.isValidObjectId(instrumentId)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const payload = eccentricityObservationsSchema.parse(sanitize(req.body));
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found" });
    const e = new Decimal(instrument.e.toString());
    const halfE = e.div(2);
    const byStep = new Map(payload.positions.map((position) => [position.step, position]));
    if ([1, 2, 3, 4, 5].some((step) => !byStep.has(step))) return res.status(400).json({ success: false, message: "Positions 1 through 5 are required." });
    const pValues = payload.positions.map((position) => new Decimal(position.indicated).plus(halfE).minus(position.deltaL));
    const centerP = pValues[0];
    const mpe = e;
    const positions = payload.positions.map((position, index) => {
      const load = new Decimal(payload.testLoad);
      const trueP = pValues[index];
      const error = trueP.minus(centerP);
      return {
        stepIndex: position.step,
        label: ['Center', 'Front-Left', 'Rear-Left', 'Rear-Right', 'Front-Right'][position.step - 1],
        load: mongoose.Types.Decimal128.fromString(load.toFixed(4)),
        indicated: mongoose.Types.Decimal128.fromString(new Decimal(position.indicated).toFixed(4)),
        deltaL: mongoose.Types.Decimal128.fromString(new Decimal(position.deltaL).toFixed(4)),
        trueP: mongoose.Types.Decimal128.fromString(trueP.toFixed(4)),
        correctedErrorEc: mongoose.Types.Decimal128.fromString(error.toFixed(4)),
        mpeLimit: mongoose.Types.Decimal128.fromString(mpe.toFixed(4)),
        passed: error.abs().lte(mpe),
      };
    });
    const passed = positions.every((position) => position.passed);
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $set: { instrumentId, eccentricityTest: { testLoad: mongoose.Types.Decimal128.fromString(new Decimal(payload.testLoad).toFixed(4)), positions, passed } } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({ success: true, passed, inspectionId: inspection._id, positions });
  } catch (error) {
    console.error("Eccentricity submission error:", error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const submitRepeatabilityObservations = async (req, res) => {
  try {
    const instrumentId = req.params.id;
    if (!mongoose.isValidObjectId(instrumentId)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const runs = req.body?.runs;
    const testLoad = req.body?.testLoad;
    if (!Array.isArray(runs) || runs.length !== 3 || testLoad === undefined) {
      return res.status(400).json({ success: false, message: "Three repeatability runs and a test load are required." });
    }
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found" });
    const e = new Decimal(instrument.e.toString());
    const halfE = e.div(2);
    const pValues = runs.map((run) => new Decimal(run.indicated).plus(halfE).minus(run.deltaL));
    const pMax = Decimal.max(...pValues);
    const pMin = Decimal.min(...pValues);
    const variationRange = pMax.minus(pMin);
    const positions = runs.map((run, index) => {
      const trueP = pValues[index];
      return {
        stepIndex: index + 1,
        label: `Run ${index + 1}`,
        load: mongoose.Types.Decimal128.fromString(new Decimal(testLoad).toFixed(4)),
        indicated: mongoose.Types.Decimal128.fromString(new Decimal(run.indicated).toFixed(4)),
        deltaL: mongoose.Types.Decimal128.fromString(new Decimal(run.deltaL).toFixed(4)),
        trueP: mongoose.Types.Decimal128.fromString(trueP.toFixed(4)),
        correctedErrorEc: mongoose.Types.Decimal128.fromString(trueP.minus(pValues[0]).toFixed(4)),
        mpeLimit: mongoose.Types.Decimal128.fromString(e.toFixed(4)),
        passed: variationRange.lte(e),
      };
    });
    const passed = variationRange.lte(e);
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $set: { instrumentId, repeatabilityTest: { testLoad: mongoose.Types.Decimal128.fromString(new Decimal(testLoad).toFixed(4)), runs: positions, pMax: mongoose.Types.Decimal128.fromString(pMax.toFixed(4)), pMin: mongoose.Types.Decimal128.fromString(pMin.toFixed(4)), variationRange: mongoose.Types.Decimal128.fromString(variationRange.toFixed(4)), mpeLimit: mongoose.Types.Decimal128.fromString(e.toFixed(4)), passed } } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return res.json({ success: true, passed, inspectionId: inspection._id });
  } catch (error) {
    console.error("Repeatability submission error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const submitFullInspection = async (req, res) => {
  try {
    const instrumentId = req.params.id;
    if (!mongoose.isValidObjectId(instrumentId)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const [instrument, inspection] = await Promise.all([
      Instrument.findById(instrumentId),
      Inspection.findOne({ instrumentId }),
    ]);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found" });
    if (!inspection) return res.status(400).json({ success: false, message: "Inspection record not found." });
    const allTestsPassed = Boolean(
      inspection.weighingTest?.passed &&
      inspection.eccentricityTest?.passed &&
      inspection.repeatabilityTest?.passed,
    );
    if (!allTestsPassed) {
      return res.status(400).json({
        success: false,
        message: "All inspection test cases must pass before submission.",
      });
    }
    inspection.allTestsPassed = allTestsPassed;
    inspection.inspectionStatus = "PENDING_APPROVAL";
    inspection.testedBy.submittedAt = new Date();
    instrument.status = "PENDING_APPROVAL";
    await Promise.all([inspection.save(), instrument.save()]);
    return res.status(200).json({ success: true, allTestsPassed: inspection.allTestsPassed, instrumentStatus: instrument.status, inspectionId: inspection._id });
  } catch (error) {
    console.error("Full inspection submission error:", error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const getPendingApprovalInspections = async (req, res) => {
  try {
    const inspections = await Inspection.find({
      allTestsPassed: true,
      inspectionStatus: "PENDING_APPROVAL",
    })
      .populate("instrumentId")
      .sort({ updatedAt: -1 });

    return res.json({ success: true, data: inspections });
  } catch (error) {
    console.error("Pending inspections error:", error);
    return res.status(500).json({ success: false, message: "Failed to load pending inspections." });
  }
};

export const getApprovedInspectionReports = async (req, res) => {
  const reports = await Inspection.find({ allTestsPassed: true, inspectionStatus: "APPROVED", "certificate.certificateNumber": { $exists: true } }).populate("instrumentId").sort({ "certificate.issueDate": -1 });
  return res.json({ success: true, data: reports });
};

export const verifyCertificate = async (req, res) => {
  const inspection = await Inspection.findOne({ "certificate.certificateNumber": req.params.number, inspectionStatus: "APPROVED" }).populate("instrumentId");
  if (!inspection) return res.status(404).json({ success: false, message: "Certificate not found or no longer valid." });
  const certificate = inspection.certificate.toObject ? inspection.certificate.toObject() : inspection.certificate;
  return res.json({ success: true, valid: new Date(certificate.validUntil) >= new Date(), certificate, instrument: inspection.instrumentId, tests: { weighing: inspection.weighingTest?.passed === true, eccentricity: inspection.eccentricityTest?.passed === true, repeatability: inspection.repeatabilityTest?.passed === true } });
};

export const approveInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findOne({
      instrumentId: req.params.id,
      allTestsPassed: true,
      inspectionStatus: "PENDING_APPROVAL",
    });
    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: "This instrument is not ready for approval.",
      });
    }

    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });

    const reviewedBy = req.user?.name || req.body?.reviewedBy || "Administrator";
    const remarks = req.body?.remarks || "All submitted test cases reviewed and approved.";
    const issueDate = new Date();
    const validUntil = new Date(issueDate);
    validUntil.setFullYear(validUntil.getFullYear() + 1);
    const certificateNumber = `LM-${issueDate.getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const signaturePayload = `${certificateNumber}|${instrument._id}|${issueDate.toISOString()}|${validUntil.toISOString()}`;
    const digitalSignatureToken = crypto
      .createHmac("sha256", process.env.mySecretKey || "development-certificate-secret")
      .update(signaturePayload)
      .digest("hex");
    inspection.inspectionStatus = "APPROVED";
    inspection.supervisorAudit = {
      ...inspection.supervisorAudit?.toObject?.(),
      reviewedBy,
      reviewedAt: new Date(),
      decision: "APPROVED",
      remarks,
      digitalSignatureToken,
    };
    inspection.certificate = {
      certificateNumber,
      issueDate,
      validUntil,
      qrVerificationUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/certificate/${certificateNumber}`,
    };
    instrument.status = "APPROVED";
    await Promise.all([inspection.save(), instrument.save()]);

    return res.json({ success: true, message: "Instrument approved and certificate generated successfully.", instrumentStatus: instrument.status, certificate: inspection.certificate, digitalSignatureToken });
  } catch (error) {
    console.error("Approve inspection error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};
