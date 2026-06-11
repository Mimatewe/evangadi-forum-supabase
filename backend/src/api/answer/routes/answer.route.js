import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import { createAnswerController } from "../controller/answer.controller.js";
import { createAnswerValidation } from "../validation/answer.validation.js";

const answersRoutes = express.Router();

answersRoutes.post(
  "/",
  authenticateUser,
  createAnswerValidation,
  createAnswerController,
);

export default answersRoutes;
