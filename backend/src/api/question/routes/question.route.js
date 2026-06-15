

import express from "express";
import { authenticateUser } from "../../../middleware/authentication.js";
import {
  getQuestionsController,
  getSingleQuestionController,
} from "../controller/question.controller.js";

const router = express.Router();

router.get("/", authenticateUser, getQuestionsController);

router.get("/:questionHash", authenticateUser, getSingleQuestionController);

export default router;
