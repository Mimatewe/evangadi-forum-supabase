

import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
// import {
//   getQuestionsController,
//   getSingleQuestionController,
// } from "../controller/question.controller.js";

import {
  createQuestionController,
  getQuestionsController,
  getSingleQuestionController,
  generateQuestionDraftCoachController,
} from "../controller/question.controller.js";


const router = express.Router();

router.post("/", authenticateUser, createQuestionController);

router.post(
  "/draft-coach",
  authenticateUser,
  generateQuestionDraftCoachController,
);

router.get("/", authenticateUser, getQuestionsController);

router.get("/:questionHash", authenticateUser, getSingleQuestionController);


export default router;
