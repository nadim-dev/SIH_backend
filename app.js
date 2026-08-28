import express from "express";
import cors from "cors";

const app=express();
const PORT=500

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));




app.listen(PORT,()=>{
    console.log("Server is running on http://localhost:5000")
})