import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import {
  createAnswerController,
  deleteAnswerController,
  getAnswerController,
  updateAnswerController,
  voteAnswerController,
  clearAnswerVoteController,
  acceptAnswerController,
} from "../controller/answer.controller.js";
import {
  createAnswerValidation,
  validateAnswerIdParam,
  updateAnswerValidation,
  voteAnswerValidation,
} from "../validation/answer.validation.js";

const answerRoutes = express.Router();

answerRoutes.post(
  "/",
  authenticateUser,
  createAnswerValidation,
  createAnswerController,
);



answerRoutes.get("/myAnswer", authenticateUser, getAnswerController);

answerRoutes.put(
  "/:answerId/vote",
  authenticateUser,
  validateAnswerIdParam,
  voteAnswerValidation,
  voteAnswerController,
);

answerRoutes.delete(
  "/:answerId/vote",
  authenticateUser,
  validateAnswerIdParam,
  clearAnswerVoteController,
);

answerRoutes.put(
  "/:answerId/accept",
  authenticateUser,
  validateAnswerIdParam,
  acceptAnswerController,
);

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
