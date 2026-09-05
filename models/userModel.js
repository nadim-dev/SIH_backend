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
      enum: ["NAWI_ADMIN", "LAB_SUPERVISOR", "TESTING_PERSON"],
      required: true,
    },

    labId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      default: null,
    },

    phone: {
      type: String,
      trim: true,
    },

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

//* NAWI Admin does not belong to a specific lab.
//* Lab users must have a labId.


userSchema.pre("validate", function () {
  if (this.role === "NAWI_ADMIN") {
    this.labId = null;
  }

  if (
    (this.role === "LAB_SUPERVISOR" ||
      this.role === "TESTING_PERSON") &&
    !this.labId
  ) {
    throw new Error("Lab ID is required for lab users");
  }
});

const User = mongoose.model("User", userSchema);

export default User;
