import express from "express";
import cors from "cors";
import instrumentRoutes from "./routes/instrumentRoutes.js";
import { connectDB } from "./config/mongoose.js";
import authRoutes from "./routes/authRoutes.js";
import cookieParser from "cookie-parser";
import notificationRoutes from "./routes/notificationRoutes.js";
import laboratoryRoutes from "./routes/laboratoryRoutes.js";
import auditLogRoutes from "./routes/auditLogRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";
import testDraftRoutes from "./routes/testDraftRoutes.js";

const app = express();

const PORT = process.env.PORT || 4000;
const mySecretKey = process.env.mySecretKey;

app.use(cors({
  // Reflect the requesting origin so deployed and local frontends can connect.
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser(mySecretKey));

app.use("/api/instruments", instrumentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/laboratories", laboratoryRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/test-drafts", testDraftRoutes);

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
