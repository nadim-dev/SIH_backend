import express from "express";
import { getCurrentUser, loginUser, logoutUser } from "../controllers/authController.js";
import checkAuth from "../middleware/authMiddleware.js";

const router=express.Router();


router.post("/login",loginUser);
router.get("/me", checkAuth, getCurrentUser);
router.post("/logout", checkAuth, logoutUser);

export default router;
