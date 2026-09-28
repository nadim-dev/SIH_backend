import express from "express";
import checkAuth, { allowRoles } from "../middleware/authMiddleware.js";
import { deleteTestDraft, getTestDraft, saveTestDraft } from "../controllers/testDraftController.js";

const router = express.Router();
router.use(checkAuth, allowRoles("TESTING OFFICER", "TESTING_OFFICER", "LAB SUPERVISOR"));
router.get("/:draftKey", getTestDraft);
router.put("/:draftKey", saveTestDraft);
router.delete("/:draftKey", deleteTestDraft);

export default router;
