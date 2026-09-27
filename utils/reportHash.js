import crypto from "node:crypto";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (!["_id", "createdAt", "updatedAt", "reportHash", "qrCode"].includes(key)) result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
};

export const createReportHash = (report) => {
  const hashPayload = {
    evaluationId: report.evaluationId,
    inspectionId: report.inspectionId,
    instrumentId: report.instrumentId,
    reportStatus: report.reportStatus,
    instrumentDetails: report.instrumentDetails,
    testPlan: report.testPlan,
    testResults: report.testResults,
    supervisorId: report.supervisorId,
    approvedAt: report.approvedAt,
  };
  if (report.complianceStatus) hashPayload.complianceStatus = report.complianceStatus;
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(hashPayload))).digest("hex");
};
