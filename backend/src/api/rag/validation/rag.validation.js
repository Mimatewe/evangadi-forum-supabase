import { param, query, body } from "express-validator";
import { validationErrorHandler } from "../../../middleware/validation-handler.js";

// ── Shared ────────────────────────────────────────────────────────────────────

export const documentIdParamValidation = [
  param("documentId")
    .notEmpty()
    .withMessage("documentId is required")
    .isInt({ min: 1 })
    .withMessage("documentId must be a positive integer")
    .toInt(),
  validationErrorHandler,
];

// ── POST /api/rag/documents ───────────────────────────────────────────────────
// Body validation is minimal here — the real gate is Multer (file type / size).
export const createDocumentValidation = [
  // No extra body fields required; file is handled by Multer.
  validationErrorHandler,
];

// ── DELETE /api/rag/documents/:documentId ────────────────────────────────────
export const deleteDocumentValidation = [...documentIdParamValidation];

// ── GET /api/rag/documents/:documentId ───────────────────────────────────────
export const getDocumentMetaValidation = [...documentIdParamValidation];

// ── GET /api/rag/documents/:documentId/file ──────────────────────────────────
export const getDocumentFileValidation = [...documentIdParamValidation];

// ── GET /api/rag/documents/:documentId/search ────────────────────────────────
export const searchInDocumentValidation = [
  param("documentId")
    .notEmpty()
    .withMessage("documentId is required")
    .isInt({ min: 1 })
    .withMessage("documentId must be a positive integer")
    .toInt(),
  query("query")
    .notEmpty()
    .withMessage("query is required")
    .isString()
    .withMessage("query must be a string")
    .isLength({ min: 3 })
    .withMessage("query must be at least 3 characters")
    .trim(),
  query("k")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("k must be an integer between 1 and 20")
    .toInt(),
  validationErrorHandler,
];

// ── POST /api/rag/documents/:documentId/query ────────────────────────────────
export const queryDocumentValidation = [
  param("documentId")
    .notEmpty()
    .withMessage("documentId is required")
    .isInt({ min: 1 })
    .withMessage("documentId must be a positive integer")
    .toInt(),
  body("query")
    .notEmpty()
    .withMessage("query is required")
    .isString()
    .withMessage("query must be a string")
    .isLength({ min: 3 })
    .withMessage("query must be at least 3 characters")
    .trim(),
  validationErrorHandler,
];
