import express from "express";
import { activateTestingOfficer, changeMyPassword, createTestingOfficer, deactivateTestingOfficer, deleteAdminUser, deleteTestingOfficer, getAdminUsers, getCurrentUser, getTestingOfficers, loginUser, logoutUser, updateAdminUserStatus, updateMyProfile } from "../controllers/authController.js";
import checkAuth, { allowRoles } from "../middleware/authMiddleware.js";

const router=express.Router();


router.post("/login",loginUser);
router.get("/me", checkAuth, getCurrentUser);
router.patch("/me/profile", checkAuth, updateMyProfile);
router.patch("/me/password", checkAuth, changeMyPassword);
router.post("/logout", checkAuth, logoutUser);
router.get("/users", checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"), getAdminUsers);
router.patch("/users/:userId/status", checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"), updateAdminUserStatus);
router.delete("/users/:userId", checkAuth, allowRoles("NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"), deleteAdminUser);
router.post("/testing-officers", checkAuth, allowRoles("LAB SUPERVISOR"), createTestingOfficer);
router.get("/testing-officers", checkAuth, allowRoles("LAB SUPERVISOR", "NAWI_ADMIN", "ADMIN", "ADMINISTRATOR"), getTestingOfficers);
router.delete("/testing-officers/:userId", checkAuth, allowRoles("LAB SUPERVISOR"), deleteTestingOfficer);
router.patch("/testing-officers/:userId/deactivate", checkAuth, allowRoles("LAB SUPERVISOR"), deactivateTestingOfficer);
router.patch("/testing-officers/:userId/activate", checkAuth, allowRoles("LAB SUPERVISOR"), activateTestingOfficer);

export default router;
