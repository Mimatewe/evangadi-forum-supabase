import { GoogleGenerativeAI } from "@google/generative-ai";
import { safeExecute } from "../../../../db/config.js";
import { ServiceUnavailableError } from "../../../utils/errors/index.js";

const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

// const GEMINI_API_KEY =
//   process.env.GEMINI_API_KEY;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;



const RECOMMEND_THRESHOLD = Number(process.env.RECOMMEND_THRESHOLD) || 0.75;
const RECOMMEND_K = Number(process.env.RECOMMEND_K) || 5;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

export function isGeminiApiKeyInvalidError(error) {
  const details = error?.errorDetails || [];
  const invalidDetail = Array.isArray(details)
    ? details.some(
        (detail) =>
          detail?.reason === "API_KEY_INVALID" ||
          /api_key_invalid/i.test(detail?.reason || "") ||
          /API key not valid/i.test(detail?.message || ""),
      )
    : false;

  return (
    error?.status === 400 &&
    (invalidDetail || /API key not valid/i.test(error?.message || ""))
  );
}

const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiEmbeddingModel = ai.getGenerativeModel({
  model: GEMINI_EMBEDDING_MODEL,
});

/**
 * Utility to collapse consecutive whitespace characters into a single space
 * and trim leading/trailing whitespace for consistent text formatting.
 * @param {string} value - The input text to normalize.
 * @returns {string} The normalized text with collapsed whitespace and trimmed ends.
 */

/**
 * Normalize the question title by converting to lowercase, applying Unicode NFKC normalization,
 * and collapsing multiple whitespace characters into single spaces. This ensures consistent
 * text formatting for downstream tasks such as duplicate detection and vector generation.
 * // Example: " What's NEW in    AI? " -> "what's new in ai?";
 * @param {{title: string}} param - An object containing the question title.
 * @returns {string} The normalized question text.
 */
export function normalizeQuestionText({ title }) {
  return normalizeWhitespace(`${title || ""}`)
    .normalize("NFKC")
    .toLowerCase();
}

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Calculate cosine similarity...
 * Formula: cos(θ) = (A · B) / (||A|| * ||B||)
 * * @param {number[]} vectorA - First embedding vector
 * @param {number[]} vectorB - Second embedding vector
 * @returns {number} Similarity score between -1 and 1 (typically 0 to 1 for embeddings)
 * @throws {Error} If vectors have different lengths
 */
export function calculateCosineSimilarity(vectorA, vectorB) {
  // Validate vectors have same length
  if (vectorA.length !== vectorB.length) {
    throw new Error(
      `Vectors must have the same length. Got ${vectorA.length} and ${vectorB.length}`,
    );
  }

  // Calculate dot product (sum of element-wise multiplication)
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const a = Number(vectorA[i]) || 0;
    const b = Number(vectorB[i]) || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

//calculating magnitude of each vector(square root of sum of squares)

/**
 * Generate a normalized embedding for the provided question text using the Gemini API.
 * * @param {string} sourceText - The text to embed.
 * @param {Object} [options] - Optional parameters to customize the embedding generation.
 * @param {string} [options.taskType='RETRIEVAL_DOCUMENT'] - The specific Gemini task type.
 * Use 'RETRIEVAL_QUERY' when generating embeddings for user searches.
 * @returns {Promise<{embedding: Array<number>}>} The normalized embedding vector.
 * @throws {Error} If the embedding response is invalid or missing values.
 */
export async function generateQuestionEmbedding(sourceText, options = {}) {
  const { taskType = "RETRIEVAL_DOCUMENT" } = options;

  try {
    const result = await geminiEmbeddingModel.embedContent({
      content: { parts: [{ text: sourceText }] },
      taskType,
    });

    let values = result?.embedding?.values;

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Gemini embedding response does not contain values");
    }

    return {
      embedding: values,
    };
  } catch (error) {
    if (isGeminiApiKeyInvalidError(error)) {
      console.warn(
        "Gemini API key invalid or unauthorized. Embedding generation is currently disabled.",
      );
      throw new ServiceUnavailableError(
        "Gemini API key invalid. Please verify GEMINI_API_KEY and try again.",
      );
    }

    console.error("Error:", error);
    console.error("====================");
    throw error;
  }
}

/**
 * Persist a question embedding record in the `question_vectors` table.
 *
 * PostgreSQL + pgvector notes:
 *  - The `embedding` column is a native VECTOR(768) type, stored as a
 *    string literal like '[0.1,0.2,...]'.
 *  - `ON CONFLICT (question_id) DO UPDATE` replaces MySQL's
 *    `ON DUPLICATE KEY UPDATE`.
 *  - Empty/failed embeddings are stored as NULL (a VECTOR column cannot
 *    hold an empty array).
 *
 * @param {{questionId: number, sourceText: string, embedding: number[]|any, status: string}} params
 */
export async function storeQuestionVector({
  questionId,
  sourceText,
  embedding = [],
  status = "ready",
}) {
  // Format the embedding for pgvector: '[0.1,0.2,...]' or NULL when empty.
  const vectorLiteral =
    Array.isArray(embedding) && embedding.length > 0
      ? `[${embedding.join(",")}]`
      : null;

  const sql = `
    INSERT INTO question_vectors (question_id, source_text, embedding, status)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (question_id)
    DO UPDATE SET embedding = EXCLUDED.embedding,
                  status = EXCLUDED.status,
                  source_text = EXCLUDED.source_text,
                  updated_at = CURRENT_TIMESTAMP
  `;

  try {
    await safeExecute(sql, [questionId, sourceText, vectorLiteral, status]);
  } catch (error) {
    console.error("=== FAILED TO STORE QUESTION VECTOR ===");
    console.error("QuestionId:", questionId);
    console.error("Status:", status);
    console.error("Error:", error);
    throw error;
  }
}

// pgvector returns embeddings as text like '[0.1,0.2,...]' which is valid
// JSON, so JSON.parse recovers the number array. Arrays pass through.
function parseVector(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

async function retrieveReadyEmbeddings() {
  // Query question_vectors table with status='ready' filter.
  // Only rows with a non-null embedding are usable for similarity search.
  const sql = `
  SELECT
    question_id,
    embedding
  FROM question_vectors
  WHERE status = $1
    AND embedding IS NOT NULL
`;

  try {
    const rows = await safeExecute(sql, ["ready"]);

    const embeddings = [];
    for (const row of rows) {
      const embedding = parseVector(row.embedding);
      if (embedding && embedding.length > 0) {
        embeddings.push({
          questionId: row.question_id,
          embedding,
        });
      } else {
        console.warn(
          `Skipping question ${row.question_id}: failed to parse embedding`,
        );
      }
    }

    return embeddings;
  } catch (error) {
    console.error("=== FAILED TO RETRIEVE READY EMBEDDINGS ===");
    console.error("Error:", error);
    throw error;
  }
}

async function retrieveQuestionEmbedding(questionId) {
  const sql = `
    SELECT embedding
    FROM question_vectors
    WHERE question_id = $1
      AND status = 'ready'
      AND embedding IS NOT NULL
    LIMIT 1
  `;

  const rows = await safeExecute(sql, [questionId]);

  if (!rows || rows.length === 0) {
    return null;
  }

  return parseVector(rows[0].embedding);
}



export async function findSimilarQuestionsByText({ sourceText, threshold, k }) {
  // Normalize parameters
  const normalizedK = k || RECOMMEND_K;
  const normalizedThreshold = threshold || RECOMMEND_THRESHOLD;

  // Use RETRIEVAL_QUERY task type when searching against stored documents
  let embeddingResult;
  try {
    embeddingResult = await generateQuestionEmbedding(sourceText, {
      taskType: "RETRIEVAL_QUERY",
    });
  } catch (error) {
    console.error("=== GEMINI API ERROR DURING SEARCH ===");
    console.error("Operation: findSimilarQuestionsByText");
    console.error("Search text:", sourceText);
    console.error("Error:", error);
    console.error("======================================");
    throw new ServiceUnavailableError(
      "Failed to generate embedding for search query. Please try again later.",
    );
  }

  const queryEmbedding = embeddingResult.embedding;

  // pgvector native cosine-distance search.
  //   cosine_distance = embedding <=> query  (0 = identical, 2 = opposite)
  //   cosine_similarity = 1 - cosine_distance
  // Filter by max distance = (1 - threshold), order ascending, limit k.
  const queryVectorLiteral = `[${queryEmbedding.join(",")}]`;
  const maxDistance = 1 - normalizedThreshold;

  let topResults;
  try {
    const vectorRows = await safeExecute(
      `
      SELECT question_id, embedding <=> $1 AS distance
      FROM question_vectors
      WHERE status = 'ready'
        AND embedding IS NOT NULL
        AND embedding <=> $1 <= $2
      ORDER BY embedding <=> $1
      LIMIT $3
      `,
      [queryVectorLiteral, maxDistance, normalizedK],
    );

    topResults = vectorRows.map((row) => ({
      questionId: row.question_id,
      // Convert distance back to similarity score for the API response.
      score: 1 - Number(row.distance),
    }));
  } catch (error) {
    console.error("=== DATABASE ERROR DURING VECTOR SEARCH ===");
    console.error("Operation: findSimilarQuestionsByText");
    console.error("Search text:", sourceText);
    console.error("Error:", error);
    console.error("=============================================");
    throw error;
  }

  if (topResults.length === 0) {
    return {
      ...embeddingResult,
      similarQuestions: [],
    };
  }

  // Fetch question details using IN clause.
  // The ? placeholders here are dynamic; safeExecute converts each to $N.
  const questionIds = topResults.map((item) => item.questionId);
  const placeholders = questionIds.map(() => "?").join(", ");
  const sql = `
  SELECT
 q.question_id AS "questionId",
 q.question_hash AS "questionHash",
 q.title,
 q.content,
 q.user_id AS "userId",
 q.created_at AS "createdAt",
 q.updated_at AS "updatedAt",
 u.first_name AS "firstName",
 u.last_name AS "lastName",
 COUNT(DISTINCT a.answer_id) AS "answerCount"
FROM questions q
JOIN users u ON u.user_id = q.user_id
LEFT JOIN answers a ON a.question_id = q.question_id
WHERE q.question_id IN (${placeholders})
GROUP BY q.question_id, u.user_id
`;

  let rows;
  try {
    rows = await safeExecute(sql, questionIds);
  } catch (error) {
    console.error("=== DATABASE ERROR FETCHING SIMILAR QUESTIONS ===");
    console.error("Operation: findSimilarQuestionsByText");
    console.error("Search text:", sourceText);
    console.error("Error:", error);
    console.error("===============================================");
    throw error;
  }

  // Map results to question object
  const questionMap = {};
  rows.forEach((row) => {
    questionMap[String(row.questionId)] = {
      id: row.questionId,
      questionHash: row.questionHash,
      title: row.title,
      content: row.content,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      // PostgreSQL COUNT() returns a string; coerce to number.
      answerCount: Number(row.answerCount),
    };
  });

  // Return results with scores, preserving sort order
  const similarQuestions = topResults
    .filter((result) => questionMap[String(result.questionId)])
    .map((result) => ({
      score: Number(result.score.toFixed(6)),
      ...questionMap[String(result.questionId)],
    }));

  return {
    ...embeddingResult,
    similarQuestions,
  };
}

/**
 * Find similar questions using the pre-calculated embedding of an existing
 * question. Uses pgvector native cosine-distance search against the
 * `question_vectors` table.
 * @param {Object} params - Search parameters.
 * @param {number|string} params.questionId - The ID of the question to find similarities for.
 * @param {number} [params.threshold] - Minimum similarity score threshold.
 * @param {number} [params.k] - Maximum number of results to return.
 * @returns {Promise<Array<Object>>} A list of similar questions.
 */
export async function findSimilarQuestionsByQuestionId({
  questionId,
  threshold,
  k,
}) {
  const vectorConfig = getVectorConfig();
  const searchThreshold =
    threshold !== undefined ? threshold : vectorConfig.recommendThreshold;
  const normalizedK = k || vectorConfig.recommendK;

  // Retrieve the embedding for the specified question
  let embedding;
  try {
    embedding = await retrieveQuestionEmbedding(questionId);
  } catch (error) {
    console.error("=== DATABASE ERROR DURING EMBEDDING RETRIEVAL ===");
    console.error("Operation: findSimilarQuestionsByQuestionId");
    console.error("Question ID:", questionId);
    console.error("Error:", error);
    console.error("===============================================");
    throw error;
  }

  if (!embedding) {
    return {
      similarQuestions: [],
    };
  }

  // pgvector native cosine-distance search.
  // cosine_similarity = 1 - (embedding <=> query)
  const queryVectorLiteral = `[${embedding.join(",")}]`;
  const maxDistance = 1 - searchThreshold;

  let topResults;
  try {
    const vectorRows = await safeExecute(
      `
      SELECT question_id, embedding <=> $1 AS distance
      FROM question_vectors
      WHERE status = 'ready'
        AND embedding IS NOT NULL
        AND question_id <> $2
        AND embedding <=> $1 <= $3
      ORDER BY embedding <=> $1
      LIMIT $4
      `,
      [queryVectorLiteral, questionId, maxDistance, normalizedK],
    );

    topResults = vectorRows.map((row) => ({
      questionId: row.question_id,
      score: 1 - Number(row.distance),
    }));
  } catch (error) {
    console.error("=== DATABASE ERROR DURING VECTOR SEARCH ===");
    console.error("Operation: findSimilarQuestionsByQuestionId");
    console.error("Question ID:", questionId);
    console.error("Error:", error);
    console.error("=============================================");
    throw error;
  }

  if (topResults.length === 0) {
    return {
      similarQuestions: [],
    };
  }

  // Fetch question details using IN clause.
  // The ? placeholders here are dynamic; safeExecute converts each to $N.
  const questionIds = topResults.map((item) => item.questionId);
  const placeholders = questionIds.map(() => "?").join(", ");
  const sql = `
  SELECT
 q.question_id AS "questionId",
 q.question_hash AS "questionHash",
 q.title,
 q.content,
 q.user_id AS "userId",
 q.created_at AS "createdAt",
 q.updated_at AS "updatedAt",
 u.user_id AS "userId",
 u.first_name AS "firstName",
 u.last_name AS "lastName",
 COUNT(DISTINCT a.answer_id) AS "answerCount"
FROM questions q
JOIN users u ON u.user_id = q.user_id
LEFT JOIN answers a ON a.question_id = q.question_id
WHERE q.question_id IN (${placeholders})
GROUP BY q.question_id, u.user_id
`;

  let rows;
  try {
    rows = await safeExecute(sql, questionIds);
  } catch (error) {
    console.error("=== DATABASE ERROR FETCHING SIMILAR QUESTIONS ===");
    console.error("Operation: findSimilarQuestionsByQuestionId");
    console.error("Question ID:", questionId);
    console.error("Error:", error);
    console.error("===============================================");
    throw error;
  }

  // Map results to question object
  const questionMap = {};
  rows.forEach((row) => {
    questionMap[String(row.questionId)] = {
      id: row.questionId,
      questionHash: row.questionHash,
      title: row.title,
      content: row.content,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      // PostgreSQL COUNT() returns a string; coerce to number.
      answerCount: Number(row.answerCount),
    };
  });

  // Return results with scores, preserving sort order
  const similarQuestions = topResults.map((item) => ({
    ...questionMap[String(item.questionId)],
    score: item.score,
  }));
  return {
    similarQuestions,
  };
}
// Get current vector search configuration values from environment variables or defaults
export function getVectorConfig() {
  return {
    recommendThreshold: RECOMMEND_THRESHOLD,
    recommendK: RECOMMEND_K,
  };
}
