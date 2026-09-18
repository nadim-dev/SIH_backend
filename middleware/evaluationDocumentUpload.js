import multer from "multer";

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export const uploadEvaluationDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error("Only PDF, PNG, JPG, and JPEG files are supported."));
    }
    callback(null, true);
  },
});
