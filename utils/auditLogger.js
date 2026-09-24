import User from "../models/userModel.js";
import AuditLog from "../models/auditLogModel.js";

export async function recordAudit(req, { action, details, relatedTo = null, relatedModel = null, metadata = {} }) {
  try {
    const actor = await User.findById(req.user?._id).select("name role").lean();
    if (!actor) return;
    await AuditLog.create({
      actorId: actor._id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      details,
      relatedTo,
      relatedModel,
      metadata,
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
