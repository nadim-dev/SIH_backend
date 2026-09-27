import mongoose from "mongoose";

const laboratorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    type: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pinCode: { type: String, required: true, trim: true },
    officialEmail: { type: String, required: true, trim: true, lowercase: true },
    contactNumber: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: "" },
    location: { type: String, required: true, trim: true },
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);

export default mongoose.model("Laboratory", laboratorySchema);
