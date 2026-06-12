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
 * @param {{questionId: number, sourceText: string, embedding: number[]|any, status: string}} params
 */
export async function storeQuestionVector({
  questionId,
  sourceText,
  embedding = [],
  status = "ready",
}) {
  const sql = `
    INSERT INTO question_vectors (question_id, source_text, embedding, status)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE embedding = VALUES(embedding), status = VALUES(status), source_text = VALUES(source_text)
  `;

  const embeddingPayload = Array.isArray(embedding)
    ? JSON.stringify(embedding)
    : JSON.stringify(embedding || []);

  try {
    await safeExecute(sql, [questionId, sourceText, embeddingPayload, status]);
  } catch (error) {
    console.error("=== FAILED TO STORE QUESTION VECTOR ===");
    console.error("QuestionId:", questionId);
    console.error("Status:", status);
    console.error("Error:", error);
    throw error;
  }
}

async function retrieveReadyEmbeddings() {
  // Query question_vectors table with status='ready' filter
  const sql = `
  SELECT
    question_id,
    embedding
  FROM question_vectors
  WHERE status = ?
`;

  try {
    const rows = await safeExecute(sql, ["ready"]);

    // Parse and validate embeddings
    const embeddings = [];
    for (const row of rows) {
      try {
        // The database driver might already parse JSON columns into objects/arrays.
        // If it's already an array, use it directly; otherwise, parse it.
        const embedding =
          typeof row.embedding === "string"
            ? JSON.parse(row.embedding)
            : row.embedding;

        // Add valid embedding to results
       embeddings.push({
         questionId: row.question_id,
         embedding,
       });
    
      } catch (parseError) {
        console.warn(
          `Skipping question ${row.question_id}: failed to parse embedding JSON`,
          parseError,
        );
        continue;
      }
    }

    return embeddings;
  } catch (error) {
  console.error("=== FAILED TO STORE QUESTION VECTOR ===");
  console.error("QuestionId:", questionId);
  console.error("Status:", status);
  console.error("Error:", error);
  throw error;
}
  
}

async function retrieveQuestionEmbedding(questionId) {
  const sql = `
    SELECT embedding
    FROM question_vectors
    WHERE question_id = ?
      AND status = 'ready'
    LIMIT 1
  `;

  const rows = await safeExecute(sql, [questionId]);

  if (!rows || rows.length === 0) {
    return null;
  }

  const embedding =
    typeof rows[0].embedding === "string"
      ? JSON.parse(rows[0].embedding)
      : rows[0].embedding;

  return embedding;
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

  // Retrieve all ready embeddings from MySQL
  let storedEmbeddings;
  try {
    storedEmbeddings = await retrieveReadyEmbeddings();
  } catch (error) {
    console.error("=== DATABASE ERROR DURING SEARCH ===");
    console.error("Operation: findSimilarQuestionsByText");
    console.error("Search text:", sourceText);
    console.error("Error:", error);
    console.error("====================================");
    throw error;
  }

  // calculate cosine similarity between query embedding and stored embeddings

  const similarities = [];
  for (const stored of storedEmbeddings) {
    try {
      const score = calculateCosineSimilarity(queryEmbedding, stored.embedding);

      // Filter by threshold
      if (score >= normalizedThreshold) {
        similarities.push({
          questionId: stored.questionId,
          score: score,
        });
      }
    } catch (error) {
      console.warn(
        `Failed to calculate similarity for question ${stored.questionId}:`,
        error.message,
      );
      continue;
    }
  }

  // sort by score descending
  similarities.sort((a, b) => b.score - a.score);

  //Limit to top k results
  const topResults = similarities.slice(0, normalizedK);

  if (topResults.length === 0) {
    return {
      ...embeddingResult,
      similarQuestions: [],
    };
  }

  // Fetch question details using IN clause
  const questionIds = topResults.map((item) => item.questionId);
  const placeholders = questionIds.map(() => "?").join(", ");
  const sql = `
  SELECT
 q.question_id AS questionId,
 q.question_hash AS questionHash,
 q.title,
 q.content,
 q.user_id AS userId,
 q.created_at AS createdAt,
 q.updated_at AS updatedAt,
 u.first_name AS firstName,
 u.last_name AS lastName,
 COUNT(DISTINCT a.answer_id) AS answerCount
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

  // Map results to to question object

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
      answerCount: row.answerCount,
    };
  });

  //return results with scores, preserving sort order
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
 * Find similar questions using the pre-calculated embedding of an existing question from MySQL.
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

  // Retrieve all ready embeddings from MySQL
  let storedEmbeddings;
  try {
    storedEmbeddings = await retrieveReadyEmbeddings();
  } catch (error) {
    console.error("=== DATABASE ERROR DURING SEARCH ===");
    console.error("Operation: findSimilarQuestionsByQuestionId");
    console.error("Question ID:", questionId);
    console.error("Error:", error);
    console.error("====================================");
    throw error;
  }

  // calculate cosine similarity between query embedding and stored embeddings
  const similarities = [];
  for (const stored of storedEmbeddings) {
    try {
      const score = calculateCosineSimilarity(embedding, stored.embedding);

      // Filter by threshold
      if (score >= searchThreshold) {
        similarities.push({
          questionId: stored.questionId,
          score: score,
        });
      }
    } catch (error) {
      console.warn(
        `Failed to calculate similarity for question ${stored.questionId}:`,
        error.message,
      );
      continue;
    }
  }

  // sort by score descending
  similarities.sort((a, b) => b.score - a.score);

  //Limit to top k results
  const topResults = similarities.slice(0, normalizedK);

  if (topResults.length === 0) {
    return {
      similarQuestions: [],
    };
  }

  // Fetch question details using IN clause
  const questionIds = topResults.map((item) => item.questionId);
  const placeholders = questionIds.map(() => "?").join(", ");
  const sql = `
  SELECT
 q.question_id AS questionId,
 q.question_hash AS questionHash,
 q.title,
 q.content,
 q.user_id AS userId,
 q.created_at AS createdAt,
 q.updated_at AS updatedAt,
 u.user_id AS userId,
 u.first_name AS firstName,
 u.last_name AS lastName,
 COUNT(DISTINCT a.answer_id) AS answerCount
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
  

  // Map results to to question object

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
      answerCount: row.answerCount,
    };
  });
  

  //return results with scores, preserving sort order
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
