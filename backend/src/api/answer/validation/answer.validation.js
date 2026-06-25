import { body, param } from "express-validator";
import { validationErrorHandler } from "../../../middleware/validation-handler.js";

export const createAnswerValidation = [
  body("questionId")
    .notEmpty()
    .withMessage("Question Id is required")
    .isInt({ min: 1 })
    .withMessage("Question id must be a positive integer")
    .toInt(),
  body("content")
    .notEmpty()
    .withMessage("Answer content is required")
    .isString()
    .withMessage("Answer content must be a string")
    .isLength({ min: 20 })
    .withMessage("Answer content must be at least 20 characters")
    .trim(),
  validationErrorHandler,
];

export const validateAnswerIdParam = [
  param("answerId")
    .notEmpty()
    .withMessage("answer id parameter is requried")
    .isInt()
    .withMessage("answer id must be an integer"),
];

export const updateAnswerValidation = [
  body("content")
    .notEmpty()
    .withMessage("Answer content is required")
    .isString()
    .withMessage("Answer content must be a string")
    .isLength({ min: 20 })
    .withMessage("Answer content must be at least 20 characters")
    .trim(),
  validationErrorHandler,
];
