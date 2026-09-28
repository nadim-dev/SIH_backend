import TestDraft from "../models/testDraftModel.js";

export const getTestDraft = async (req, res) => {
  try {
    const draft = await TestDraft.findOne({ userId: req.user._id, draftKey: req.params.draftKey }).lean();
    return res.json({ success: true, data: draft?.data ?? null, updatedAt: draft?.updatedAt ?? null });
  } catch (error) {
    console.error("Get test draft error:", error);
    return res.status(500).json({ success: false, message: "Unable to load the saved test draft." });
  }
};

export const saveTestDraft = async (req, res) => {
  try {
    const draftData = req.body?.data;
    if (!draftData || typeof draftData !== "object" || Array.isArray(draftData)) {
      return res.status(400).json({ success: false, message: "A test draft object is required." });
    }
    const draft = await TestDraft.findOneAndUpdate(
      { userId: req.user._id, draftKey: req.params.draftKey },
      { $set: { data: draftData } },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.json({ success: true, updatedAt: draft.updatedAt });
  } catch (error) {
    console.error("Save test draft error:", error);
    return res.status(500).json({ success: false, message: "Unable to sync the test draft." });
  }
};

export const deleteTestDraft = async (req, res) => {
  try {
    await TestDraft.deleteOne({ userId: req.user._id, draftKey: req.params.draftKey });
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete test draft error:", error);
    return res.status(500).json({ success: false, message: "Unable to clear the test draft." });
  }
};
