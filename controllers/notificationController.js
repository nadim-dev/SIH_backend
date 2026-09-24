import Notification from "../models/notificationModel.js";

const roleName = (role) => String(role || "").trim().toUpperCase().replace(/\s+/g, "_");
const notificationRole = (role) => roleName(role) === "NAWI_ADMIN" || ["ADMIN", "ADMINISTRATOR"].includes(roleName(role)) ? "Admin" : roleName(role);

const notificationRecipientFilter = (userId, role) => ({
  recipientId: userId,
  recipientRole: role,
});

export const getMyNotifications = async (req, res) => {
  try {
    const role = notificationRole(req.user.role);
    if (!["TESTING_OFFICER", "LAB_SUPERVISOR", "Admin"].includes(role)) {
      return res.json({ success: true, data: [] });
    }
    const notifications = await Notification.find(notificationRecipientFilter(req.user._id, role))
      .select("-testerId -supervisorId")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, data: notifications });
  } catch (error) { return res.status(500).json({ success: false, message: error.message || "Failed to load notifications." }); }
};

export const markNotificationRead = async (req, res) => {
  const role = notificationRole(req.user.role);
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...notificationRecipientFilter(req.user._id, role) },
    { $set: { isRead: true } },
    { new: true },
  ).select("-testerId -supervisorId");
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
  return res.json({ success: true, data: notification });
};

export const markAllNotificationsRead = async (req, res) => {
  const role = notificationRole(req.user.role);
  if (!["TESTING_OFFICER", "LAB_SUPERVISOR", "Admin"].includes(role)) {
    return res.json({ success: true, modifiedCount: 0 });
  }

  const result = await Notification.updateMany(
    notificationRecipientFilter(req.user._id, role),
    { $set: { isRead: true } },
  );
  return res.json({ success: true, modifiedCount: result.modifiedCount });
};
