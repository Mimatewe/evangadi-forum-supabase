import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { safeExecute } from "../../../../db/config.js";
import {
  NotFoundError,
  ServiceUnavailableError,
} from "../../../utils/errors/index.js";
import {
  generateQuestionEmbedding,
} from "../../question/service/vector.service.js";
import { generateText } from "../../question/service/geminiText.service.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

// ── Config ────────────────────────────────────────────────────────────────────

const RAG_UPLOAD_DIR = process.env.RAG_UPLOAD_DIR || "uploads/rag";
const CHUNK_CHARS = Number(process.env.RAG_CHUNK_CHARS) || 900;
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 120;
const MAX_CHUNKS_PER_DOC = Number(process.env.RAG_MAX_CHUNKS_PER_DOC) || 200;
const MAX_PDFS_PER_USER = Number(process.env.RAG_MAX_PDFS_PER_USER) || 20;
const DEFAULT_K = 5;
const DEFAULT_THRESHOLD = 0.7;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDocument(row) {
  return {
    document_id: row.document_id,
    title: row.title,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    status: row.status,
    error_message: row.error_message ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_id: row.user_id,
    storage_path: row.storage_path,
  };
}

export async function assertOwnedDocument(documentId, userId) {
  const rows = await safeExecute(
    `SELECT * FROM documents WHERE document_id = $1 AND user_id = $2 LIMIT 1`,
    [documentId, userId],
  );

  if (!rows || rows.length === 0) {
    throw new NotFoundError("Document not found.");
  }

  return rows[0];
}

function chunkText(text) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHARS, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end === text.length) break;
    start += CHUNK_CHARS - CHUNK_OVERLAP;
  }

  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

async function updateDocumentStatus(documentId, status, errorMessage = null) {
  await safeExecute(
    `UPDATE documents SET status = $1, error_message = $2 WHERE document_id = $3`,
    [status, errorMessage, documentId],
  );
}

// ── Service: Create (Upload & Process) ───────────────────────────────────────

export async function createDocumentFromUploadService({ userId, file }) {
  const [{ total }] = await safeExecute(
    `SELECT COUNT(*) AS total FROM documents WHERE user_id = $1`,
    [userId],
  );
  // PostgreSQL COUNT() returns a string; coerce to number.
  if (Number(total) >= MAX_PDFS_PER_USER) {
    await fs.unlink(file.path).catch(() => {});
    throw new ServiceUnavailableError(
      `You have reached the maximum limit of ${MAX_PDFS_PER_USER} documents.`,
    );
  }

  const storagePath = path.join(String(userId), path.basename(file.path));

  // PostgreSQL: RETURNING document_id replaces MySQL result.insertId.
  const insertResult = await safeExecute(
    `INSERT INTO documents (user_id, title, mime_type, byte_size, storage_path, status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     RETURNING document_id`,
    [userId, file.originalname, file.mimetype, file.size, storagePath],
  );

  const documentId = insertResult.insertId;

  try {
    const fileBuffer = await fs.readFile(file.path);
    const parsed = await pdfParse(fileBuffer);
    const rawText = parsed.text || "";

    if (!rawText.trim()) {
      throw new Error("PDF contains no extractable text.");
    }

    const chunks = chunkText(rawText);

    if (chunks.length === 0) {
      throw new Error("No text chunks could be produced from this PDF.");
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      // PostgreSQL: RETURNING chunk_id replaces MySQL result.insertId.
      const chunkResult = await safeExecute(
        `INSERT INTO document_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3) RETURNING chunk_id`,
        [documentId, i, chunkContent],
      );
      const chunkId = chunkResult.insertId;

      const { embedding } = await generateQuestionEmbedding(chunkContent, {
        taskType: "RETRIEVAL_DOCUMENT",
      });

      // pgvector: store embedding as a string literal '[v1,v2,...]'.
      const vectorLiteral = `[${embedding.join(",")}]`;
      await safeExecute(
        `INSERT INTO document_chunk_vectors (chunk_id, document_id, embedding) VALUES ($1, $2, $3)`,
        [chunkId, documentId, vectorLiteral],
      );
    }

    await updateDocumentStatus(documentId, "ready");
  } catch (error) {
    await updateDocumentStatus(documentId, "failed", error.message);
    throw new ServiceUnavailableError(
      `Document processing failed: ${error.message}`,
    );
  }

  const rows = await safeExecute(
    `SELECT * FROM documents WHERE document_id = $1 LIMIT 1`,
    [documentId],
  );
  return mapDocument(rows[0]);
}

// ── Service: Delete ───────────────────────────────────────────────────────────

export async function deleteDocumentService({ documentId, userId }) {
  const doc = await assertOwnedDocument(documentId, userId);

  const absolutePath = path.resolve(RAG_UPLOAD_DIR, doc.storage_path);
  await fs.unlink(absolutePath).catch((err) => {
    if (err.code !== "ENOENT") {
      console.warn(`Could not delete file at ${absolutePath}:`, err.message);
    }
  });

  await safeExecute(`DELETE FROM documents WHERE document_id = $1`, [
    documentId,
  ]);

  return { id: documentId };
}

// ── Service: Get Metadata ─────────────────────────────────────────────────────

export async function getDocumentMetaService({ documentId, userId }) {
  const doc = await assertOwnedDocument(documentId, userId);
  return mapDocument(doc);
}

// ── Service: List ─────────────────────────────────────────────────────────────

export async function listDocumentsForUserService({ userId }) {
  const rows = await safeExecute(
    `SELECT document_id, title, mime_type, byte_size, status, error_message, created_at, updated_at
     FROM documents
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    document_id: row.document_id,
    title: row.title,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    status: row.status,
    error_message: row.error_message ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

// ── Service: Semantic Search ──────────────────────────────────────────────────

export async function searchInDocumentService({
  documentId,
  userId,
  query,
  k = DEFAULT_K,
}) {
  const doc = await assertOwnedDocument(documentId, userId);
  if (doc.status !== "ready") {
    throw new ServiceUnavailableError(
      `Document is not ready for search (current status: ${doc.status}).`,
    );
  }

  const { embedding: queryEmbedding } = await generateQuestionEmbedding(query, {
    taskType: "RETRIEVAL_QUERY",
  });

  // pgvector native cosine-distance search within this document's chunks.
  //   cosine_distance = embedding <=> query  (0 = identical)
  //   cosine_similarity = 1 - cosine_distance
  // Filter by max distance = (1 - DEFAULT_THRESHOLD), order ascending, limit k.
  const queryVectorLiteral = `[${queryEmbedding.join(",")}]`;
  const maxDistance = 1 - DEFAULT_THRESHOLD;

  let vectorRows;
  try {
    vectorRows = await safeExecute(
      `
      SELECT dcv.chunk_id,
             dc.chunk_index,
             dc.content,
             dcv.embedding <=> $1 AS distance
      FROM document_chunk_vectors dcv
      JOIN document_chunks dc ON dc.chunk_id = dcv.chunk_id
      WHERE dcv.document_id = $2
        AND dcv.embedding IS NOT NULL
        AND dcv.embedding <=> $1 <= $3
      ORDER BY dcv.embedding <=> $1
      LIMIT $4
      `,
      [queryVectorLiteral, documentId, maxDistance, k],
    );
  } catch (error) {
    console.error("=== DATABASE ERROR DURING DOCUMENT VECTOR SEARCH ===");
    console.error("Error:", error);
    throw error;
  }

  if (!vectorRows || vectorRows.length === 0) {
    return { query, results: [] };
  }

  const results = vectorRows.map((row) => ({
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    // Convert distance back to similarity score for the API response.
    score: Number((1 - Number(row.distance)).toFixed(6)),
    excerpt: row.content,
  }));

  return { query, results };
}

// ── Service: AI Query (RAG) ───────────────────────────────────────────────────

export async function queryDocumentService({ documentId, userId, query }) {
  const { results: topChunks } = await searchInDocumentService({
    documentId,
    userId,
    query,
    k: DEFAULT_K,
  });

  if (topChunks.length === 0) {
    return {
      answer:
        "I could not find relevant information in this document to answer your question.",
      citations: [],
      chunksUsed: [],
    };
  }

  const contextBlock = topChunks
    .map((c, i) => `[${i + 1}] (chunk ${c.chunkIndex})\n${c.excerpt}`)
    .join("\n\n---\n\n");

  const prompt = `You are an expert assistant. Answer the user's question using ONLY the context passages below.
If the answer is not contained in the context, say "I don't know based on the provided document."
Do not make up information.

Context:
${contextBlock}

Question: ${query}

Respond with a JSON object with two fields:
- "answer": a clear, direct answer string
- "citations": an array of objects { "ref": <1-based index>, "chunkIndex": <chunk index> } for every passage you used`;

  const rawResponse = await generateText(prompt);

  let answer = "Unable to generate an answer.";
  let citations = [];

  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      answer = String(parsed.answer || answer);
      citations = Array.isArray(parsed.citations) ? parsed.citations : [];
    }
  } catch {
    answer = rawResponse.trim() || answer;
  }

  return {
    answer,
    citations,
    chunksUsed: topChunks.map((c) => c.chunkId),
  };
}


