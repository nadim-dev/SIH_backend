import multer from "multer";

const maxFileSize = 5 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
]);

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error("Only PNG, JPG, JPEG files are supported"));
  }

  cb(null, true);
};


export const uploadInstrumentPicture = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
});
