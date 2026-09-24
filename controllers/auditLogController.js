import AuditLog from "../models/auditLogModel.js";

export const getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(100).lean();
    const summary = {
      totalLogs: await AuditLog.countDocuments(),
      userRelated: logs.filter((log) => log.relatedModel === "User" || /^User /.test(log.action)).length,
      laboratoryRelated: logs.filter((log) => ["Laboratory", "Instrument"].includes(log.relatedModel)).length,
      reportRelated: logs.filter((log) => log.relatedModel === "Report" || /Report/.test(log.action)).length,
    };
    return res.status(200).json({ logs, summary });
  } catch (error) {
    console.error("Get audit logs error:", error);
    return res.status(500).json({ message: "Unable to load audit logs." });
  }
};
