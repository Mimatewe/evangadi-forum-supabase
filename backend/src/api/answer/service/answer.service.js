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
      a.question_id AS questionId,
      a.content,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt,
      u.user_id AS userId,
      u.first_name AS firstName,
      u.last_name AS lastName
    FROM answers a
    JOIN users u ON u.user_id = a.user_id
    WHERE a.answer_id = ?
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
    `SELECT question_id,user_id FROM questions WHERE question_id=? LIMIT 1`,
    [questionId],
  );
  if (rows.length === 0) {
    throw new NotFoundError("Question not found");
  }

  return rows[0];
};

export const createAnswerService = async ({ questionId, userId, content }) => {
  const question = await getQuestionOwner(questionId);
  if (question.user_id === userId) {
    throw new BadRequestError("You cannot answer your own question");
  }

  const insertSql = `INSERT INTO answers (question_id , user_id,content) VALUES (?,?,?)`;
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
      a.created_at AS createdAt,
      q.question_id AS questionId,
      q.title AS questionTitle,
      q.question_hash AS questionHash /* <-- 1. Add this line */
  FROM answers a
  JOIN questions q
      ON a.question_id = q.question_id
  WHERE a.user_id = ?
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
      "SELECT answer_id, user_id FROM answers WHERE answer_id = ?",
      [answerId],
    );
    if (answer.length === 0) {
      return { success: false, message: "Answer not found" };
    }
    if (answer[0].user_id !== userId) {
      return { success: false, message: "You can only delete your own answer" };
    }
    await safeExecute("DELETE FROM answers WHERE answer_id = ?", [answerId]);

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
      `SELECT answer_id, user_id FROM answers WHERE answer_id = ?`,
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
      `UPDATE answers SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE answer_id = ?`,
      [newContent, answerId],
    );

    return { success: true, message: "Answer updated successfully" };
  } catch (error) {
    throw error;
  }
};
