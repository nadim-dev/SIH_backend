import  User from "../models/userModel.js";
import { loginSchema } from "../validators/authValidators.js";
import bcrypt from "bcrypt";
import { sanitize } from "../utils/sanitize.js";
import redisClient from "../config/redis.js";
import crypto from "node:crypto";
import mongoose from "mongoose";
import Counter from "../models/counterModel.js";
import Evaluation from "../models/evaluationModel.js";
import { recordAudit } from "../utils/auditLogger.js";
import Notification from "../models/notificationModel.js";
import { sessionCookieOptions } from "../config/sessionCookie.js";
import { clearSessionCookie } from "../config/sessionCookie.js";

export const getAdminUsers = async (req, res) => {
  try {
    const users = await User.find({ role: { $nin: ["NAWI_ADMIN", "ADMIN", "ADMINISTRATOR", "Admin"] } })
      .select("name email role officerId phone status labId createdAt lastLoginAt")
      .populate("labId", "name code")
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ users });
  } catch (error) {
    console.error("Get admin users error:", error);
    return res.status(500).json({ message: "Unable to load users." });
  }
};

export const updateAdminUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const status = String(req.body.status || "").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(status) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user and status are required." });
    }
    const user = await User.findOneAndUpdate(
      { _id: userId, role: { $nin: ["NAWI_ADMIN", "ADMIN", "ADMINISTRATOR", "Admin"] } },
      { $set: { status } },
      { new: true },
    ).select("_id name email role officerId status").lean();
    if (!user) return res.status(404).json({ message: "User not found." });
    await recordAudit(req, { action: status === "INACTIVE" ? "User Deactivated" : "User Activated", details: `${status === "INACTIVE" ? "Deactivated" : "Activated"} the account for ${user.name}.`, relatedTo: user.officerId || String(user._id), relatedModel: "User" });
    return res.status(200).json({ user });
  } catch (error) {
    console.error("Update admin user status error:", error);
    return res.status(500).json({ message: "Unable to update user status." });
  }
};

export const deleteAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: "A valid user ID is required." });
    const user = await User.findOneAndDelete({ _id: userId, role: { $nin: ["NAWI_ADMIN", "ADMIN", "ADMINISTRATOR", "Admin"] } }).select("_id name email role officerId").lean();
    if (!user) return res.status(404).json({ message: "User not found." });
    await recordAudit(req, { action: "User Deleted", details: `Deleted the account for ${user.name}.`, relatedTo: user.officerId || String(user._id), relatedModel: "User" });
    return res.status(200).json({ message: "User deleted permanently.", user });
  } catch (error) {
    console.error("Delete admin user error:", error);
    return res.status(500).json({ message: "Unable to delete user." });
  }
};

export const getTestingOfficers = async (req, res) => {
  try {
    const adminRoles = ["NAWI ADMIN", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"];
    const isAdmin = adminRoles.includes(String(req.user.role || "").trim().toUpperCase());
    if (req.user.role !== "LAB SUPERVISOR" && !isAdmin) {
      return res.status(403).json({ message: "Only supervisors and administrators can view testing officers." });
    }
    const query = { role: "TESTING OFFICER" };
    if (isAdmin && req.query.labId) query.labId = req.query.labId;
    if (!isAdmin) query.supervisorId = req.user._id;
    const users = await User.find(query)
      .select("name email officerId status labId")
      .sort({ name: 1 })
      .lean();
    const counts = await Evaluation.aggregate([
      { $match: { testingOfficerId: { $in: users.map((user) => user._id) } } },
      { $group: { _id: "$testingOfficerId", assignedTests: { $sum: 1 }, activeTests: { $sum: { $cond: [{ $in: ["$status", ["TESTING", "IN_PROGRESS"]] }, 1, 0] } } } },
    ]);
    const countByOfficer = new Map(counts.map((item) => [String(item._id), item]));
    const officers = users.map((user, index) => {
      const count = countByOfficer.get(String(user._id));
      return {
        number: index + 1,
        _id: user._id,
        name: user.name,
        email: user.email,
        officerId: user.officerId,
        assignedTests: count?.assignedTests || 0,
        status: count?.activeTests ? "In Testing" : user.status === "INACTIVE" ? "Inactive" : "Active",
      };
    });
    return res.status(200).json({ officers });
  } catch (error) {
    console.error("Get testing officers error:", error);
    return res.status(500).json({ message: "Unable to load testing officers." });
  }
};

export const deleteTestingOfficer = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") {
      return res.status(403).json({ message: "Only lab supervisors can delete testing officers." });
    }
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid officer ID is required." });
    }

    const deletedOfficer = await User.findOneAndDelete({
      _id: userId,
      role: "TESTING OFFICER",
      supervisorId: req.user._id,
    }).select("name email officerId").lean();

    if (!deletedOfficer) {
      return res.status(404).json({ message: "Testing officer not found in your laboratory." });
    }
    await recordAudit(req, { action: "User Deleted", details: `Deleted the testing officer account for ${deletedOfficer.name}.`, relatedTo: deletedOfficer.officerId || String(deletedOfficer._id), relatedModel: "User" });
    return res.status(200).json({ message: "Testing officer deleted permanently.", officer: deletedOfficer });
  } catch (error) {
    console.error("Delete testing officer error:", error);
    return res.status(500).json({ message: "Unable to delete testing officer." });
  }
};

export const deactivateTestingOfficer = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") {
      return res.status(403).json({ message: "Only lab supervisors can deactivate testing officers." });
    }
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid officer ID is required." });
    }
    const officer = await User.findOneAndUpdate(
      { _id: userId, role: "TESTING OFFICER", supervisorId: req.user._id },
      { $set: { status: "INACTIVE" } },
      { new: true }
    ).select("_id name email officerId status").lean();
    if (!officer) return res.status(404).json({ message: "Testing officer not found in your laboratory." });
    await recordAudit(req, { action: "User Deactivated", details: `Deactivated the testing officer account for ${officer.name}.`, relatedTo: officer.officerId || String(officer._id), relatedModel: "User" });
    return res.status(200).json({ message: "Testing officer deactivated.", officer });
  } catch (error) {
    console.error("Deactivate testing officer error:", error);
    return res.status(500).json({ message: "Unable to deactivate testing officer." });
  }
};

export const activateTestingOfficer = async (req, res) => {
  try {
    if (req.user.role !== "LAB SUPERVISOR") return res.status(403).json({ message: "Only lab supervisors can activate testing officers." });
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: "A valid officer ID is required." });
    const officer = await User.findOneAndUpdate(
      { _id: userId, role: "TESTING OFFICER", supervisorId: req.user._id },
      { $set: { status: "ACTIVE" } },
      { new: true }
    ).select("_id name email officerId status").lean();
    if (!officer) return res.status(404).json({ message: "Testing officer not found in your laboratory." });
    return res.status(200).json({ message: "Testing officer activated.", officer });
  } catch (error) {
    console.error("Activate testing officer error:", error);
    return res.status(500).json({ message: "Unable to activate testing officer." });
  }
};

export const createTestingOfficer = async (req, res) => {
  try {
    
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
      return res.status(400).json({ message: "Enter a valid name, email, and password of at least 6 characters." });
    }

    const existingUser = await User.findOne({ email }).select("_id").lean();
    if (existingUser) return res.status(409).json({ message: "An account with this email already exists." });

    const counter = await Counter.findOneAndUpdate(
      { name: "testingOfficerId" },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const officerId = `TO-${100 + counter.sequence}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const supervisor = await User.findById(req.user._id).select("name labId").lean();
    const officer = await User.create({
      name,
      email,
      passwordHash,
      role: "TESTING OFFICER",
      officerId,
      supervisorId: req.user._id,
      labId: supervisor?.labId || null,
    });

    const admins = await User.find({ _id: "6ab297939660fedfb58886f9" }).select("_id").lean();
    if (admins.length) {
      await Notification.insertMany(admins.map((admin) => ({
        recipientId: admin._id,
        recipientRole: "Admin",
        message: `${supervisor?.name || "A supervisor"} created testing officer ${officer.name} (${officer.officerId}).`,
      })));
    }

    return res.status(201).json({
      message: "Testing officer created successfully.",
      officer: { _id: officer._id, name: officer.name, email: officer.email, officerId: officer.officerId, role: officer.role },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This officer account or ID already exists." });
    console.error("Create testing officer error:", error);
    return res.status(500).json({ message: "Unable to create testing officer." });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const sessionId = req.signedCookies?.sid;
    if (sessionId) await redisClient.del(`session:${sessionId}`);
    clearSessionCookie(res);
    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    clearSessionCookie(res);
    return res.status(200).json({ message: "Logout successful" });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("name email role accountStatus phone dateOfBirth gender officerId profileImage createdAt labId")
      .lean();

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    return res.status(200).json({ currentUser: user });
  } catch (error) {
    return res.status(500).json({ message: "Unable to restore session" });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const gender = String(req.body.gender || "").trim();
    const dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    if (name.length < 2 || name.length > 100) return res.status(400).json({ message: "Name must be between 2 and 100 characters." });
    if (phone && !/^[+\d()\-\s]{7,20}$/.test(phone)) return res.status(400).json({ message: "Enter a valid phone number." });
    if (gender && !["Female", "Male", "Non-binary", "Prefer not to say"].includes(gender)) return res.status(400).json({ message: "Select a valid gender option." });
    if (dateOfBirth && (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date())) return res.status(400).json({ message: "Enter a valid date of birth." });

    const user = await User.findByIdAndUpdate(req.user._id, { $set: { name, phone, gender, dateOfBirth } }, { new: true, runValidators: true })
      .select("name email role accountStatus phone dateOfBirth gender officerId profileImage createdAt labId").lean();
    if (!user) return res.status(404).json({ message: "User account not found." });
    return res.status(200).json({ message: "Profile updated.", currentUser: user });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Unable to update profile." });
  }
};

export const changeMyPassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    if (newPassword.length < 8) return res.status(400).json({ message: "New password must be at least 8 characters." });
    const user = await User.findById(req.user._id).select("passwordHash");
    if (!user) return res.status(404).json({ message: "User account not found." });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ message: "Current password is incorrect." });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
};


export const loginUser = async (req, res) => {
  console.log("Login controller function is running");
 
  try {
    const { success, data } = loginSchema.safeParse(req.body);

    if (!success) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const { password, email } = sanitize(data);
    const user = await User.findOne({ email }).lean();
   

    if (!user) {
      return res.status(404).json({ message: "user dosen't exist" });
    }

   

 if (user.role == "Supervisor" &&
  user.accountStatus !== "active"
) {
  return res.status(403).json({
    message: "Your registration is awaiting admin approval.",
  });
}




    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credential" });
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiryTime = 7 * 24 * 60 * 60;
    const rediskey = `session:${sessionId}`;

    await redisClient.hSet(rediskey, {
      userId: user._id.toString(),
      role:user.role,
      createdAt: Date.now(),
    });
    
    await redisClient.expire(rediskey, sessionExpiryTime);

    res.cookie("sid", sessionId, {
      ...sessionCookieOptions,
      maxAge: sessionExpiryTime * 1000,
    });

    

    return res.status(200).json({ message: "Login successful", currentUser:user });
  } catch (err) {
    console.log(err);
    console.log(err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
