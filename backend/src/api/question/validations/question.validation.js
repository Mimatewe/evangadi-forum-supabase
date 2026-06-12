import { body, param, query } from "express-validator";
import { validationErrorHandler } from "../../../middleware/validation-handler.js";

const questionHashValidator = param("questionHash")
  .notEmpty()
  .withMessage("questionHash is required")
  .isString()
  .withMessage("questionHash must be a string")
  .isLength({ min: 16, max: 16 })
  .withMessage("questionHash must be 16 characters")
  .matches(/^[a-f0-9]{16}$/)
  .withMessage("questionHash must be a lowercase hexadecimal string");

export const createQuestionValidation = [
  body("title")
    .notEmpty()
    .withMessage("Question title is required")
    .isString()
    .withMessage("Question title must be a string")
    .isLength({ min: 5, max: 255 })
    .withMessage("Question title must be between 5 and 255 characters")
    .trim(),
  body("content")
    .notEmpty()
    .withMessage("Question content is required")
    .isString()
    .withMessage("Question content must be a string")
    .isLength({ min: 10 })
    .withMessage("Question content must be at least 10 characters")
    .trim(),
  validationErrorHandler,
];

export const getQuestionsValidation = [
  query("search")
    .optional()
    .isString()
    .withMessage("Search must be a string")
    .trim(),
  query("mine")
    .optional()
    .isBoolean()
    .withMessage("Mine must be a boolean")
    .toBoolean(),
  validationErrorHandler,
];

export const searchQuestionsSemanticValidation = [
  query("query")
    .notEmpty()
    .withMessage("Query is required")
    .isString()
    .withMessage("Query must be a string")
    .isLength({ min: 5 })
    .withMessage("Query must be at least 5 characters")
    .trim(),
  query("k")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("k must be an integer between 1 and 20")
    .toInt(),
  query("threshold")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("threshold must be a number between 0 and 1")
    .toFloat(),
  validationErrorHandler,
];

export const getSimilarQuestionsValidation = [
  questionHashValidator,
  query("k")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("k must be an integer between 1 and 20")
    .toInt(),
  query("threshold")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("threshold must be a number between 0 and 1")
    .toFloat(),
  validationErrorHandler,
];

export const getSingleQuestionValidation = [
  questionHashValidator,
  validationErrorHandler,
];

export const generateQuestionDraftCoachValidation = [
  body("title")
    .optional()
    .isString()
    .withMessage("Title must be a string")
    .trim(),
  body("content")
    .notEmpty()
    .withMessage("Question draft content is required")
    .isString()
    .withMessage("Question draft content must be a string")
    .isLength({ min: 10 })
    .withMessage("Question draft content must be at least 10 characters")
    .trim(),
  validationErrorHandler,
];

export const assessAnswerAgainstQuestionValidation = [
  questionHashValidator,
  body("answerText")
    .notEmpty()
    .withMessage("Answer text is required")
    .isString()
    .withMessage("Answer text must be a string")
    .isLength({ min: 20 })
    .withMessage("Answer text must be at least 20 characters")
    .trim(),
  validationErrorHandler,
];
