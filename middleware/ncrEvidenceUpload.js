import multer from "multer";

const allowedMimeTypes = new Set(["image/png", "image/jpg", "image/jpeg", "application/pdf"]);

export const ncrEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => allowedMimeTypes.has(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Only JPG, PNG, JPEG, and PDF evidence files are supported")),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});
