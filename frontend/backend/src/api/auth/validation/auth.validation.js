import { body } from "express-validator";

import { validationErrorHandler } from "../../../middleware/validation-handler.js";

export const registerValidation = [
  body("firstName")
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 3 }),

  body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 3 }),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  validationErrorHandler,
];

export const loginValidation = [
  body("email").notEmpty().withMessage("Email is required").isEmail(),

  body("password").notEmpty().withMessage("Password is required"),

  validationErrorHandler,
];
