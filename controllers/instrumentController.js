import mongoose from "mongoose";
import Decimal from "decimal.js";
import { registerInstrumentSchema } from "../validators/instrumentValidation.js";
import Instrument from "../models/instrumentModel.js";
import Inspection from "../models/Inspection.js";
import { uploadBufferToCloudinary } from "../utils/uploadImagetoCloudinary.js";
import cloudinary from "../config/cloudinary.js";
import { reverseGeocode } from "../utils/reverseGeocode.js";
import { sanitize } from "../utils/sanitize.js";
import { observationsSchema, eccentricityObservationsSchema } from "../validators/instrumentValidation.js";
import Evaluation from "../models/evaluationModel.js";
import Document from "../models/documentModel.js";
import TestEnvironment from "../models/testEnviromentModel.js";
import { generateApplicationNumber } from "../utils/generateApplicationNumber.js";
import testRules from "../rules/r76-1-2006-test-rules.json"  with { type: "json" } ;
import TestPlan from "../models/testPlanModel.js";
import User from "../models/userModel.js";
import Notification from "../models/notificationModel.js";
import Report from "../models/reportModel.js";
import { generateTestPlan } from "../utils/generateTestPlan.js";
import { recordAudit } from "../utils/auditLogger.js";
import Laboratory from "../models/laboratoryModel.js";
import { createReportHash } from "../utils/reportHash.js";

const OIML_MPE_INTERVALS = {
  I: [50000, 200000],
  II: [5000, 20000],
  III: [500, 2000],
  IIII: [50, 200],
};

const getMpeForLoad = (accuracyClass, load, e) => {
  const limits = OIML_MPE_INTERVALS[String(accuracyClass || "").trim().toUpperCase()];
  if (!limits) throw new Error(`Unsupported accuracy class: ${accuracyClass}`);
  const intervals = new Decimal(load).div(e);
  const multiplier = intervals.lte(limits[0]) ? 0.5 : intervals.lte(limits[1]) ? 1 : 1.5;
  return new Decimal(e).times(multiplier);
};



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

// Handler: Register Instrument
export const registerInstrument = async (req, res) => {
  console.log("register instrument controller is running");
  
  try {
    const cleanBody = sanitize(req.body);
    const {manufacturer,modelNumber,serialNumber,instrumentType,accuracyClass,unit,technology,indicationType,tareDevice,tareType,maximumTare,hasPrintingDevice,max,min,e,d} = registerInstrumentSchema.parse(cleanBody);

    // 2. Perform Exact OIML Table 3 Math Checks
    const { n } = validateTable3(accuracyClass, max, min, e, d);

    const nameplatePhotoUrl = String(req.body.nameplatePhotoUrl || "");
    const cloudinaryHost = "res.cloudinary.com";
    let validCloudinaryPhotoUrl = false;
    try {
      const parsedPhotoUrl = new URL(nameplatePhotoUrl);
      validCloudinaryPhotoUrl = parsedPhotoUrl.protocol === "https:"
        && parsedPhotoUrl.hostname === cloudinaryHost
        && parsedPhotoUrl.pathname.startsWith(`/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`);
    } catch {}
    if (!req.file && !validCloudinaryPhotoUrl) {
      return res.status(400).json({ success: false, error: "A valid nameplate photo is required." });
    }

    const applicationNumberPromise = generateApplicationNumber().then(
      (applicationNumber) => ({ applicationNumber }),
      (error) => ({ error }),
    );

    const imageUploadPromise = req.file
      ? uploadBufferToCloudinary(req.file.buffer, {
          folder: "SIH/instruments/nameplates",
          public_id: `${serialNumber}-${Date.now()}`,
        }).then((uploaded) => ({ uploaded }), (error) => ({ error }))
      : Promise.resolve({ uploaded: { secure_url: nameplatePhotoUrl } });

    // 3. Save to Database. Test cases are generated by a separate workflow.
    const newInstrument = new Instrument({
      manufacturer,
      modelNumber,
      serialNumber,
      instrumentType,
      accuracyClass,
      unit,
      technology,
      indicationType,
      tareDevice,
      tareType,
      maximumTare: mongoose.Types.Decimal128.fromString(maximumTare),
      hasPrintingDevice,
      max: mongoose.Types.Decimal128.fromString(max),
      min: mongoose.Types.Decimal128.fromString(min),
      e: mongoose.Types.Decimal128.fromString(e),
      d: mongoose.Types.Decimal128.fromString(d),
      n,
      nameplatePhotoUrl: validCloudinaryPhotoUrl ? nameplatePhotoUrl : null,
      registeredBy:req.user._id
    });

    const saved = await newInstrument.save();
    const [imageResult, applicationResult] = await Promise.all([imageUploadPromise, applicationNumberPromise]);
    if (imageResult.error) throw imageResult.error;
    if (applicationResult.error) throw applicationResult.error;
    const { uploaded } = imageResult;
    const { applicationNumber } = applicationResult;

    if (!validCloudinaryPhotoUrl) {
      await Instrument.updateOne(
        { _id: saved._id },
        { $set: { nameplatePhotoUrl: uploaded.secure_url } },
      );
      saved.nameplatePhotoUrl = uploaded.secure_url;
    }

    await Evaluation.create({
          instrumentId: saved._id,
          testingOfficerId: req.user._id,
          applicationNumber,
          documentsStatus: "PENDING",
          environmentStatus: "LOCKED",
          testPlanStatus: "LOCKED",
          testingStatus: "LOCKED",
          complianceStatus: "LOCKED",
          reviewStatus: "LOCKED",
          reportStatus: "LOCKED"
    });

    void recordAudit(req, {
      action: "Instrument Registered",
      details: `Registered instrument ${manufacturer} ${modelNumber} with serial number ${serialNumber}.`,
      relatedTo: applicationNumber,
      relatedModel: "Instrument",
      metadata: { applicationNumber, serialNumber },
    });

    return res.status(201).json({
      success: true,
      message:
        "Instrument verified against OIML Table 3 and registered successfully.",
      instrumentId: saved._id,
      applicationNumber,
      data: saved,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.serialNumber) {
      return res.status(409).json({
        success: false,
        error: `An instrument with serial number "${req.body.serialNumber}" is already registered.`,
      });
    }
    console.log(error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

export const getMyEvaluations = async (req, res) => {
  try {
    let testingOfficerId = req.user._id;
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    const isAdmin = adminRoles.includes(String(req.user.role || "").trim().toUpperCase());
    if ((req.user.role === "LAB SUPERVISOR" || isAdmin) && req.query.officerId) {
      if (!mongoose.isValidObjectId(req.query.officerId)) return res.status(400).json({ success: false, message: "A valid officer ID is required." });
      const officerQuery = { _id: req.query.officerId, role: "TESTING OFFICER" };
      if (!isAdmin) officerQuery.supervisorId = req.user._id;
      const officer = await User.findOne(officerQuery).select("_id").lean();
      if (!officer) return res.status(404).json({ success: false, message: "Testing officer not found under this supervisor." });
      testingOfficerId = officer._id;
    }
    const evaluations = await Evaluation.find({ testingOfficerId })
      .populate("instrumentId", "manufacturer modelNumber serialNumber instrumentType createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: evaluations });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch evaluations." });
  }
};

export const getTestingDashboardSummary = async (req, res) => {
  try {
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    const isAdmin = adminRoles.includes(String(req.user.role || "").trim().toUpperCase());
    let testingOfficerId = req.user._id;

    if (req.query.officerId && (isAdmin || req.user.role === "LAB SUPERVISOR")) {
      if (!mongoose.isValidObjectId(req.query.officerId)) {
        return res.status(400).json({ success: false, message: "A valid officer ID is required." });
      }
      const officerQuery = { _id: req.query.officerId, role: "TESTING OFFICER" };
      if (!isAdmin) officerQuery.supervisorId = req.user._id;
      const officer = await User.findOne(officerQuery).select("_id").lean();
      if (!officer) return res.status(404).json({ success: false, message: "Testing officer not found under this supervisor." });
      testingOfficerId = officer._id;
    }

    const [registeredInstruments, testsInProgress, awaitingReview, completedTests] = await Promise.all([
      Instrument.countDocuments({ registeredBy: testingOfficerId }),
      Evaluation.countDocuments({ testingOfficerId, status: { $in: ["TESTING", "COMPLIANCE_EVALUATION"] } }),
      Evaluation.countDocuments({ testingOfficerId, status: "SUPERVISOR_REVIEW" }),
      Evaluation.countDocuments({ testingOfficerId, status: "COMPLETED" }),
    ]);

    return res.json({ success: true, data: { registeredInstruments, testsInProgress, awaitingReview, completedTests } });
  } catch (error) {
    console.error("Get testing dashboard summary error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch testing dashboard summary." });
  }
};

export const getSupervisorEvaluations = async (req, res) => {
  try {
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    const isAdmin = adminRoles.includes(String(req.user.role || "").trim().toUpperCase());
    if (req.user.role !== "LAB SUPERVISOR" && !isAdmin) {
      return res.status(403).json({ success: false, message: "Only supervisors and administrators can view these evaluations." });
    }
    const officerQuery = { role: "TESTING OFFICER" };
    if (isAdmin && req.query.labId) officerQuery.labId = req.query.labId;
    if (!isAdmin) officerQuery.supervisorId = req.user._id;
    const officers = await User.find(officerQuery).select("_id name").lean();
    const officerIds = officers.map((officer) => officer._id);
    const officerNames = new Map(officers.map((officer) => [String(officer._id), officer.name]));

    const evaluations = await Evaluation.find({
      testingOfficerId: { $in: officerIds },
      status: "SUPERVISOR_REVIEW",
    })
      .populate("instrumentId", "manufacturer modelNumber serialNumber instrumentType")
      .sort({ updatedAt: -1 })
      .lean();

    const data = evaluations.map((evaluation) => ({
      ...evaluation,
      testingOfficerName: officerNames.get(String(evaluation.testingOfficerId)) || "—",
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Get supervisor evaluations error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch supervisor evaluations." });
  }
};

export const getEvaluationDocuments = async (req, res) => {
  try {
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId, testingOfficerId: req.user._id }).select("_id");
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found." });

    const documents = await Document.find({ evaluationId: evaluation._id }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch documents." });
  }
};

//* controller for generating test plan


export const generateTestPlanController = async (req, res) => {
  try {
    // The frontend workflow uses the human-readable application number
    // (for example, NAWI-2026-007), not Evaluation._id.
    const { evaluationId: applicationNumber } = req.params;

    // 1. Find evaluation
    const evaluation = await Evaluation.findOne({ applicationNumber });

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: "Evaluation not found",
      });
    }

    // 2. Find instrument
    const instrument = await Instrument.findById(
      evaluation.instrumentId
    );

    if (!instrument) {
      return res.status(404).json({
        success: false,
        message: "Instrument not found",
      });
    }

    // 3. Generate applicable tests. Reuse an existing plan on refresh/retry.
    const tests = generateTestPlan(instrument);

    const existingPlan = await TestPlan.findOne({ evaluationId: evaluation._id });
    if (existingPlan) {
      await Inspection.findOneAndUpdate(
        { instrumentId: instrument._id },
        { $setOnInsert: { instrumentId: instrument._id, evaluationId: evaluation._id } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
      if (!existingPlan.tests?.length) {
        existingPlan.tests = tests;
        existingPlan.status = "GENERATED";
        await existingPlan.save();
      }
      await Evaluation.findByIdAndUpdate(evaluation._id, {
        $set: {
          testPlanId: existingPlan._id,
          testPlanStatus: "COMPLETED",
          testingStatus: "PENDING",
          status: "TESTING",
          progress: 45,
        },
      });
      return res.status(200).json({
        success: true,
        message: "Test plan already generated",
        data: { ...existingPlan.toObject(), instrument: instrument.toJSON() },
      });
    }

    // 4. Create TestPlan
    let testPlan;
    try {
      testPlan = await TestPlan.create({
        evaluationId: evaluation._id,
        instrumentId: instrument._id,
        standard: "OIML R 76-1",
        standardVersion: "2006",
        tests,
        status: "GENERATED",
      });
    } catch (createError) {
      if (createError?.code !== 11000) throw createError;
      testPlan = await TestPlan.findOne({ evaluationId: evaluation._id });
      if (!testPlan) throw createError;
    }

    await Inspection.findOneAndUpdate(
      { instrumentId: instrument._id },
      { $setOnInsert: { instrumentId: instrument._id, evaluationId: evaluation._id } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    // 5. Update evaluation
    evaluation.testPlanId = testPlan._id;
    evaluation.testPlanStatus = "COMPLETED";
    evaluation.testingStatus = "PENDING";
    evaluation.status = "TESTING";
    evaluation.progress = 45;

    await evaluation.save();

    return res.status(201).json({
      success: true,
      message: "Test plan generated successfully",
      data: { ...testPlan.toObject(), instrument: instrument.toJSON() },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate test plan",
    });
  }
};

export const getTestExecutionData = async (req, res) => {
  try {
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId })
      .populate("instrumentId")
      .populate("testPlanId");
    if (!evaluation) return res.status(404).json({ success: false, message: "Evaluation not found." });
    if (!evaluation.testPlanId) return res.status(404).json({ success: false, message: "Test plan has not been generated." });
    // Add newly introduced, applicable rules to existing active plans without resetting existing progress.
    const expectedTests = generateTestPlan(evaluation.instrumentId);
    const sensitivityRule = expectedTests.find((test) => test.code === "SENSITIVITY");
    const plan = evaluation.testPlanId;
    if (sensitivityRule && !plan.tests.some((test) => test.code === "SENSITIVITY")) {
      const temperatureIndex = plan.tests.findIndex((test) => test.code === "TEMPERATURE_INFLUENCE");
      const ruleToInsert = typeof sensitivityRule.toObject === "function" ? sensitivityRule.toObject() : sensitivityRule;
      plan.tests.splice(temperatureIndex >= 0 ? temperatureIndex + 1 : plan.tests.length, 0, ruleToInsert);
      plan.tests.forEach((test, index) => { test.sequence = index + 1; });
      await plan.save();
    }
    const inspection = await Inspection.findOne({ evaluationId: evaluation._id })
      || await Inspection.findOne({ instrumentId: evaluation.instrumentId?._id || evaluation.instrumentId });
    return res.json({ success: true, data: { evaluation, instrument: evaluation.instrumentId, testPlan: evaluation.testPlanId, inspection } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to load test execution data." });
  }
};

export const reviewSupervisorEvaluation = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") return res.status(403).json({ success: false, message: "Only lab supervisors can review evaluations." });
    const { decision, remarks = "" } = req.body;
    if (!["ACCEPT", "REJECT"].includes(decision)) return res.status(400).json({ success: false, message: "Invalid review decision." });
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId, status: "SUPERVISOR_REVIEW" });
    const assignedOfficer = evaluation ? await User.exists({ _id: evaluation.testingOfficerId, role: "TESTING OFFICER", supervisorId: req.user._id }) : null;
    if (!evaluation || !assignedOfficer) return res.status(404).json({ success: false, message: "Evaluation is not available for review." });
    evaluation.reviewStatus = decision === "ACCEPT" ? "APPROVED" : "CORRECTION_REQUIRED";
    evaluation.status = decision === "ACCEPT" ? "COMPLETED" : "CORRECTION_REQUIRED";
    evaluation.supervisorRemarks = remarks;
    evaluation.reviewedAt = new Date();
    if (decision === "ACCEPT") {
      evaluation.supervisorId = req.user._id;
      evaluation.completedAt = evaluation.reviewedAt;
      evaluation.documentsStatus = "COMPLETED";
      evaluation.testPlanStatus = "COMPLETED";
      evaluation.environmentStatus = "COMPLETED";
      evaluation.testingStatus = "COMPLETED";
      evaluation.complianceStatus = "COMPLIANT";
      evaluation.complianceResult = "PASS";
      evaluation.reviewStatus = "APPROVED";
      evaluation.reportStatus = "GENERATED";
      evaluation.progress = 100;
      const [inspectionByEvaluation, instrument, laboratory] = await Promise.all([
        Inspection.findOne({ evaluationId: evaluation._id }),
        Instrument.findById(evaluation.instrumentId),
        Laboratory.findById(req.user.labId).select("name code type address city state pinCode officialEmail contactNumber logoUrl"),
      ]);
      const laboratoryDetails = laboratory ? {
        name: laboratory.name,
        code: laboratory.code,
        type: laboratory.type,
        address: laboratory.address,
        city: laboratory.city,
        state: laboratory.state,
        pinCode: laboratory.pinCode,
        officialEmail: laboratory.officialEmail,
        contactNumber: laboratory.contactNumber,
        logoUrl: laboratory.logoUrl,
      } : null;
      const inspection = inspectionByEvaluation || await Inspection.findOne({ instrumentId: evaluation.instrumentId });
      if (inspection) inspection.inspectionStatus = "APPROVED";
      if (instrument) instrument.status = "APPROVED";
      const approvedAt = new Date();
      const report = await Report.findOneAndUpdate(
        { evaluationId: evaluation._id },
        {
          $setOnInsert: {
            evaluationId: evaluation._id,
            inspectionId: inspection?._id,
            instrumentId: instrument?._id || evaluation.instrumentId,
            reportStatus: "GENERATED",
            instrumentDetails: instrument?.toObject?.() || instrument,
            testPlan: evaluation.testPlanId ? (await TestPlan.findById(evaluation.testPlanId))?.toObject?.() : null,
            testResults: inspection?.toObject?.() || inspection,
            supervisorId: req.user._id,
            laboratoryName: laboratory?.name || null,
            laboratoryDetails,
            complianceStatus: evaluation.complianceStatus,
            approvedAt,
          },
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
      );
      const reportHash = createReportHash(report.toObject());
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      report.reportHash = reportHash;
      report.qrCode = `${frontendUrl}/verify-report/${report._id}`;
      await report.save();
      evaluation.reportId = report._id;
      evaluation.reportHash = reportHash;
      evaluation.qrCode = report.qrCode;
      evaluation.reportStatus = "GENERATED";
      await Promise.all([
        evaluation.save(),
        inspection?.save(),
        instrument?.save(),
        Notification.create({
          recipientId: evaluation.testingOfficerId,
          recipientRole: "TESTING_OFFICER",
          message: `Application ${evaluation.applicationNumber} for ${instrument?.manufacturer || "the instrument"} ${instrument?.modelNumber || ""} has been approved by the supervisor. The evaluation is now complete.`,
        }),
      ]);
      await recordAudit(req, {
        action: "Report Generated",
        details: `Generated report for application ${evaluation.applicationNumber}.`,
        relatedTo: String(report._id),
        relatedModel: "Report",
        metadata: { applicationNumber: evaluation.applicationNumber },
      });
    } else {
      await evaluation.save();
    }
    return res.json({ success: true, data: evaluation });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};

export const getGeneratedReport = async (req, res) => {
  try {
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId }).populate("instrumentId");
    if (!evaluation) return res.status(404).json({ success: false, message: "Evaluation not found." });
    const isAssignedTestingOfficer = req.user.role === "TESTING OFFICER"
      && String(evaluation.testingOfficerId) === String(req.user._id);
    const isSupervisor = req.user.role === "LAB SUPERVISOR";
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    const isAdmin = adminRoles.includes(String(req.user.role || "").trim().toUpperCase());
    if (!isAssignedTestingOfficer && !isSupervisor && !isAdmin) {
      return res.status(403).json({ success: false, message: "You are not authorized to view this report." });
    }
    const assignedOfficer = isSupervisor
      ? await User.exists({ _id: evaluation.testingOfficerId, role: "TESTING OFFICER", supervisorId: req.user._id })
      : isAdmin;
    if (!evaluation.reportId) return res.status(404).json({ success: false, message: "Generated report not found." });
    const report = await Report.findById(evaluation.reportId)
      .populate({ path: "evaluationId", select: "applicationNumber testingOfficerId", populate: { path: "testingOfficerId", select: "name role" } })
      .populate({
        path: "supervisorId",
        select: "name role labId",
        populate: { path: "labId", select: "address city state pinCode officialEmail contactNumber" },
      })
      .lean();
    const reportSupervisorId = report?.supervisorId?._id || report?.supervisorId;
    const isReportOwner = report && String(reportSupervisorId) === String(req.user._id);
    if (!report || (!assignedOfficer && !isReportOwner && !isAssignedTestingOfficer)) return res.status(404).json({ success: false, message: "Generated report not found." });
    return res.json({ success: true, data: report });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to load report." });
  }
};

export const verifyReport = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reportId)) {
      return res.status(400).json({ success: false, message: "A valid report ID is required." });
    }
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ success: false, message: "Report not found." });
    const currentHash = createReportHash(report.toObject());
    const [instrument, evaluation, supervisor, supervisorLaboratory] = await Promise.all([
      Instrument.findById(report.instrumentId).select("manufacturer modelNumber serialNumber").lean(),
      Evaluation.findById(report.evaluationId).select("applicationNumber complianceStatus testingOfficerId").populate({ path: "testingOfficerId", select: "labId", populate: { path: "labId", select: "name" } }).lean(),
      User.findById(report.supervisorId).select("labId").populate({ path: "labId", select: "name" }).lean(),
      report.supervisorId
        ? Laboratory.findOne({ supervisorId: report.supervisorId }).select("name").lean()
        : Promise.resolve(null),
    ]);
    const applicationNumber = evaluation?.applicationNumber || null;
    const laboratoryName = report.laboratoryDetails?.name || report.laboratoryName || supervisor?.labId?.name || supervisorLaboratory?.name || evaluation?.testingOfficerId?.labId?.name || null;
    const testResultFields = [
      ["General Examination", report.testResults?.generalExamination?.passed],
      ["Weighing Performance", report.testResults?.weighingTest?.passed],
      ["Repeatability", report.testResults?.repeatabilityTest?.passed],
      ["Eccentricity", report.testResults?.eccentricityTest?.passed],
      ["Tare Test", report.testResults?.tareTest?.passed],
    ];
    const tests = testResultFields
      .filter(([, passed]) => typeof passed === "boolean")
      .map(([name, passed]) => ({ name, passed }));
    const derivedComplianceStatus = tests.length
      ? tests.every((test) => test.passed) ? "COMPLIANT" : "NON_COMPLIANT"
      : null;
    return res.json({
      success: true,
      valid: Boolean(report.reportHash) && currentHash === report.reportHash,
      report: {
        reportId: report._id,
        reportHash: report.reportHash,
        reportStatus: report.reportStatus,
        approvedAt: report.approvedAt,
        applicationNumber,
        reportNumber: applicationNumber ? `NAWI/TR/${applicationNumber.replace(/^NAWI-/, "")}` : null,
        laboratoryName,
        instrument,
        complianceStatus: report.complianceStatus || evaluation?.complianceStatus || report.testResults?.complianceStatus || report.testResults?.complianceResult || derivedComplianceStatus,
        tests,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Unable to verify report." });
  }
};

export const getGeneratedReports = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") return res.status(403).json({ success: false, message: "Only lab supervisors can view reports." });
    const reports = await Report.find({ supervisorId: req.user._id }).populate("evaluationId", "applicationNumber").populate("instrumentId", "instrumentType manufacturer modelNumber serialNumber accuracyClass").sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: reports });
  } catch (error) { return res.status(400).json({ success: false, message: error.message || "Failed to load reports." }); }
};

export const getAllGeneratedReportsAdmin = async (req, res) => {
  try {
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    if (!adminRoles.includes(String(req.user.role || "").trim().toUpperCase())) {
      return res.status(403).json({ success: false, message: "Only administrators can view all reports." });
    }
    const reports = await Report.find({ reportStatus: { $in: ["GENERATED", "FINALIZED"] } })
      .populate("evaluationId", "applicationNumber")
      .populate("instrumentId", "instrumentType manufacturer modelNumber serialNumber accuracyClass")
      .populate({ path: "supervisorId", select: "labId", populate: { path: "labId", select: "name" } })
      .sort({ createdAt: -1 })
      .lean();
    const reportsWithLaboratory = reports.map((report) => ({
      ...report,
      laboratoryName: report.supervisorId?.labId?.name || report.laboratoryName || null,
    }));
    return res.json({ success: true, data: reportsWithLaboratory });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load all reports." });
  }
};

export const uploadEvaluationDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "A document file is required." });
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId, testingOfficerId: req.user._id }).select("_id");
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found." });

    const documentType = String(req.body.documentType || "");
    if (documentType !== "OTHER" && req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "This document type only accepts PDF files." });
    }
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      resource_type: "image",
      folder: `SIH/evaluations/${evaluation._id}/documents`,
      public_id: documentType,
      overwrite: true,
    });

    const document = await Document.findOneAndUpdate(
      { evaluationId: evaluation._id, documentType },
      {
        originalName: req.file.originalname,
        fileUrl: uploaded.secure_url,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ success: true, data: document });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to upload document." });
  }
};

export const completeEvaluationDocuments = async (req, res) => {
  try {
    const evaluation = await Evaluation.findOne({ applicationNumber: req.params.applicationId, testingOfficerId: req.user._id }).select("_id");
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found." });

    const requiredDocumentTypes = ["TECHNICAL_DOCUMENTATION"];
    const uploadedTypes = await Document.distinct("documentType", {
      evaluationId: evaluation._id,
      documentType: { $in: requiredDocumentTypes },
    });
    const missingTypes = requiredDocumentTypes.filter((type) => !uploadedTypes.includes(type));
    if (missingTypes.length) {
      return res.status(400).json({ message: "Upload all required documents before continuing." });
    }

    const updatedEvaluation = await Evaluation.findByIdAndUpdate(
      evaluation._id,
      {
        $set: {
          documentsStatus: "COMPLETED",
          environmentStatus: "PENDING",
          status: "ENVIRONMENT_PENDING",
          progress: 25,
        },
      },
      { returnDocument: "after", runValidators: true },
    );

    return res.json({ success: true, data: updatedEvaluation });
  } catch (error) {
    return res.status(500).json({ message: "Failed to complete document upload." });
  }
};

export const saveEvaluationEnvironment = async (req, res) => {
  try {
    const { temperature, relativeHumidity, barometricPressure } = req.body;
    const parsedTemperature = Number(temperature);
    const parsedHumidity = Number(relativeHumidity);
    const hasPressure = barometricPressure !== undefined && barometricPressure !== null && String(barometricPressure).trim() !== "";
    const parsedPressure = hasPressure ? Number(barometricPressure) : null;

    if (!Number.isFinite(parsedTemperature) || !Number.isFinite(parsedHumidity)) {
      return res.status(400).json({ message: "Temperature and relative humidity are required." });
    }
    if (parsedHumidity < 0 || parsedHumidity > 100) {
      return res.status(400).json({ message: "Relative humidity must be between 0 and 100." });
    }
    if (hasPressure && !Number.isFinite(parsedPressure)) {
      return res.status(400).json({ message: "Barometric pressure must be a valid number." });
    }

    const evaluation = await Evaluation.findOne({
      applicationNumber: req.params.applicationId,
      testingOfficerId: req.user._id,
    }).select("_id status environmentStatus");
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found." });
    if (!["ENVIRONMENT_PENDING", "TEST_PLAN_PENDING"].includes(evaluation.status)) {
      return res.status(400).json({ message: "Complete the previous evaluation stage first." });
    }

    const environment = await TestEnvironment.findOneAndUpdate(
      { evaluationId: evaluation._id },
      {
        evaluationId: evaluation._id,
        temperature: parsedTemperature,
        relativeHumidity: parsedHumidity,
        barometricPressure: parsedPressure,
        source: "MANUAL",
        recordedAt: new Date(),
        recordedBy: req.user._id,
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    const updatedEvaluation = await Evaluation.findByIdAndUpdate(
      evaluation._id,
      {
        $set: {
          testEnvironmentId: environment._id,
          environmentStatus: "COMPLETED",
          testPlanStatus: "PENDING",
          status: "TEST_PLAN_PENDING",
          progress: 35,
        },
      },
      { returnDocument: "after", runValidators: true },
    );

    return res.json({ success: true, data: { environment, evaluation: updatedEvaluation } });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to save laboratory environment." });
  }
};


export const getInstrumentForTesting = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument)
      return res
        .status(404)
        .json({ success: false, error: "Instrument not found." });
    const inspection = await Inspection.findOne({ instrumentId: instrument._id }).select('generalExamination.photos').lean();
    return res.json({
      success: true,
      data: {
        ...instrument.toJSON(),
        generalExaminationPhotos: inspection?.generalExamination?.photos || {},
      },
    });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid instrument id." });
  }
};

export const getWeighingTestConfig = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const inspection = await Inspection.findOne({ instrumentId: instrument._id });
    if (!inspection) return res.status(404).json({ success: false, message: "Inspection record not found." });
    if (!inspection.weighingTest?.testLoads?.length || inspection.weighingTest.testLoads.length < 5) {
      const max = new Decimal(instrument.max.toString());
      const min = new Decimal(instrument.min.toString());
      const e = new Decimal(instrument.e.toString());
      const roundToScale = (value) => value.div(e).round().times(e);
      const generatedLoads = [
        [min, "Minimum load"],
        [max.div(4), "One-quarter maximum load"],
        [max.div(2), "Half maximum load"],
        [max.times(3).div(4), "Three-quarter maximum load"],
        [max, "Maximum load"],
      ].map(([load, description], step) => ({
        step,
        description,
        load: mongoose.Types.Decimal128.fromString(roundToScale(load).toFixed(4)),
        mpe: mongoose.Types.Decimal128.fromString(e.toFixed(4)),
      }));
      inspection.weighingTest = { ...(inspection.weighingTest?.toObject?.() || {}), testLoads: generatedLoads };
      await inspection.save();
    }
    const e = new Decimal(instrument.e.toString());
    inspection.weighingTest.testLoads = inspection.weighingTest.testLoads.map((point) => {
      const load = new Decimal(point.load.toString());
      const mpe = getMpeForLoad(instrument.accuracyClass, load, e);
      return { ...point.toObject(), mpe: mongoose.Types.Decimal128.fromString(mpe.toFixed(4)) };
    });
    await inspection.save();
    const evaluation = await Evaluation.findOne({ instrumentId: instrument._id }).sort({ createdAt: -1 });
    if (evaluation) {
      evaluation.testingStatus = "IN_PROGRESS";
      evaluation.status = "TESTING";
      await evaluation.save();
      if (evaluation.testPlanId) await TestPlan.findByIdAndUpdate(evaluation.testPlanId, { status: "IN_PROGRESS" });
    }
    instrument.status = "TEST_IN_PROGRESS";
    await instrument.save();
    return res.json({ success: true, data: { instrument: instrument.toJSON(), testPoints: inspection.weighingTest.testLoads.map((point) => ({ step: point.step, description: point.description, load: point.load.toString(), mpe: point.mpe.toString() })) } });
  } catch (error) { return res.status(400).json({ success: false, message: error.message || "Failed to load weighing test configuration." }); }
};

export const uploadGeneralExaminationPhoto = async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const photoKey = req.body?.photoKey;
    const allowedPhotoKeys = ['nameplate', 'level', 'seal', 'display'];
    if (!mongoose.isValidObjectId(instrumentId) || !allowedPhotoKeys.includes(photoKey)) {
      return res.status(400).json({ success: false, message: 'A valid instrument and photo type are required.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'An image file is required.' });
    if (!(await Instrument.exists({ _id: instrumentId }))) {
      return res.status(404).json({ success: false, message: 'Instrument not found.' });
    }

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'SIH/general-examination',
      resource_type: 'image',
    });
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $set: { instrumentId, [`generalExamination.photos.${photoKey}`]: uploaded.secure_url } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    return res.status(201).json({ success: true, photoKey, url: uploaded.secure_url, inspectionId: inspection._id });
  } catch (error) {
    console.error('General examination photo upload error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Failed to upload photo.' });
  }
};

const extractNameplateFields = async (file) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Nameplate OCR is not configured on the server.");

    const mimeType = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
    const image = `data:${mimeType};base64,${file.buffer.toString("base64")}`;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b",
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: "system", content: "Read weighing instrument nameplate images. Return only valid JSON with keys manufacturer, modelNumber, serialNumber, instrumentType, accuracyClass, max, min, verificationScaleInterval, actualScaleInterval, unit, typeApprovalMark, softwareId. Use strings for values and empty strings for unreadable or absent values. Do not infer missing values." },
          { role: "user", content: [{ type: "text", text: "Extract every requested value from this nameplate. Preserve the printed value and units." }, { type: "image_url", image_url: { url: image } }] },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Groq nameplate OCR error:", response.status, result?.error?.message || "request failed");
      throw new Error("OCR could not read the nameplate. Try a clearer image.");
    }
    const content = result.choices?.[0]?.message?.content;
    const fields = JSON.parse(content || "{}");
    const allowedFields = ["manufacturer", "modelNumber", "serialNumber", "instrumentType", "accuracyClass", "max", "min", "verificationScaleInterval", "actualScaleInterval", "unit", "typeApprovalMark", "softwareId"];
    return Object.fromEntries(allowedFields.map((key) => [key, String(fields[key] ?? "").trim()]));
};

export const extractRegistrationNameplateOcr = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "A nameplate image is required." });
    const [data, uploaded] = await Promise.all([
      extractNameplateFields(req.file),
      uploadBufferToCloudinary(req.file.buffer, {
        folder: "SIH/instruments/nameplates",
        public_id: `nameplate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }),
    ]);
    return res.json({ success: true, data, nameplatePhotoUrl: uploaded.secure_url });
  } catch (error) {
    console.error("Registration nameplate OCR error:", error.message);
    const status = error.message.includes("not configured") ? 503 : 502;
    return res.status(status).json({ success: false, message: error.message || "OCR failed to process the nameplate image." });
  }
};

export const extractNameplateOcr = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    if (!req.file) return res.status(400).json({ success: false, message: "A nameplate image is required." });
    if (!(await Instrument.exists({ _id: req.params.id }))) return res.status(404).json({ success: false, message: "Instrument not found." });
    return res.json({ success: true, data: await extractNameplateFields(req.file) });
  } catch (error) {
    console.error("Nameplate OCR error:", error.message);
    return res.status(502).json({ success: false, message: "OCR failed to process the nameplate image." });
  }
};

export const uploadWeighingEvidence = async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const testKey = req.body?.testType || "weighingTest";
    if (!["weighingTest", "repeatabilityTest", "eccentricityTest", "tareTest", "sensitivityTest"].includes(testKey)) {
      return res.status(400).json({ success: false, message: "Invalid test type." });
    }
    if (!mongoose.isValidObjectId(instrumentId)) {
      return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "An image file is required." });
    const latitude = req.body?.latitude === undefined || req.body.latitude === "" ? null : Number(req.body.latitude);
    const longitude = req.body?.longitude === undefined || req.body.longitude === "" ? null : Number(req.body.longitude);
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
      return res.status(400).json({ success: false, message: "Invalid evidence location." });
    }

    const inspection = await Inspection.findOne({ instrumentId });
    if (!inspection) return res.status(404).json({ success: false, message: "Inspection record not found." });
    if ((inspection[testKey]?.evidence || []).length >= 3) {
      return res.status(400).json({ success: false, message: "You can upload a maximum of 3 evidence images." });
    }

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: `SIH/${testKey}-evidence`,
      resource_type: "image",
    });
    const address = await reverseGeocode(latitude, longitude);
    const evidenceItem = { url: uploaded.secure_url, publicId: uploaded.public_id, uploadedAt: new Date(), location: { latitude, longitude, address } };
    const updatedInspection = await Inspection.findOneAndUpdate(
      { _id: inspection._id },
      { $push: { [`${testKey}.evidence`]: evidenceItem } },
      { returnDocument: "after", runValidators: false },
    );
    return res.status(201).json({ success: true, evidence: updatedInspection?.[testKey]?.evidence || [] });
  } catch (error) {
    console.error("Weighing evidence upload error:", error);
    return res.status(400).json({ success: false, message: error.message || "Failed to upload evidence." });
  }
};

export const deleteWeighingEvidence = async (req, res) => {
  try {
    const { id: instrumentId } = req.params;
    const { testType: testKey, url } = req.body || {};
    const allowedTests = ["weighingTest", "repeatabilityTest", "eccentricityTest", "tareTest", "sensitivityTest"];
    if (!allowedTests.includes(testKey) || typeof url !== "string") {
      return res.status(400).json({ success: false, message: "A valid test and evidence image are required." });
    }
    if (!mongoose.isValidObjectId(instrumentId)) {
      return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    }

    const instrument = await Instrument.findById(instrumentId).select("registeredBy").lean();
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const role = String(req.user?.role || "").trim().toUpperCase().replace(/\s+/g, "_");
    const isAdmin = ["NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"].includes(role);
    if (!isAdmin && String(instrument.registeredBy) !== String(req.user?._id)) {
      return res.status(403).json({ success: false, message: "Only the registering testing officer can delete this evidence." });
    }

    const inspection = await Inspection.findOne({ instrumentId });
    const evidenceItem = inspection?.[testKey]?.evidence?.find((item) => item.url === url);
    if (!inspection || !evidenceItem) {
      return res.status(404).json({ success: false, message: "Evidence image not found." });
    }

    let publicId = evidenceItem.publicId;
    if (!publicId) {
      try {
        const photoUrl = new URL(url);
        const expectedPrefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
        if (photoUrl.protocol !== "https:" || photoUrl.hostname !== "res.cloudinary.com" || !photoUrl.pathname.startsWith(expectedPrefix)) {
          return res.status(400).json({ success: false, message: "Invalid evidence image URL." });
        }
        const uploadedPath = photoUrl.pathname.slice(expectedPrefix.length).replace(/^v\d+\//, "");
        publicId = decodeURIComponent(uploadedPath).replace(/\.[^/.]+$/, "");
      } catch {
        return res.status(400).json({ success: false, message: "Invalid evidence image URL." });
      }
    }

    await Inspection.updateOne(
      { _id: inspection._id },
      { $pull: { [`${testKey}.evidence`]: { url } } },
    );
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    } catch (cleanupError) {
      console.error("Cloudinary evidence cleanup failed:", cleanupError.message);
    }
    return res.json({ success: true, message: "Evidence image deleted." });
  } catch (error) {
    console.error("Weighing evidence deletion error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete evidence image." });
  }
};

export const submitGeneralExamination = async (req, res) => {
  try {
    const { instrumentId, checklist = [], photos = {}, passed } = req.body;
    if (!mongoose.isValidObjectId(instrumentId)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    if (passed !== true) return res.status(400).json({ success: false, message: "General Examination must pass before proceeding." });
    const [instrument, evaluation] = await Promise.all([
      Instrument.findById(instrumentId),
      Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 }),
    ]);
    const inspection = await Inspection.findOne({ instrumentId });
    if (!evaluation || !inspection) return res.status(404).json({ success: false, message: "Evaluation or inspection record not found." });
    inspection.evaluationId = evaluation._id;
    inspection.generalExamination = { checklist, photos, passed: true, submittedAt: new Date(), submittedBy: req.user?._id || null };
    await inspection.save();
    let testPlan = await TestPlan.findOne({ evaluationId: evaluation._id });
    if (!testPlan) {
      testPlan = await TestPlan.create({
        evaluationId: evaluation._id,
        instrumentId: instrument._id,
        standard: "OIML R 76-1",
        standardVersion: "2006",
        tests: generateTestPlan(instrument),
        status: "IN_PROGRESS",
      });
      const generalTest = testPlan.tests.find((test) => test.code === "GENERAL_EXAMINATION");
      if (generalTest) generalTest.status = "COMPLETED";
      await testPlan.save();
      evaluation.testPlanId = testPlan._id;
    } else {
      const generalTest = testPlan.tests.find((test) => test.code === "GENERAL_EXAMINATION");
      if (generalTest) generalTest.status = "COMPLETED";
      testPlan.status = "IN_PROGRESS";
      await testPlan.save();
    }
    evaluation.testingStatus = "IN_PROGRESS";
    evaluation.status = "TESTING";
    await evaluation.save();
    return res.json({ success: true, data: { inspection, testPlan, evaluation } });
  } catch (error) { return res.status(400).json({ success: false, message: error.message || "Failed to save General Examination." }); }
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
    const inspection = await Inspection.findOne({ instrumentId });
    if (!inspection?.weighingTest?.testLoads?.length) return res.status(400).json({ success: false, message: "Weighing test loads have not been generated." });

    const e = new Decimal(instrument.e.toString());
    const halfE = e.times(0.5);
    const storedLoads = inspection.weighingTest.testLoads.map((point) => point.toObject());
    const testPoints = [
      ...storedLoads,
      ...storedLoads.slice(0, 4).reverse().map((point, index) => ({
        ...point,
        step: storedLoads.length + index,
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

    // The generated sequence starts at minimum load rather than a separate
    // zero-load observation. Do not use the minimum-load row as E0, otherwise
    // its corrected error is always forced to zero.
    const E0 = new Decimal(0);

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

    inspection.weighingTest = {
      baselineE0: mongoose.Types.Decimal128.fromString(E0.toFixed(4)),
      readings: verifiedObservations,
      evidence: inspection.weighingTest.evidence || [],
      passed: serverCalculatedAllPassed,
    };

    // Mark only this test as completed. The overall testing workflow remains
    // in progress until the remaining prescribed tests are completed.
    const evaluation = await Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (testPlan) {
      const weighingTest = testPlan.tests.find((test) => test.code === "WEIGHING_PERFORMANCE");
      if (weighingTest) weighingTest.status = "COMPLETED";
      testPlan.status = testPlan.tests.length && testPlan.tests.every((test) => test.status === "COMPLETED")
        ? "COMPLETED"
        : "IN_PROGRESS";
    }

    if (evaluation) {
      const allTestsCompleted = testPlan?.tests?.length > 0 && testPlan.tests.every((test) => test.status === "COMPLETED");
      evaluation.testingStatus = allTestsCompleted ? "COMPLETED" : "IN_PROGRESS";
      evaluation.status = allTestsCompleted ? "COMPLIANCE_EVALUATION" : "TESTING";
    }

    instrument.status = "TEST_IN_PROGRESS";
    await Promise.all([
      inspection.save(),
      instrument.save(),
      testPlan?.save(),
      evaluation?.save(),
    ]);

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
    const mpeLimit = getMpeForLoad(instrument.accuracyClass, payload.testLoad, e);
    const byStep = new Map(payload.positions.map((position) => [position.step, position]));
    if ([1, 2, 3, 4, 5].some((step) => !byStep.has(step))) return res.status(400).json({ success: false, message: "Positions 1 through 5 are required." });
    const pValues = payload.positions.map((position) => new Decimal(position.indicated).plus(halfE).minus(position.deltaL));
    const mpe = mpeLimit;
    const positions = payload.positions.map((position, index) => {
      const load = new Decimal(payload.testLoad);
      const trueP = pValues[index];
      const error = trueP.minus(load);
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
    const existingInspection = await Inspection.findOne({ instrumentId });
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $set: { instrumentId, eccentricityTest: { testLoad: mongoose.Types.Decimal128.fromString(new Decimal(payload.testLoad).toFixed(4)), positions, evidence: existingInspection?.eccentricityTest?.evidence || [], passed } } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
    const evaluation = await Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (testPlan) {
      const eccentricityTest = testPlan.tests.find((test) => test.code === "ECCENTRICITY");
      if (eccentricityTest) eccentricityTest.status = "COMPLETED";
      testPlan.status = testPlan.tests.length && testPlan.tests.every((test) => test.status === "COMPLETED")
        ? "COMPLETED"
        : "IN_PROGRESS";
    }
    if (evaluation) {
      const allTestsCompleted = Boolean(testPlan?.tests?.length && testPlan.tests.every((test) => test.status === "COMPLETED"));
      evaluation.testingStatus = allTestsCompleted ? "COMPLETED" : "IN_PROGRESS";
      evaluation.status = allTestsCompleted ? "COMPLIANCE_EVALUATION" : "TESTING";
    }
    instrument.status = "TEST_IN_PROGRESS";
    await Promise.all([inspection.save(), instrument.save(), testPlan?.save(), evaluation?.save()]);
    return res.status(200).json({ success: true, passed, inspectionId: inspection._id, instrumentStatus: instrument.status, positions });
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
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found" });
    const accuracyClass = String(instrument.accuracyClass || "").trim().toUpperCase();
    const requiredRuns = ["I", "II"].includes(accuracyClass) ? 6 : 3;
    if (!Array.isArray(runs) || runs.length !== requiredRuns) {
      return res.status(400).json({ success: false, message: `Class ${accuracyClass} verification requires ${requiredRuns} repeatability readings.` });
    }
    const e = new Decimal(instrument.e.toString());
    const testLoad = new Decimal(instrument.max.toString()).times(0.8).div(e).round().times(e);
    const verificationType = instrument.verificationType === "IN_SERVICE" ? "IN_SERVICE" : "INITIAL_VERIFICATION";
    const mpeLimit = getMpeForLoad(instrument.accuracyClass, testLoad, e).times(verificationType === "IN_SERVICE" ? 2 : 1);
    const indications = runs.map((run) => new Decimal(run.indication));
    const maxIndication = Decimal.max(...indications);
    const minIndication = Decimal.min(...indications);
    const variation = maxIndication.minus(minIndication);
    const passed = variation.lte(mpeLimit);
    const storedRuns = runs.map((run, index) => ({
      runNumber: index + 1,
      loadApplied: mongoose.Types.Decimal128.fromString(testLoad.toFixed(4)),
      indication: mongoose.Types.Decimal128.fromString(indications[index].toFixed(4)),
    }));
    const existingInspection = await Inspection.findOne({ instrumentId });
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $set: { instrumentId, repeatabilityTest: { testType: "REPEATABILITY", verificationType, testLoad: mongoose.Types.Decimal128.fromString(testLoad.toFixed(4)), loadPercentageOfMax: 80, numberOfRuns: requiredRuns, runs: storedRuns, maxIndication: mongoose.Types.Decimal128.fromString(maxIndication.toFixed(4)), minIndication: mongoose.Types.Decimal128.fromString(minIndication.toFixed(4)), variation: mongoose.Types.Decimal128.fromString(variation.toFixed(4)), variationRange: mongoose.Types.Decimal128.fromString(variation.toFixed(4)), mpeLimit: mongoose.Types.Decimal128.fromString(mpeLimit.toFixed(4)), evidence: existingInspection?.repeatabilityTest?.evidence || [], passed } } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    const evaluation = await Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (testPlan) {
      const repeatabilityTest = testPlan.tests.find((test) => test.code === "REPEATABILITY");
      if (repeatabilityTest) repeatabilityTest.status = "COMPLETED";
      testPlan.status = testPlan.tests.length && testPlan.tests.every((test) => test.status === "COMPLETED") ? "COMPLETED" : "IN_PROGRESS";
    }
    if (evaluation) {
      const allTestsCompleted = Boolean(testPlan?.tests?.length && testPlan.tests.every((test) => test.status === "COMPLETED"));
      evaluation.testingStatus = allTestsCompleted ? "COMPLETED" : "IN_PROGRESS";
      evaluation.status = allTestsCompleted ? "COMPLIANCE_EVALUATION" : "TESTING";
    }
    await Promise.all([testPlan?.save(), evaluation?.save()]);
    return res.json({ success: true, data: { maxIndication: maxIndication.toFixed(4), minIndication: minIndication.toFixed(4), variation: variation.toFixed(4), mpe: mpeLimit.toFixed(4), overallStatus: passed ? "PASS" : "FAIL" }, inspectionId: inspection._id });
  } catch (error) {
    console.error("Repeatability submission error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const submitTareTest = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const readings = req.body?.readings;
    if (!Array.isArray(readings) || readings.length !== 5) return res.status(400).json({ success: false, message: "Five tare readings are required." });
    const e = new Decimal(instrument.e.toString());
    const max = new Decimal(instrument.max.toString());
    const min = new Decimal(instrument.min.toString());
    const tare = new Decimal(instrument.maximumTare?.toString() || 0);
    const tareValue = instrument.tareType === "Additive" ? tare.div(3) : tare.div(2);
    const loads = [min, max.times(.25), max.times(.5), max.times(.75), max];
    const points = readings.map((reading, index) => {
      const indication = new Decimal(reading.indication);
      const load = loads[index];
      const error = indication.minus(load);
      const passed = error.abs().lte(e);
      return { step: index + 1, tareValue: mongoose.Types.Decimal128.fromString(tareValue.toFixed(4)), netLoad: mongoose.Types.Decimal128.fromString(load.toFixed(4)), mpeLimit: mongoose.Types.Decimal128.fromString(e.toFixed(4)), indicated: mongoose.Types.Decimal128.fromString(indication.toFixed(4)), correctedError: mongoose.Types.Decimal128.fromString(error.toFixed(4)), passed };
    });
    const passed = points.every((point) => point.passed);
    const existingInspection = await Inspection.findOne({ instrumentId: instrument._id });
    const inspection = await Inspection.findOneAndUpdate({ instrumentId: instrument._id }, { $set: { tareTest: { tareType: instrument.tareType, tareValues: [mongoose.Types.Decimal128.fromString(tareValue.toFixed(4))], points, evidence: existingInspection?.tareTest?.evidence || [], passed } } }, { returnDocument: "after", upsert: true, setDefaultsOnInsert: true });
    const evaluation = await Evaluation.findOne({ instrumentId: instrument._id }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (testPlan) { const test = testPlan.tests.find((item) => item.code === "TARE"); if (test) test.status = "COMPLETED"; testPlan.status = testPlan.tests.every((item) => item.status === "COMPLETED") ? "COMPLETED" : "IN_PROGRESS"; }
    if (evaluation) { const complete = Boolean(testPlan?.tests?.length && testPlan.tests.every((item) => item.status === "COMPLETED")); evaluation.testingStatus = complete ? "COMPLETED" : "IN_PROGRESS"; evaluation.status = complete ? "COMPLIANCE_EVALUATION" : "TESTING"; }
    await Promise.all([inspection.save(), testPlan?.save(), evaluation?.save()]);
    return res.json({ success: true, passed, points });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};

const getSensitivityEligibility = (instrument) => {
  const unitToMg = { kg: 1000000, g: 1000, mg: 1, t: 1000000000 };
  const intervalMg = new Decimal(instrument.d.toString()).times(unitToMg[instrument.unit] ?? 1);
  const isDigital = String(instrument.indicationType || "").toLowerCase() === "digital";
  return { eligible: isDigital && intervalMg.gte(5), intervalMg };
};

const getSensitivityLoads = (instrument) => {
  const min = new Decimal(instrument.min.toString());
  const max = new Decimal(instrument.max.toString());
  const interval = new Decimal(instrument.d.toString());
  return [
    { label: "Min", load: min },
    { label: "½ Max", load: max.div(2) },
    { label: "Max", load: max },
  ].map((point, index) => ({ step: index + 1, ...point, additionalLoad: interval.times("1.4") }));
};

export const getSensitivityTestConfig = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const { eligible, intervalMg } = getSensitivityEligibility(instrument);
    if (!eligible) return res.status(422).json({ success: false, message: "This digital discrimination workflow applies to digital instruments with d of at least 5 mg." });
    const evaluation = await Evaluation.findOne({ instrumentId: instrument._id, testingOfficerId: req.user._id }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (!evaluation || !testPlan?.tests?.some((test) => test.code === "SENSITIVITY")) return res.status(403).json({ success: false, message: "Sensitivity test is not available in this evaluation's test plan." });
    const scaleInterval = new Decimal(instrument.d.toString());
    const points = getSensitivityLoads(instrument).map(({ step, label, load, additionalLoad }) => ({ step, label, load: load.toString(), additionalLoad: additionalLoad.toString() }));
    await Inspection.findOneAndUpdate(
      { instrumentId: instrument._id },
      { $setOnInsert: { instrumentId: instrument._id, evaluationId: evaluation._id } },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
    );
    return res.json({ success: true, data: { instrument: instrument.toJSON(), applicationNumber: evaluation.applicationNumber, scaleInterval: scaleInterval.toString(), intervalMg: intervalMg.toString(), points } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to load sensitivity test configuration." });
  }
};

export const submitSensitivityTest = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    if (!getSensitivityEligibility(instrument).eligible) return res.status(422).json({ success: false, message: "Sensitivity testing is unavailable for this instrument configuration." });
    const evaluation = await Evaluation.findOne({ instrumentId: instrument._id, testingOfficerId: req.user._id }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    const sensitivityTest = testPlan?.tests?.find((test) => test.code === "SENSITIVITY");
    if (!evaluation || !sensitivityTest) return res.status(403).json({ success: false, message: "Sensitivity test is not available in this evaluation's test plan." });
    const readings = req.body?.readings;
    if (!Array.isArray(readings) || readings.length !== 3) return res.status(400).json({ success: false, message: "Exactly three sensitivity readings are required." });
    const interval = new Decimal(instrument.d.toString());
    const generatedPoints = getSensitivityLoads(instrument);
    const points = readings.map((reading, index) => {
      if (Number(reading.step) !== index + 1) throw new Error("Sensitivity readings must include steps 1, 2, and 3 in order.");
      const initial = new Decimal(reading.initialIndication);
      const final = new Decimal(reading.finalIndication);
      if (!initial.isFinite() || !final.isFinite()) throw new Error(`Valid initial and final indications are required for step ${index + 1}.`);
      const indicationChange = final.minus(initial);
      // OIML R 76-1 A.4.8.2 requires a one-interval increase after adding 1.4 d.
      // Use a half-interval acceptance band for observations entered at limited
      // display precision; exact Decimal equality incorrectly rejects rounded readings.
      const responseDetected = indicationChange.minus(interval).abs().lte(interval.div(2));
      const passed = responseDetected;
      const point = generatedPoints[index];
      return {
        step: point.step,
        label: point.label,
        load: mongoose.Types.Decimal128.fromString(point.load.toFixed(8)),
        initialIndication: mongoose.Types.Decimal128.fromString(initial.toFixed(8)),
        additionalLoad: mongoose.Types.Decimal128.fromString(point.additionalLoad.toFixed(8)),
        finalIndication: mongoose.Types.Decimal128.fromString(final.toFixed(8)),
        responseDetected,
        passed,
      };
    });
    const passed = points.every((point) => point.passed);
    const existingInspection = await Inspection.findOne({ instrumentId: instrument._id });
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId: instrument._id },
      { $set: { instrumentId: instrument._id, sensitivityTest: { points, evidence: existingInspection?.sensitivityTest?.evidence || [], passed } } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    sensitivityTest.status = "COMPLETED";
    testPlan.status = testPlan.tests.length && testPlan.tests.every((test) => test.status === "COMPLETED") ? "COMPLETED" : "IN_PROGRESS";
    evaluation.testingStatus = testPlan.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
    evaluation.status = testPlan.status === "COMPLETED" ? "COMPLIANCE_EVALUATION" : "TESTING";
    await Promise.all([inspection.save(), testPlan.save(), evaluation.save()]);
    return res.json({ success: true, passed, points, inspectionId: inspection._id });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to submit sensitivity test." });
  }
};

export const completeUnimplementedTest = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    const evaluation = instrument ? await Evaluation.findOne({ instrumentId: instrument._id }).sort({ createdAt: -1 }) : null;
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    if (!instrument || !evaluation || !testPlan) return res.status(404).json({ success: false, message: "Test plan not found." });
    const test = testPlan.tests.find((item) => item.code === req.params.code);
    if (!test) return res.status(404).json({ success: false, message: "Test not found in test plan." });
    if (test.code === "SENSITIVITY") return res.status(400).json({ success: false, message: "Submit sensitivity readings to complete this test." });
    test.status = "COMPLETED";
    const complete = testPlan.tests.length > 0 && testPlan.tests.every((item) => item.status === "COMPLETED");
    testPlan.status = complete ? "COMPLETED" : "IN_PROGRESS";
    evaluation.testingStatus = complete ? "COMPLETED" : "IN_PROGRESS";
    evaluation.status = complete ? "COMPLIANCE_EVALUATION" : "TESTING";
    await Promise.all([testPlan.save(), evaluation.save()]);
    return res.json({ success: true, testPlan, testingStatus: evaluation.testingStatus });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};

export const getTareTestConfig = async (req, res) => {
  try {
    const instrument = await Instrument.findById(req.params.id);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const max = new Decimal(instrument.max.toString());
    const min = new Decimal(instrument.min.toString());
    const e = new Decimal(instrument.e.toString());
    const maximumTare = new Decimal(instrument.maximumTare?.toString() || 0);
    const tareValues = instrument.tareType === "Additive" ? [maximumTare.div(3), maximumTare] : [maximumTare.div(2)];
    const points = [min, max.times(.25), max.times(.5), max.times(.75), max].map((netLoad, index) => ({
      step: index + 1, tareValue: tareValues[0].toFixed(4), netLoad: netLoad.toFixed(4), mpeLimit: e.toFixed(4),
    }));
    const inspection = await Inspection.findOneAndUpdate({ instrumentId: instrument._id }, { $set: { tareTest: { tareType: instrument.tareType, tareValues: tareValues.map((value) => mongoose.Types.Decimal128.fromString(value.toFixed(4))), points, passed: false } } }, { returnDocument: "after", upsert: true, setDefaultsOnInsert: true });
    const evaluation = await Evaluation.findOne({ instrumentId: instrument._id }).sort({ createdAt: -1 }).select("applicationNumber");
    return res.json({ success: true, data: { instrument: instrument.toJSON(), applicationNumber: evaluation?.applicationNumber || null, tareType: instrument.tareType, maximumTare: maximumTare.toFixed(4), tareValues: tareValues.map((value) => value.toFixed(4)), points: inspection.tareTest.points } });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};

export const getEccentricityTestConfig = async (req, res) => {
  try {
    const instrumentId = req.params.id;
    if (!mongoose.isValidObjectId(instrumentId)) return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });
    const e = new Decimal(instrument.e.toString());
    const load = new Decimal(instrument.max.toString()).div(3).div(e).round().times(e);
    const labels = ["Center", "Front-Left", "Rear-Left", "Rear-Right", "Front-Right"];
    const inspection = await Inspection.findOneAndUpdate({ instrumentId }, { $setOnInsert: { instrumentId } }, { returnDocument: "after", upsert: true, setDefaultsOnInsert: true });
    let points = inspection.eccentricityTest?.generatedPoints;
    if (!points?.length) {
      points = labels.map((label, index) => ({ step: index + 1, label, loadApplied: mongoose.Types.Decimal128.fromString(load.toFixed(4)), indication: null }));
      inspection.eccentricityTest = { ...(inspection.eccentricityTest?.toObject?.() || {}), generatedLoad: mongoose.Types.Decimal128.fromString(load.toFixed(4)), generatedPoints: points };
      await inspection.save();
    }
    return res.json({ success: true, data: { instrument: instrument.toJSON(), testLoad: load.toFixed(4), mpe: getMpeForLoad(instrument.accuracyClass, load, e).toFixed(4), points } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getRepeatabilityTestConfig = async (req, res) => {
  try {
    const instrumentId = req.params.id;
    if (!mongoose.isValidObjectId(instrumentId)) {
      return res.status(400).json({ success: false, message: "A valid instrument ID is required." });
    }

    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) return res.status(404).json({ success: false, message: "Instrument not found." });

    const e = new Decimal(instrument.e.toString());
    const inspection = await Inspection.findOneAndUpdate(
      { instrumentId },
      { $setOnInsert: { instrumentId } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );

    const accuracyClass = String(instrument.accuracyClass || "").trim().toUpperCase();
    const numberOfRuns = ["I", "II"].includes(accuracyClass) ? 6 : 3;
    const verificationType = instrument.verificationType === "IN_SERVICE" ? "IN_SERVICE" : "INITIAL_VERIFICATION";
    let testLoad = inspection.repeatabilityTest?.testLoad;
    if (testLoad === undefined || testLoad === null) {
      // Verification uses one series at approximately 80% of Max.
      testLoad = new Decimal(instrument.max.toString()).times(0.8).div(e).round().times(e);
      inspection.repeatabilityTest = {
        testType: "REPEATABILITY", verificationType, loadPercentageOfMax: 80, numberOfRuns,
        runs: Array.from({ length: numberOfRuns }, (_, index) => ({ runNumber: index + 1, loadApplied: mongoose.Types.Decimal128.fromString(testLoad.toFixed(4)), indication: null })),
        testLoad: mongoose.Types.Decimal128.fromString(testLoad.toFixed(4)),
      };
      await inspection.save();
    } else {
      testLoad = new Decimal(testLoad.toString());
    }

    return res.json({
      success: true,
      data: {
        instrument: instrument.toJSON(),
        testType: "REPEATABILITY",
        testLoad: testLoad.toFixed(4),
        loadPercentageOfMax: 80,
        mpe: getMpeForLoad(instrument.accuracyClass, testLoad, e).times(verificationType === "IN_SERVICE" ? 2 : 1).toFixed(4),
        numberOfRuns,
        runs: inspection.repeatabilityTest?.runs || [],
        variation: inspection.repeatabilityTest?.variation?.toString?.() || null,
        maxIndication: inspection.repeatabilityTest?.maxIndication?.toString?.() || null,
        minIndication: inspection.repeatabilityTest?.minIndication?.toString?.() || null,
        overallStatus: inspection.repeatabilityTest?.passed === true ? "PASS" : inspection.repeatabilityTest?.variation ? "FAIL" : "PENDING",
      },
    });
  } catch (error) {
    console.error("Repeatability config error:", error);
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
    const evaluation = await Evaluation.findOne({ instrumentId }).sort({ createdAt: -1 });
    const testPlan = evaluation ? await TestPlan.findOne({ evaluationId: evaluation._id }) : null;
    const allTestsPassed = Boolean(testPlan?.tests?.length && testPlan.tests.every((test) => test.status === "COMPLETED"));
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
    if (evaluation) {
      evaluation.testingStatus = "COMPLETED";
      evaluation.complianceStatus = "COMPLIANT";
      evaluation.complianceResult = "PASS";
      evaluation.status = "SUPERVISOR_REVIEW";
      evaluation.progress = 75;
    }
    const testingOfficer = evaluation ? await User.findById(evaluation.testingOfficerId).select("supervisorId") : null;
    const supervisorId = testingOfficer?.supervisorId;
    await Promise.all([
      inspection.save(),
      instrument.save(),
      evaluation?.save(),
      supervisorId && Notification.create({
        recipientId: supervisorId,
        recipientRole: "LAB_SUPERVISOR",
        message: `Application ${evaluation.applicationNumber} for ${instrument.manufacturer || "the instrument"} ${instrument.modelNumber || ""} has been submitted for your supervisor review.`,
      }),
    ]);
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
      qrVerificationUrl: `${(process.env.FRONTEND_URL || "https://nawipro12.netlify.app").replace(/\/$/, "")}/certificate/${certificateNumber}`,
    };
    instrument.status = "APPROVED";
    await Promise.all([inspection.save(), instrument.save()]);

    return res.json({ success: true, message: "Instrument approved and certificate generated successfully.", instrumentStatus: instrument.status, certificate: inspection.certificate, digitalSignatureToken });
  } catch (error) {
    console.error("Approve inspection error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};
