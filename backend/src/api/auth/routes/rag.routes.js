import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import {
  ragUpload,
  createDocumentMulterErrorHandler,
} from "../config/rag.upload.config.js";
import {
  createDocumentController,
  deleteDocumentController,
  getDocumentMetaController,
  getDocumentFileController,
  listDocumentsController,
  searchInDocumentController,
  queryDocumentController,
} from "../controller/rag.controller.js";
import {
  deleteDocumentValidation,
  getDocumentMetaValidation,
  getDocumentFileValidation,
  searchInDocumentValidation,
  queryDocumentValidation,
} from "../validation/rag.validation.js";

const ragRoutes = express.Router();

// All RAG routes require a valid JWT
ragRoutes.use(authenticateUser);

/**
 * @route  POST /api/rag/documents
 * @desc   Upload and process a PDF document
 * @access Protected
 */
ragRoutes.post(
  "/documents",
  ragUpload.single("file"), // Multer processes multipart/form-data
  createDocumentMulterErrorHandler, // Converts Multer errors → clean 400
  createDocumentController,
);

/**
 * @route  GET /api/rag/documents
 * @desc   List all documents owned by the authenticated user
 * @access Protected
 */
ragRoutes.get("/documents", listDocumentsController);

/**
 * @route  GET /api/rag/documents/:documentId/search
 * @desc   Semantic search within a specific document
 * @access Protected
 *
 * NOTE: This route must come BEFORE /:documentId to avoid Express matching
 * "search" as a documentId.
 */
ragRoutes.get(
  "/documents/:documentId/search",
  searchInDocumentValidation,
  searchInDocumentController,
);

/**
 * @route  POST /api/rag/documents/:documentId/query
 * @desc   AI-grounded Q&A against a document's content
 * @access Protected
 */
ragRoutes.post(
  "/documents/:documentId/query",
  queryDocumentValidation,
  queryDocumentController,
);

/**
 * @route  GET /api/rag/documents/:documentId/file
 * @desc   Stream the raw PDF back to the client
 * @access Protected
 */
ragRoutes.get(
  "/documents/:documentId/file",
  getDocumentFileValidation,
  getDocumentFileController,
);

/**
 * @route  GET /api/rag/documents/:documentId
 * @desc   Fetch metadata for a single document
 * @access Protected
 */
ragRoutes.get(
  "/documents/:documentId",
  getDocumentMetaValidation,
  getDocumentMetaController,
);

/**
 * @route  DELETE /api/rag/documents/:documentId
 * @desc   Delete a document from disk and database
 * @access Protected
 */
ragRoutes.delete(
  "/documents/:documentId",
  deleteDocumentValidation,
  deleteDocumentController,
);
export default ragRoutes;
