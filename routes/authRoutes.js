import express from "express";
import { loginUser, logoutUser } from "../controllers/authController.js";
import checkAuth from "../middleware/authMiddleware.js";

const router=express.Router();


router.post("/login",loginUser);
router.post("/logout", checkAuth, logoutUser);

export default router;
