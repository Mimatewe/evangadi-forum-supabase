import multer from "multer";
import path from "path";
import fs from "fs";
import { StatusCodes } from "http-status-codes";

const RAG_UPLOAD_DIR = process.env.RAG_UPLOAD_DIR || "uploads/rag";
const RAG_MAX_UPLOAD_MB = Number(process.env.RAG_MAX_UPLOAD_MB) || 10;
const MAX_FILE_SIZE_BYTES = RAG_MAX_UPLOAD_MB * 1024 * 1024;

// Ensure the base upload directory exists on startup
if (!fs.existsSync(RAG_UPLOAD_DIR)) {
  fs.mkdirSync(RAG_UPLOAD_DIR, { recursive: true });
}

/**
 * Multer disk storage — files are saved to uploads/rag/<userId>/<uuid>.pdf
 * The userId sub-folder is created on demand inside the destination callback.
 */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Organise uploads per user so storage_path stays short and clean
    const userDir = path.join(RAG_UPLOAD_DIR, String(req.user.id));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },

  filename(req, file, cb) {
    // <timestamp>-<random-hex>.pdf  — collision-safe without a DB round-trip
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${uniqueSuffix}.pdf`);
  },
});

/** Only allow PDF MIME type */
function fileFilter(req, file, cb) {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are accepted."));
  }
}

export const ragUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

/**
 * Express error-handling middleware that converts Multer errors into clean
 * JSON 400 responses so the client always receives a consistent error shape.
 */
export function createDocumentMulterErrorHandler(err, req, res, next) {
  // Handle non-PDF uploads
  if (err.message === "Only PDF files are accepted.") {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: err.message,
    });
  }

  // Handle Multer-specific errors
  if (err instanceof multer.MulterError) {
    let message;

    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        message = `File is too large. Maximum allowed size is ${RAG_MAX_UPLOAD_MB} MB.`;
        break;

      default:
        message = err.message || "File upload error.";
    }

    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message,
    });
  }

  // Pass other errors to global error handler
  next(err);
}