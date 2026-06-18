import path from "path";
import { StatusCodes } from "http-status-codes";
import {
  createDocumentFromUploadService,
  deleteDocumentService,
  getDocumentMetaService,
  listDocumentsForUserService,
  searchInDocumentService,
  queryDocumentService,
  assertOwnedDocument,
} from "../service/rag.service.js";

const RAG_UPLOAD_DIR = process.env.RAG_UPLOAD_DIR || "uploads/rag";

// ── POST /api/rag/documents ───────────────────────────────────────────────────

export const createDocumentController = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "No file uploaded. Please attach a PDF.",
      });
    }

    const data = await createDocumentFromUploadService({
      userId: req.user.id,
      file: req.file,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Document uploaded and processed.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/rag/documents/:documentId ────────────────────────────────────

export const deleteDocumentController = async (req, res, next) => {
  try {
    const data = await deleteDocumentService({
      documentId: req.params.documentId,
      userId: req.user.id,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Document deleted successfully.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/rag/documents/:documentId ───────────────────────────────────────

export const getDocumentMetaController = async (req, res, next) => {
  try {
    const data = await getDocumentMetaService({
      documentId: req.params.documentId,
      userId: req.user.id,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Document fetched successfully.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/rag/documents/:documentId/file ──────────────────────────────────

export const getDocumentFileController = async (req, res, next) => {
  try {
    // assertOwnedDocument verifies ownership and returns the record
    const doc = await assertOwnedDocument(req.params.documentId, req.user.id);

    const absolutePath = path.resolve(RAG_UPLOAD_DIR, doc.storage_path);

    // res.sendFile requires an absolute path; streams the PDF inline
    res.sendFile(
      absolutePath,
      { headers: { "Content-Type": "application/pdf" } },
      (err) => {
        if (err) next(err);
      },
    );
  } catch (error) {
    next(error);
  }
};

// ── GET /api/rag/documents ───────────────────────────────────────────────────

export const listDocumentsController = async (req, res, next) => {
  try {
    const data = await listDocumentsForUserService({ userId: req.user.id });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Documents fetched successfully.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/rag/documents/:documentId/search ────────────────────────────────

export const searchInDocumentController = async (req, res, next) => {
  try {
    const data = await searchInDocumentService({
      documentId: req.params.documentId,
      userId: req.user.id,
      query: req.query.query,
      k: req.query.k ? Number(req.query.k) : 5,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Ranked chunk excerpts",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/rag/documents/:documentId/query ────────────────────────────────

export const queryDocumentController = async (req, res, next) => {
  try {
    const data = await queryDocumentService({
      documentId: req.params.documentId,
      userId: req.user.id,
      query: req.body.query,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Answer and citations",
      data,
    });
  } catch (error) {
    next(error);
  }
};
