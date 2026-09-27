import express from "express";
import checkAuth from "../middleware/authMiddleware.js";
import { chatWithAssistant } from "../controllers/assistantController.js";

const router = express.Router();

router.post("/chat", checkAuth, chatWithAssistant);

export default router;
