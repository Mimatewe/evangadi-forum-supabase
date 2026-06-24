import { StatusCodes } from "http-status-codes";

import {
  createAnswerService,
  getAnswerService,
  deleteAnswerService,
  updateAnswerService,
} from "../service/answer.service.js";

// -------------------
export const createAnswerController = async (req, res, next) => {
  try {
    const { questionId, content } = req.body;
    const answer = await createAnswerService({
      questionId,
      content,
      userId: req.user.id,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Answer posted successfully ",
      data: answer,
    });
  } catch (err) {
    next(err);
  }
};

// --------------------
export const getAnswerController = async (req, res, next) => {
  const userId = req.user.id;
  try {
    const result = await getAnswerService(userId);
    return res.status(200).json({
      success: true,
      message: "Answer Fetched",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ----------------------
export const deleteAnswerController = async (req, res, next) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.id;
    const result = await deleteAnswerService(answerId, userId);
    if (!result.success) {
      if (result.message === "Answer not found") {
        return res.status(404).json({
          success: false,
          message: result.message,
        });
      }

      if (result.message === "You can only delete your own answer") {
        return res.status(404).json({
          success: false,
          message: result.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Answer deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};


// ---------------------------
export const updateAnswerController = async (req, res, next) => {
  try {
    const { answerId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    const result = await updateAnswerService(answerId, userId, content);
    // to send err
    if (!result.success) {
      if (
        result.message === "Answer not found" ||
        result.message === "You can only edit your own answer"
      ) {
        return res.status(404).json({
          success: false,
          message: result.message,
        });
      }
    }
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
