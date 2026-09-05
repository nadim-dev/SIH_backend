import express from "express";
import cors from "cors";
import instrumentRoutes from "./routes/instrumentRoutes.js"
import { connectDB } from "./config/mongoose.js";
import authRoutes from "./routes/authRoutes.js";
import cookieParser from "cookie-parser";

const app=express();
const PORT=5000
const mySecretKey = process.env.mySecretKey;

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));

app.use(express.json());

app.use(cookieParser(mySecretKey));

app.use("/api/instruments",instrumentRoutes);
app.use("/api/auth/",authRoutes);


const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
};

startServer();
