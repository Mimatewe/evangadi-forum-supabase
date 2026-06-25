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
  calculateCosineSimilarity,
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
    `SELECT * FROM documents WHERE document_id = ? AND user_id = ? LIMIT 1`,
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
    `UPDATE documents SET status = ?, error_message = ? WHERE document_id = ?`,
    [status, errorMessage, documentId],
  );
}

// ── Service: Create (Upload & Process) ───────────────────────────────────────

export async function createDocumentFromUploadService({ userId, file }) {
  const [{ total }] = await safeExecute(
    `SELECT COUNT(*) AS total FROM documents WHERE user_id = ?`,
    [userId],
  );
  if (Number(total) >= MAX_PDFS_PER_USER) {
    await fs.unlink(file.path).catch(() => {});
    throw new ServiceUnavailableError(
      `You have reached the maximum limit of ${MAX_PDFS_PER_USER} documents.`,
    );
  }

  const storagePath = path.join(String(userId), path.basename(file.path));

  const insertResult = await safeExecute(
    `INSERT INTO documents (user_id, title, mime_type, byte_size, storage_path, status)
     VALUES (?, ?, ?, ?, ?, 'processing')`,
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

      const chunkResult = await safeExecute(
        `INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)`,
        [documentId, i, chunkContent],
      );
      const chunkId = chunkResult.insertId;

      const { embedding } = await generateQuestionEmbedding(chunkContent, {
        taskType: "RETRIEVAL_DOCUMENT",
      });

      await safeExecute(
        `INSERT INTO document_chunk_vectors (chunk_id, document_id, embedding) VALUES (?, ?, ?)`,
        [chunkId, documentId, JSON.stringify(embedding)],
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
    `SELECT * FROM documents WHERE document_id = ? LIMIT 1`,
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

  await safeExecute(`DELETE FROM documents WHERE document_id = ?`, [
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
     WHERE user_id = ?
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

  const vectorRows = await safeExecute(
    `SELECT dcv.chunk_id, dcv.embedding
     FROM document_chunk_vectors dcv
     WHERE dcv.document_id = ?`,
    [documentId],
  );

  if (!vectorRows || vectorRows.length === 0) {
    return { query, results: [] };
  }

  const scored = [];
  for (const row of vectorRows) {
    try {
      const embedding =
        typeof row.embedding === "string"
          ? JSON.parse(row.embedding)
          : row.embedding;
      const score = calculateCosineSimilarity(queryEmbedding, embedding);
      if (score >= DEFAULT_THRESHOLD) {
        scored.push({ chunkId: row.chunk_id, score });
      }
    } catch {
      // Malformed vector — skip silently
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, k);

  if (topK.length === 0) {
    return { query, results: [] };
  }

  const chunkIds = topK.map((r) => r.chunkId);
  const placeholders = chunkIds.map(() => "?").join(", ");
  const chunkRows = await safeExecute(
    `SELECT chunk_id, chunk_index, content FROM document_chunks WHERE chunk_id IN (${placeholders})`,
    chunkIds,
  );

  const chunkMap = {};
  chunkRows.forEach((c) => {
    chunkMap[c.chunk_id] = { chunkIndex: c.chunk_index, content: c.content };
  });

  const results = topK
    .filter((r) => chunkMap[r.chunkId])
    .map((r) => ({
      chunkId: r.chunkId,
      chunkIndex: chunkMap[r.chunkId].chunkIndex,
      score: Number(r.score.toFixed(6)),
      excerpt: chunkMap[r.chunkId].content,
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


