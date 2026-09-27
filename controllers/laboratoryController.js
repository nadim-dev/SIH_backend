import Laboratory from "../models/laboratoryModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import { uploadBufferToCloudinary } from "../utils/uploadImagetoCloudinary.js";

const getSupervisorLaboratory = async (supervisorId) => {
  const supervisor = await User.findById(supervisorId).select("labId").lean();
  if (supervisor?.labId) {
    const linkedLaboratory = await Laboratory.findById(supervisor.labId).lean();
    if (linkedLaboratory) return linkedLaboratory;
  }
  return Laboratory.findOne({ supervisorId }).lean();
};

export const getMyLaboratoryProfile = async (req, res) => {
  try {
    const laboratory = await getSupervisorLaboratory(req.user._id);
    if (!laboratory) return res.status(404).json({ success: false, message: "No laboratory is linked to this supervisor account." });
    return res.json({ success: true, data: laboratory });
  } catch (error) {
    console.error("Get supervisor laboratory profile error:", error);
    return res.status(500).json({ success: false, message: "Unable to load laboratory profile." });
  }
};

export const updateMyLaboratoryProfile = async (req, res) => {
  try {
    const laboratory = await getSupervisorLaboratory(req.user._id);
    if (!laboratory) return res.status(404).json({ success: false, message: "No laboratory is linked to this supervisor account." });
    const fields = ["address", "city", "state", "pinCode", "officialEmail", "contactNumber"];
    const values = Object.fromEntries(fields.map((field) => [field, String(req.body[field] || "").trim()]));
    values.officialEmail = values.officialEmail.toLowerCase();
    if (fields.some((field) => !values[field])) return res.status(400).json({ success: false, message: "Complete all required laboratory fields." });
    if (!/^\d{6}$/.test(values.pinCode)) return res.status(400).json({ success: false, message: "PIN Code must contain 6 digits." });
    const update = { ...values, location: `${values.city}, ${values.state}` };
    if (req.file) {
      const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: "SIH/laboratories/logos", resource_type: "image" });
      update.logoUrl = uploaded.secure_url;
    }
    const saved = await Laboratory.findByIdAndUpdate(laboratory._id, { $set: update }, { new: true, runValidators: true }).lean();
    return res.json({ success: true, message: "Laboratory profile updated.", data: saved });
  } catch (error) {
    console.error("Update supervisor laboratory profile error:", error);
    return res.status(500).json({ success: false, message: "Unable to update laboratory profile." });
  }
};

const adminOnly = (req, res) => {
  if (["NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"].includes(String(req.user.role || "").trim().toUpperCase())) return true;
  res.status(403).json({ success: false, message: "Only administrators can manage laboratories." });
  return false;
};

export const getLaboratories = async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;
    const [laboratories, supervisors, totalOfficers] = await Promise.all([
      Laboratory.find().select("name code type address city state pinCode officialEmail contactNumber location supervisorId status createdAt updatedAt").populate("supervisorId", "name email phone labId").sort({ name: 1 }).lean(),
      User.find({ role: "LAB SUPERVISOR" }).select("name email").sort({ name: 1 }).lean(),
      User.countDocuments({ role: "TESTING OFFICER" }),
    ]);
    const missingSupervisorLabs = laboratories.filter((laboratory) => !laboratory.supervisorId).map((laboratory) => laboratory._id);
    const fallbackSupervisors = missingSupervisorLabs.length
      ? await User.find({ role: "LAB SUPERVISOR", labId: { $in: missingSupervisorLabs } }).select("_id name email phone labId").lean()
      : [];
    const fallbackByLab = new Map(fallbackSupervisors.map((supervisor) => [String(supervisor.labId), supervisor]));
    laboratories.forEach((laboratory) => {
      if (!laboratory.supervisorId) laboratory.supervisorId = fallbackByLab.get(String(laboratory._id)) || null;
    });
    const supervisorIds = laboratories.map((laboratory) => laboratory.supervisorId?._id).filter(Boolean);
    const officerCounts = await User.aggregate([
      { $match: { role: "TESTING OFFICER", supervisorId: { $in: supervisorIds } } },
      { $group: { _id: "$supervisorId", count: { $sum: 1 } } },
    ]);
    const countBySupervisor = new Map(officerCounts.map((item) => [String(item._id), item.count]));
    const data = laboratories.map((laboratory) => ({
      ...laboratory,
      officerCount: laboratory.supervisorId ? countBySupervisor.get(String(laboratory.supervisorId._id)) || 0 : 0,
    }));
    return res.json({
      success: true,
      data,
      supervisors,
      summary: {
        totalLabs: data.length,
        activeLabs: data.filter((laboratory) => laboratory.status === "ACTIVE").length,
        inactiveLabs: data.filter((laboratory) => laboratory.status === "INACTIVE").length,
        totalOfficers,
      },
    });
  } catch (error) {
    console.error("Get laboratories error:", error);
    return res.status(500).json({ success: false, message: "Unable to load laboratories." });
  }
};

export const createLaboratory = async (req, res) => {
  let laboratory;
  try {
    if (!adminOnly(req, res)) return;
    const fields = ["name", "code", "type", "address", "city", "state", "pinCode", "officialEmail", "contactNumber"];
    const values = Object.fromEntries(fields.map((field) => [field, String(req.body[field] || "").trim()]));
    const supervisorName = String(req.body.supervisorName || "").trim();
    const supervisorEmail = String(req.body.supervisorEmail || "").trim().toLowerCase();
    const supervisorPhone = String(req.body.supervisorPhone || "").trim();
    const password = String(req.body.password || "");
    if (fields.some((field) => !values[field]) || !supervisorName || !/^\S+@\S+\.\S+$/.test(supervisorEmail) || supervisorPhone.length < 5 || password.length < 6) return res.status(400).json({ success: false, message: "Complete all fields. Password must be at least 6 characters." });
    if (!/^\d{6}$/.test(values.pinCode)) return res.status(400).json({ success: false, message: "PIN Code must contain 6 digits." });
    if (await User.exists({ email: supervisorEmail })) return res.status(409).json({ success: false, message: "A user with this supervisor email already exists." });
    laboratory = await Laboratory.create({ ...values, location: `${values.city}, ${values.state}`, supervisorId: null });
    const supervisor = await User.create({ name: supervisorName, email: supervisorEmail, passwordHash: await bcrypt.hash(password, 12), role: "LAB SUPERVISOR", phone: supervisorPhone, labId: laboratory._id });
    laboratory.supervisorId = supervisor._id;
    await laboratory.save();
    const populated = await Laboratory.findById(laboratory._id).populate("supervisorId", "name email").lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (laboratory?._id) await Laboratory.findByIdAndDelete(laboratory._id).catch(() => {});
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A laboratory with this name already exists." });
    return res.status(500).json({ success: false, message: "Unable to create laboratory." });
  }
};

export const updateLaboratoryStatus = async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;
    const status = String(req.body.status || "").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ success: false, message: "Invalid laboratory status." });
    const laboratory = await Laboratory.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }).populate("supervisorId", "name email").lean();
    if (!laboratory) return res.status(404).json({ success: false, message: "Laboratory not found." });
    return res.json({ success: true, data: laboratory });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to update laboratory status." });
  }
};

export const deleteLaboratory = async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;
    const laboratory = await Laboratory.findById(req.params.id).select("_id supervisorId").lean();
    if (!laboratory) return res.status(404).json({ success: false, message: "Laboratory not found." });
    await User.deleteMany({ $or: [{ labId: laboratory._id }, { _id: laboratory.supervisorId, role: "LAB SUPERVISOR" }] });
    await Laboratory.findByIdAndDelete(laboratory._id);
    return res.json({ success: true, message: "Laboratory deleted permanently." });
  } catch (error) {
    console.error("Delete laboratory error:", error);
    return res.status(500).json({ success: false, message: "Unable to delete laboratory." });
  }
};
