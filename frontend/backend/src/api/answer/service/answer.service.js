import { safeExecute } from "../../../../db/config.js";

import { BadRequestError, NotFoundError } from "../../../utils/errors/index.js";

// const mapAnswer = (row) => ({
//   id: row.id,
//   questionId: row.questionId,
//   content: row.content,
//   createdAt: row.createdAt,
//   updatedAt: row.updatedAt,
//   author: {
//     id: row.userId,
//     firstName: row.firstName,
//     lastName: row.lastName,
//   },
// });
const mapAnswer = (row) => ({
  id: row.id,
  questionId: row.questionId,
  content: row.content,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  userId: row.userId,
  firstName: row.firstName,
  lastName: row.lastName,
});

const getSingleAnswerService = async (answerId) => {
  const sql = `
    SELECT
      a.answer_id AS id,
      a.question_id AS "questionId",
      a.content,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      u.user_id AS "userId",
      u.first_name AS "firstName",
      u.last_name AS "lastName"
    FROM answers a
    JOIN users u ON u.user_id = a.user_id
    WHERE a.answer_id = $1
    LIMIT 1
  `;

  const rows = await safeExecute(sql, [answerId]);

  if (rows.length === 0) {
    throw new NotFoundError("Answer not found");
  }

  return mapAnswer(rows[0]);
};

const getQuestionOwner = async (questionId) => {
  const rows = await safeExecute(
    `SELECT question_id,user_id FROM questions WHERE question_id=$1 LIMIT 1`,
    [questionId],
  );
  if (rows.length === 0) {
    throw new NotFoundError("Question not found");
  }

  return rows[0];
};

const getAnswerWithQuestionOwner = async (answerId) => {
  const rows = await safeExecute(
    `
    SELECT
      a.answer_id AS "answerId",
      a.user_id AS "answerUserId",
      a.question_id AS "questionId",
      q.user_id AS "questionOwnerId",
      q.accepted_answer_id AS "acceptedAnswerId"
    FROM answers a
    JOIN questions q ON q.question_id = a.question_id
    WHERE a.answer_id = $1
    LIMIT 1
    `,
    [answerId],
  );

  if (rows.length === 0) {
    throw new NotFoundError("Answer not found");
  }

  return rows[0];
};

const getAnswerVoteMeta = async (answerId, userId) => {
  const rows = await safeExecute(
    `
    SELECT
      COALESCE(SUM(value), 0) AS "voteScore",
      MAX(CASE WHEN user_id = $1 THEN value ELSE NULL END) AS "currentUserVote"
    FROM answer_votes
    WHERE answer_id = $2
    `,
    [userId, answerId],
  );

  return {
    voteScore: Number(rows[0]?.voteScore || 0),
    currentUserVote: rows[0]?.currentUserVote ?? null,
  };
};

export const createAnswerService = async ({ questionId, userId, content }) => {
  const question = await getQuestionOwner(questionId);
  if (question.user_id === userId) {
    throw new BadRequestError("You cannot answer your own question");
  }

  // PostgreSQL: RETURNING answer_id replaces MySQL result.insertId.
  const insertSql = `INSERT INTO answers (question_id , user_id,content) VALUES ($1,$2,$3) RETURNING answer_id`;
  const result = await safeExecute(insertSql, [questionId, userId, content]);

  return getSingleAnswerService(result.insertId);
};

//---------------------------------------------------------------------------------------------------------------------

export const getAnswerService = async (userId) => {
  try {
    const answers = await safeExecute(
      `
  SELECT
      a.answer_id AS id,
      a.content,
      a.created_at AS "createdAt",
      q.question_id AS "questionId",
      q.title AS "questionTitle",
      q.question_hash AS "questionHash" /* <-- 1. Add this line */
  FROM answers a
  JOIN questions q
      ON a.question_id = q.question_id
  WHERE a.user_id = $1
  ORDER BY a.created_at DESC
  `,
      [userId],
    );

    const formattedData = answers.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      question: {
        id: row.questionId,
        title: row.questionTitle,
        hash: row.questionHash,
      },
    }));
    return formattedData;
  } catch (error) {
    throw error;
  }
};
// ---------------------------------------------------------------------

export const deleteAnswerService = async (answerId, userId) => {
  try {
    const answer = await safeExecute(
      "SELECT answer_id, user_id FROM answers WHERE answer_id = $1",
      [answerId],
    );
    if (answer.length === 0) {
      return { success: false, message: "Answer not found" };
    }
    if (answer[0].user_id !== userId) {
      return { success: false, message: "You can only delete your own answer" };
    }
    await safeExecute("DELETE FROM answers WHERE answer_id = $1", [answerId]);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

// ----------------------------------------------------------------

export const updateAnswerService = async (answerId, userId, newContent) => {
  try {
    // checking if the user and the answer exist
    const answer = await safeExecute(
      `SELECT answer_id, user_id FROM answers WHERE answer_id = $1`,
      [answerId],
    );
    if (answer.length === 0) {
      return {
        success: false,
        message: "Answer not found",
      };
    }
    if (answer[0].user_id !== userId) {
      return {
        success: false,
        message: "You can only edit your own answer",
      };
    }

    // update the content
    await safeExecute(
      `UPDATE answers SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE answer_id = $2`,
      [newContent, answerId],
    );

    return { success: true, message: "Answer updated successfully" };
  } catch (error) {
    throw error;
  }
};

export const voteAnswerService = async ({ answerId, userId, value }) => {
  const answer = await getAnswerWithQuestionOwner(answerId);
  if (answer.answerUserId === userId) {
    throw new BadRequestError("You cannot vote on your own answer");
  }

  // PostgreSQL: ON CONFLICT ... DO UPDATE replaces MySQL ON DUPLICATE KEY UPDATE.
  // EXCLUDED.value refers to the value proposed for insertion.
  await safeExecute(
    `
    INSERT INTO answer_votes (answer_id, user_id, value)
    VALUES ($1, $2, $3)
    ON CONFLICT (answer_id, user_id) DO UPDATE SET value = EXCLUDED.value
    `,
    [answerId, userId, value],
  );

  return getAnswerVoteMeta(answerId, userId);
};

export const clearAnswerVoteService = async ({ answerId, userId }) => {
  await getAnswerWithQuestionOwner(answerId);
  await safeExecute("DELETE FROM answer_votes WHERE answer_id = $1 AND user_id = $2", [
    answerId,
    userId,
  ]);

  return getAnswerVoteMeta(answerId, userId);
};

export const acceptAnswerService = async ({ answerId, userId }) => {
  const answer = await getAnswerWithQuestionOwner(answerId);
  if (answer.questionOwnerId !== userId) {
    throw new BadRequestError("Only the question owner can accept an answer");
  }

  await safeExecute(
    "UPDATE questions SET accepted_answer_id = $1 WHERE question_id = $2",
    [answerId, answer.questionId],
  );

  return {
    answerId,
    questionId: answer.questionId,
    acceptedAnswerId: answerId,
  };
};
