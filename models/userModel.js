import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["NAWI_ADMIN", "LAB SUPERVISOR", "TESTING OFFICER"],
      required: true,
    },

    // Human-readable identifier for staff; MongoDB _id remains the internal key.
    officerId: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },

    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    labId: { type: mongoose.Schema.Types.ObjectId, ref: "Laboratory", default: null },

    phone: {
      type: String,
      trim: true,
    },

    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ["Female", "Male", "Non-binary", "Prefer not to say", ""], default: "" },

    profileImage: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "PENDING"],
      default: "ACTIVE",
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    passwordResetTokenHash: {
      type: String,
      default: null,
    },

    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1, labId: 1 });
userSchema.index({ role: 1, supervisorId: 1 });

const User = mongoose.model("User", userSchema);

export default User;
