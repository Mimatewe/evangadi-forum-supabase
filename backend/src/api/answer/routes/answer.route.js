import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import {createAnswerController} from "../controller/answer.controller.js"
import {createAnswerValidation} from "../validation/answer.validation.js"

const answerRoute = express.Router();

answerRoute.post(
  "/",
  authenticateUser,
  createAnswerValidation,createAnswerController,
);

export default answerRoute;