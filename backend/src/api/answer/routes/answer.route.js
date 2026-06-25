import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import {
  createAnswerController,
  deleteAnswerController,
  getAnswerController,
  updateAnswerController,
} from "../controller/answer.controller.js";
import {
  createAnswerValidation,
  validateAnswerIdParam,
  updateAnswerValidation,
} from "../validation/answer.validation.js";

const answerRoutes = express.Router();

answerRoutes.post(
  "/",
  authenticateUser,
  createAnswerValidation,
  createAnswerController,
);



answerRoutes.get("/myAnswer", authenticateUser, getAnswerController);

answerRoutes.delete(
  "/:answerId",
  authenticateUser,
  validateAnswerIdParam,
  deleteAnswerController,
);

answerRoutes.put(
  "/:answerId",
  authenticateUser,
  validateAnswerIdParam,
  updateAnswerValidation,
  updateAnswerController,
);
export default answerRoutes;
