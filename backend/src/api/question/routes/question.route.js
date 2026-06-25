import express from "express";
import {
  createQuestionController,
  getSimilarQuestionsController,
  getQuestionsController,
  searchQuestionsSemanticController,
  getSingleQuestionController,
  generateQuestionDraftCoachController,
  assessAnswerAgainstQuestionController,
} from "../controller/question.controller.js";
import {
  createQuestionValidation,
  getSimilarQuestionsValidation,
  getQuestionsValidation,
  searchQuestionsSemanticValidation,
  getSingleQuestionValidation,
  generateQuestionDraftCoachValidation,
  assessAnswerAgainstQuestionValidation,
} from "../validations/question.validation.js";
import { authenticateUser } from "../../../middleware/authentication.js";

const router = express.Router();

/**
 * @route POST /api/questions
 * @desc Post a new question
 * @access Protected
 */
router.post(
  "/",
  authenticateUser,
  createQuestionValidation,
  createQuestionController,
);

/**
 * @route GET /api/questions
 * @desc Get questions with optional search filtering
 * @access Private
 */

router.get(
  "/",
  authenticateUser,
  getQuestionsValidation,
  getQuestionsController,
);

/**
 * @route GET /api/questions/search
 * @desc Search questions semantically based on text input
 * @access Private
 */
router.get(
  "/search",
  authenticateUser,
  searchQuestionsSemanticValidation,
  searchQuestionsSemanticController,
);

/**
 * @route POST /api/questions/draft-coach
 * @desc Get draft coaching feedback for a question draft
 * @access Private
 */
router.post(
  "/draft-coach",
  authenticateUser,
  generateQuestionDraftCoachValidation,
  generateQuestionDraftCoachController,
);
/**
 * @route GET /api/questions/:questionHash/similar
 * @desc Get similar questions based on a question hash
 * @access Private
 */
router.get(
  "/:questionHash/similar",
  authenticateUser,
  getSimilarQuestionsValidation,
  getSimilarQuestionsController,
);
/**
 * @route GET /api/questions/:questionHash
 * @desc Get a single question by hash
 * @access Private
 */
router.get(
  "/:questionHash",
  authenticateUser,
  getSingleQuestionValidation,
  getSingleQuestionController,
);

/**
 * @route POST /api/questions/:questionHash/answer-fit
 * @desc Evaluate whether an answer fits the original question
 * @access Private
 */
router.post(
  "/:questionHash/answer-fit",
  authenticateUser,
  assessAnswerAgainstQuestionValidation,
  assessAnswerAgainstQuestionController,
);

export default router;
