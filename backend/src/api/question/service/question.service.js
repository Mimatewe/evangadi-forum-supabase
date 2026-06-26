import crypto from "crypto";
import { safeExecute } from "../../../../db/config.js";
import { BadRequestError, NotFoundError } from "../../../utils/errors/index.js";
import {
  findSimilarQuestionsByText,
  generateQuestionEmbedding,
  getVectorConfig,
  isGeminiApiKeyInvalidError,
  normalizeQuestionText,
  storeQuestionVector,
} from "./vector.service.js";

const generateQuestionHash = () => crypto.randomBytes(8).toString("hex");

const normalizeTagName = (tag) =>
  String(tag || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/\s+/g, "-");

const normalizeTags = (tags = []) => {
  if (!Array.isArray(tags)) return [];

  return [...new Set(tags.map(normalizeTagName))]
    .filter((tag) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(tag))
    .slice(0, 5);
};

const attachTagsToQuestion = async (questionId, tags = []) => {
  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length === 0) return [];

  for (const tagName of normalizedTags) {
    await safeExecute("INSERT IGNORE INTO tags (name) VALUES (?)", [tagName]);

    const tagRows = await safeExecute(
      "SELECT tag_id AS tagId FROM tags WHERE name = ? LIMIT 1",
      [tagName],
    );
    const tagId = tagRows[0]?.tagId;

    console.log("TAG SAVE:", { tagName, tagId, questionId });

    if (!tagId) {
      throw new BadRequestError(`Could not save tag: ${tagName}`);
    }

    await safeExecute(
      "INSERT IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)",
      [questionId, tagId],
    );
  }

  return normalizedTags;
};

const getTagsForQuestions = async (questionIds = []) => {
  if (questionIds.length === 0) return new Map();

  const placeholders = questionIds.map(() => "?").join(",");
  const rows = await safeExecute(
    `
    SELECT qt.question_id AS questionId, t.name
    FROM question_tags qt
    JOIN tags t ON t.tag_id = qt.tag_id
    WHERE qt.question_id IN (${placeholders})
    ORDER BY t.name ASC
    `,
    questionIds,
  );

  const tagsByQuestion = new Map(questionIds.map((id) => [id, []]));
  rows.forEach((row) => {
    tagsByQuestion.get(row.questionId)?.push(row.name);
  });

  return tagsByQuestion;
};

/**
 * Creates a new question and stores its vector embedding for semantic search.
 * @param {Object} payload - The question data
 * @param {string} payload.userId - ID of the user creating the question
 * @param {string} payload.title - Title of the question
 * @param {string} payload.content - Content/body of the question
 * @returns {Promise<Object>} Object containing the created question
 */
export const createQuestionWithVectorService = async (payload) => {
  // Extract required fields from the payload
  const { userId, title, content, tags = [] } = payload;

  // Prepare the SQL statement for inserting a new question
  const insertQuestionSql =
    "INSERT INTO questions (question_hash, user_id, title, content) VALUES (?, ?, ?, ?);";

  // Generate a unique hash for the question
  const questionHash = generateQuestionHash();
  let questionResult;

  try {
    // Execute the insertion query safely
    questionResult = await safeExecute(insertQuestionSql, [
      questionHash,
      userId,
      title,
      content,
    ]);
  } catch (error) {
    // Handle specific foreign key constraint error for non-existent user
    if (error?.code === "ER_NO_REFERENCED_ROW_2") {
      throw new BadRequestError("User does not exist.");
    }
    // Re-throw any other unexpected errors
    throw error;
  }

  // Retrieve the auto-generated ID of the newly inserted question
  const questionId = questionResult.insertId;
  console.log("QUESTION ID:", questionId);

  // Construct the result object representing the created question
  const creationResult = {
    id: questionId,
    questionHash,
    title,
    content,
    userId,
    tags: await attachTagsToQuestion(questionId, tags),
  };

  // Normalize the question text (e.g., title) to prepare it for vector embedding
  const sourceText = normalizeQuestionText({
    title: payload.title,
  });
  try {
    // Generate the vector embedding for the normalized question text
    const embeddingResult = await generateQuestionEmbedding(sourceText, {
      questionId: creationResult.id,
    });

    // Store the generated vector embedding in the database with a 'ready' status
    await storeQuestionVector({
      questionId: creationResult.id,
      sourceText,
      embedding: embeddingResult.embedding,
      status: "ready",
    });
  } catch (error) {
    const authFailure = isGeminiApiKeyInvalidError(error);
    const message = authFailure
      ? "Gemini API key invalid or unauthorized. Question saved without semantic vector."
      : "Failed to generate question embedding. Question saved without semantic vector.";

    console.warn(
      `=== VECTOR FALLBACK ===\nQuestion ID: ${creationResult.id}\n${message}\nError: ${error?.message || error}`,
    );

    await storeQuestionVector({
      questionId: creationResult.id,
      sourceText,
      embedding: [],
      status: "failed",
    }).catch((e) => console.error("Failed to save failed vector status", e));
  }
  return { question: creationResult };
};

const buildQuestionFilters = (filters) => {
  const conditions = [];
  const params = [];

  if (filters.search) {
    conditions.push("(q.title LIKE ? OR q.content LIKE ?)");
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (filters.mine && filters.userId) {
    conditions.push("q.user_id = ?");
    params.push(filters.userId);
  }

  if (filters.tag) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM question_tags qt
        JOIN tags t ON t.tag_id = qt.tag_id
        WHERE qt.question_id = q.question_id AND t.name = ?
      )
    `);
    params.push(normalizeTagName(filters.tag));
  }

  if (conditions.length === 0) {
    return { whereClause: "", params };
  }

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    params,
  };
};
export const getQuestionsService = async (filters) => {
  const normalizedLimit = Math.min(filters.limit || 100, 100); // Cap at 100
  const normalizedOffset = filters.offset || 0;
  const sortColumn = "q.created_at";
  const normalizedSortOrder = "DESC";

  const { whereClause, params } = buildQuestionFilters(filters);

  // Get total count for pagination metadata
  const countSql = `
    SELECT COUNT(DISTINCT q.question_id) AS totalCount
    FROM questions q
    JOIN users u ON u.user_id = q.user_id
    ${whereClause}
  `;

  const countRows = await safeExecute(countSql, params);
  const totalCount = countRows[0]?.totalCount || 0;

  // Get paginated results
  const listSql = `
    SELECT
        q.question_id AS id,
        q.question_hash AS questionHash,
        q.title,
        q.content,
        q.accepted_answer_id AS acceptedAnswerId,
        q.created_at AS createdAt,
        q.updated_at AS updatedAt,
        u.user_id AS userId,
        u.first_name AS firstName,
        u.last_name AS lastName,
        COUNT(DISTINCT a.answer_id) AS answerCount
    FROM questions q
    JOIN users u ON u.user_id = q.user_id
    LEFT JOIN answers a ON a.question_id = q.question_id
    ${whereClause}
    GROUP BY q.question_id, u.user_id
    ORDER BY ${sortColumn} ${normalizedSortOrder}
    LIMIT ? OFFSET ?
  `;

  const rows = await safeExecute(listSql, [
    ...params,
    normalizedLimit,
    normalizedOffset,
  ]);

  const tagsByQuestion = await getTagsForQuestions(rows.map((row) => row.id));

  return {
    data: rows.map((question) => ({
      id: question.id,
      questionHash: question.questionHash,
      title: question.title,
      content: question.content,
      tags: tagsByQuestion.get(question.id) || [],
      acceptedAnswerId: question.acceptedAnswerId,
      answerCount: question.answerCount,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,

      author: {
        id: question.userId,
        firstName: question.firstName,
        lastName: question.lastName,
      },
    })),

    meta: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      total: totalCount,
      sortBy: "newest",
      sortOrder: "desc",
    },
  };
};
export const getSingleQuestionService = async ({ questionHash, currentUserId }) => {
  const sql = `
        SELECT
            q.question_id AS id,
            q.question_hash AS questionHash,
            q.title,
            q.content,
            q.accepted_answer_id AS acceptedAnswerId,
            q.created_at AS createdAt,
            q.updated_at AS updatedAt,
            u.user_id AS userId,
            u.first_name AS firstName,
            u.last_name AS lastName,
            COUNT(DISTINCT a.answer_id) AS answerCount
        FROM questions q
        JOIN users u ON u.user_id = q.user_id
        LEFT JOIN answers a ON a.question_id = q.question_id
        WHERE q.question_hash = ?
        GROUP BY q.question_id, u.user_id
        LIMIT 1
    `;

  const rows = await safeExecute(sql, [questionHash]);
  if (!rows || rows.length === 0) {
    throw new NotFoundError("Question not found");
  }

  const row = rows[0];

  // NEW: fetch the actual answers for this question
  const tagsByQuestion = await getTagsForQuestions([row.id]);

  const answerRows = await safeExecute(
    `
    SELECT
      a.answer_id AS id,
      a.question_id AS questionId,
      a.content,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt,
      u.user_id AS userId,
      u.first_name AS firstName,
      u.last_name AS lastName,
      COALESCE(SUM(av.value), 0) AS voteScore,
      MAX(CASE WHEN av.user_id = ? THEN av.value ELSE NULL END) AS currentUserVote
    FROM answers a
    JOIN users u ON u.user_id = a.user_id
    LEFT JOIN answer_votes av ON av.answer_id = a.answer_id
    WHERE a.question_id = ?
    GROUP BY a.answer_id, u.user_id
    ORDER BY
      CASE WHEN a.answer_id = ? THEN 0 ELSE 1 END,
      voteScore DESC,
      a.created_at ASC
    `,
    [currentUserId || 0, row.id, row.acceptedAnswerId || 0],
  );

  return {
    question: {
      id: row.id,
      questionHash: row.questionHash,
      title: row.title,
      content: row.content,
      tags: tagsByQuestion.get(row.id) || [],
      acceptedAnswerId: row.acceptedAnswerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      answerCount: row.answerCount,
      answers: answerRows, // NEW
    },
  };
};

/**
 * Performs semantic search on questions using vector similarity.
 * @param {Object} params - Search parameters
 * @param {string} params.query - The search query text
 * @param {number} [params.k=5] - Maximum number of similar questions to return
 * @param {number} [params.threshold] - Similarity threshold (uses config default if not provided)
 * @returns {Promise<Object>} Object containing similar questions and search metadata
 */

export const searchQuestionsSemanticService = async ({
  query,
  k = 5,
  threshold,
}) => {
  const sourceText = normalizeQuestionText({ title: query });
  const vectorConfig = getVectorConfig();
  const searchThreshold =
    threshold !== undefined ? threshold : vectorConfig.recommendThreshold;

  const result = await findSimilarQuestionsByText({
    sourceText,
    threshold: searchThreshold,
    k,
  });

  return {
    data: result.similarQuestions,
    meta: {
      query,
      k,
      threshold: searchThreshold,
      total: result.similarQuestions.length,
    },
  };
};

export const getSimilarQuestionsService = async ({
  questionHash,
  k = 5,
  threshold,
}) => {
  const vectorConfig = getVectorConfig();
  const searchThreshold =
    threshold !== undefined ? threshold : vectorConfig.recommendThreshold;
  // Retrieve the question to use its title for embedding
  const { question } = await getSingleQuestionService({ questionHash });
  const sourceText = normalizeQuestionText({ title: question.title });

  let result;
  try {
    result = await findSimilarQuestionsByText({
      sourceText,
      threshold: searchThreshold,
      k,
    });
  } catch (error) {
    if (error?.statusCode === 503) {
      console.warn(
        "Similar questions unavailable. Returning an empty related list.",
        error?.message || error,
      );

      return {
        data: [],
        meta: {
          questionHash,
          k,
          threshold: searchThreshold,
          total: 0,
          vectorSearchAvailable: false,
        },
      };
    }

    throw error;
  }

  // Exclude the original question from results if present
  const filtered = result.similarQuestions.filter((q) => q.id !== question.id);

  return {
    data: filtered,
    meta: {
      questionHash,
      k,
      threshold: searchThreshold,
      total: filtered.length,
    },
  };
};
