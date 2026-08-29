import express from "express";
import { registerInstrument, getInstrumentForTesting, submitInstrumentObservations } from "../controllers/instrumentController.js";

import { uploadInstrumentPicture } from "../middleware/instrumentPictureUpload.js";
const router=express.Router();



router.post('/register', uploadInstrumentPicture.single('nameplatePhoto'), registerInstrument);
router.get('/:id', getInstrumentForTesting);
router.post('/:id/submit-observations', submitInstrumentObservations);


export default router;
