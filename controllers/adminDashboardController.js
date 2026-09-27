import Evaluation from "../models/evaluationModel.js";
import Laboratory from "../models/laboratoryModel.js";
import Report from "../models/reportModel.js";
import User from "../models/userModel.js";
import NonComplianceReport from "../models/nonComplianceReportModel.js";

export const getAdminDashboardSummary = async (req, res) => {
  try {
    const adminRoles = ["NAWI_ADMIN", "NAWI ADMIN", "ADMIN", "ADMINISTRATOR"];
    if (!adminRoles.includes(String(req.user?.role || "").trim().toUpperCase())) {
      return res.status(403).json({ success: false, message: "Only administrators can view dashboard metrics." });
    }

    const [labs, totalTests, pendingReviews, activeUsers, passedEvaluations, failedEvaluations, labAggregates] = await Promise.all([
      Laboratory.find({ status: "ACTIVE" }).select("name").lean(),
      Evaluation.countDocuments(),
      Evaluation.countDocuments({ status: "SUPERVISOR_REVIEW" }),
      User.countDocuments({ status: "ACTIVE" }),
      Evaluation.countDocuments({ complianceResult: "PASS" }),
      Evaluation.countDocuments({ complianceResult: "FAIL" }),
      Evaluation.aggregate([
        { $lookup: { from: "users", localField: "testingOfficerId", foreignField: "_id", as: "officer" } },
        { $unwind: { path: "$officer", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "users", localField: "officer.supervisorId", foreignField: "_id", as: "supervisor" } },
        { $addFields: { effectiveLabId: { $ifNull: ["$officer.labId", { $arrayElemAt: ["$supervisor.labId", 0] }] } } },
        { $lookup: { from: "laboratories", localField: "effectiveLabId", foreignField: "_id", as: "lab" } },
        { $unwind: "$lab" },
        { $match: { "lab.status": "ACTIVE" } },
        { $group: {
          _id: "$lab._id",
          laboratory: { $first: "$lab.name" },
          tests: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ["$complianceResult", "PASS"] }, 1, 0] } },
          evaluated: { $sum: { $cond: [{ $in: ["$complianceResult", ["PASS", "FAIL"]] }, 1, 0] } },
          pendingReviews: { $sum: { $cond: [{ $eq: ["$status", "SUPERVISOR_REVIEW"] }, 1, 0] } },
          turnaroundTotal: { $sum: { $cond: [{ $and: [{ $ne: ["$completedAt", null] }, { $ne: ["$createdAt", null] }] }, { $divide: [{ $subtract: ["$completedAt", "$createdAt"] }, 86400000] }, 0] } },
          turnaroundCount: { $sum: { $cond: [{ $and: [{ $ne: ["$completedAt", null] }, { $ne: ["$createdAt", null] }] }, 1, 0] } },
        } },
      ]),
    ]);
    const evaluatedCount = passedEvaluations + failedEvaluations;
    const nationalPassRate = evaluatedCount ? Number(((passedEvaluations / evaluatedCount) * 100).toFixed(1)) : 0;

    // Include issued legacy reports without a stored complianceStatus when their test results show a pass.
    const generatedReports = await Report.find({ reportStatus: { $in: ["GENERATED", "FINALIZED"] } })
      .select("complianceStatus testResults")
      .lean();
    const compliantReports = generatedReports.filter((report) => {
      if (report.complianceStatus) return report.complianceStatus === "COMPLIANT";
      const checks = Object.values(report.testResults || {}).filter((test) => test && typeof test === "object" && "passed" in test);
      return checks.length > 0 && checks.every((test) => test.passed === true);
    }).length;
    const nonCompliantReports = generatedReports.filter((report) => report.complianceStatus === "NON_COMPLIANT").length;
    const finalPassRate = compliantReports + nonCompliantReports
      ? Number(((compliantReports / (compliantReports + nonCompliantReports)) * 100).toFixed(1))
      : nationalPassRate;
    const labStatsById = new Map(labAggregates.map((lab) => [String(lab._id), lab]));
    const labComparison = labs.map((lab) => {
      const stats = labStatsById.get(String(lab._id));
      return {
        laboratory: lab.name,
        tests: stats?.tests || 0,
        passRate: stats?.evaluated ? Number(((stats.passed / stats.evaluated) * 100).toFixed(1)) : 0,
        averageTurnaroundDays: stats?.turnaroundCount ? Number((stats.turnaroundTotal / stats.turnaroundCount).toFixed(4)) : 0,
        pendingReviews: stats?.pendingReviews || 0,
      };
    });
    const turnaroundTotal = labAggregates.reduce((total, lab) => total + (lab.turnaroundTotal || 0), 0);
    const turnaroundCount = labAggregates.reduce((total, lab) => total + (lab.turnaroundCount || 0), 0);

    return res.json({
      success: true,
      data: {
        activeLabs: labs.length,
        totalTests,
        nationalPassRate: finalPassRate,
        pendingReviews,
        activeUsers,
        labComparison,
        nationalAverageTurnaroundDays: turnaroundCount ? Number((turnaroundTotal / turnaroundCount).toFixed(4)) : 0,
      },
    });
  } catch (error) {
    console.error("Get admin dashboard summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to load admin dashboard metrics." });
  }
};

export const getSupervisorDashboardSummary = async (req, res) => {
  try {
    if (req.user?.role !== "LAB SUPERVISOR") {
      return res.status(403).json({ success: false, message: "Only lab supervisors can view these dashboard metrics." });
    }
    const supervisor = await User.findById(req.user._id).select("labId").lean();
    if (!supervisor) return res.status(404).json({ success: false, message: "Supervisor account not found." });

    const officerFilter = { role: "TESTING OFFICER", $or: [{ supervisorId: req.user._id }] };
    if (supervisor.labId) officerFilter.$or.push({ labId: supervisor.labId, supervisorId: null });
    const officers = await User.find(officerFilter).select("_id").lean();
    const officerIds = officers.map((officer) => officer._id);
    const evaluations = officerIds.length
      ? await Evaluation.find({ testingOfficerId: { $in: officerIds } }).select("status complianceResult createdAt completedAt instrumentId").populate("instrumentId", "manufacturer").lean()
      : [];
    const evaluated = evaluations.filter((evaluation) => ["PASS", "FAIL"].includes(evaluation.complianceResult));
    const passed = evaluated.filter((evaluation) => evaluation.complianceResult === "PASS").length;
    const failed = evaluated.filter((evaluation) => evaluation.complianceResult === "FAIL").length;
    const manufacturerMap = new Map();
    for (const evaluation of evaluations) {
      const manufacturer = evaluation.instrumentId?.manufacturer || "Unknown Manufacturer";
      const current = manufacturerMap.get(manufacturer) || { manufacturer, total: 0, passed: 0, failed: 0, pendingReviews: 0 };
      if (evaluation.complianceResult === "PASS") {
        current.total += 1;
        current.passed += 1;
      } else if (evaluation.complianceResult === "FAIL") {
        current.total += 1;
        current.failed += 1;
      }
      if (evaluation.status === "SUPERVISOR_REVIEW") current.pendingReviews += 1;
      manufacturerMap.set(manufacturer, current);
    }
    const manufacturerPassRates = [...manufacturerMap.values()].filter((entry) => entry.total > 0).map((entry) => ({
      ...entry,
      passRate: Number(((entry.passed / entry.total) * 100).toFixed(1)),
    }));
    const completed = evaluations.filter((evaluation) => evaluation.completedAt && evaluation.createdAt);
    const turnaroundDays = completed.length
      ? completed.reduce((sum, evaluation) => sum + ((new Date(evaluation.completedAt) - new Date(evaluation.createdAt)) / 86400000), 0) / completed.length
      : 0;
    const overdueCutoff = Date.now() - (2 * 86400000);
    const overdueVerifications = evaluations.filter((evaluation) => (
      evaluation.status === "SUPERVISOR_REVIEW"
      && evaluation.createdAt
      && new Date(evaluation.createdAt).getTime() < overdueCutoff
    )).length;
    const monthMap = new Map();
    evaluations.forEach((evaluation) => {
      if (!evaluation.createdAt) return;
      const date = new Date(evaluation.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthMap.get(key) || {
        key,
        month: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        totalTests: 0,
        passed: 0,
        failed: 0,
      };
      entry.totalTests += 1;
      if (evaluation.complianceResult === "PASS") entry.passed += 1;
      if (evaluation.complianceResult === "FAIL") entry.failed += 1;
      monthMap.set(key, entry);
    });
    const monthlyBreakdown = [...monthMap.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6)
      .map((entry, index, rows) => {
        const evaluatedInMonth = entry.passed + entry.failed;
        const previous = rows[index - 1];
        return {
          ...entry,
          passRate: evaluatedInMonth ? Number(((entry.passed / evaluatedInMonth) * 100).toFixed(1)) : 0,
          changePercent: previous?.totalTests ? Number((((entry.totalTests - previous.totalTests) / previous.totalTests) * 100).toFixed(1)) : null,
        };
      });
    const recentFailures = officerIds.length
      ? await NonComplianceReport.find({ submittedBy: { $in: officerIds } })
        .populate("instrumentId", "instrumentType manufacturer modelNumber serialNumber")
        .populate("evaluationId", "applicationNumber")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
      : [];

    return res.json({
      success: true,
      data: {
        totalTests: evaluations.length,
        passRate: evaluated.length ? Number(((passed / evaluated.length) * 100).toFixed(1)) : 0,
        pendingReviews: evaluations.filter((evaluation) => evaluation.status === "SUPERVISOR_REVIEW").length,
        averageTurnaroundDays: Number(turnaroundDays.toFixed(1)),
        failedTests: failed,
        overdueVerifications,
        monthlyBreakdown,
        manufacturerPassRates,
        manufacturerTestStatuses: [...manufacturerMap.values()],
        recentFailures,
        testStatus: {
          passed,
          failed,
          pendingReviews: evaluations.filter((evaluation) => evaluation.status === "SUPERVISOR_REVIEW").length,
          totalTests: evaluated.length,
        },
      },
    });
  } catch (error) {
    console.error("Get supervisor dashboard summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to load supervisor dashboard metrics." });
  }
};
