import { StatusCodes } from "http-status-codes";
import {
  createQuestionWithVectorService,
  getSimilarQuestionsService,
  getQuestionsService,
  searchQuestionsSemanticService,
  getSingleQuestionService,
} from "../service/question.service.js";
import {
  generateQuestionDraftCoachService,
  assessAnswerAgainstQuestionService,
} from "../service/geminiText.service.js";

/**
 * Handles creating a new question.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next function.
 * @returns {Promise<void>}
 */
export const createQuestionController = async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const result = await createQuestionWithVectorService({
      userId: req.user.id,
      title,
      content,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Question posted successfully.",
      data: result.question,
    });
  } catch (error) {
    next(error);
  }
};

export const getQuestionsController = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      mine: req.query.mine,
      userId: req.user.id,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };

    const result = await getQuestionsService(filters);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Questions fetched successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const searchQuestionsSemanticController = async (req, res, next) => {
  try {
    const result = await searchQuestionsSemanticService({
      query: req.query.query,
      k: req.query.k ? Number(req.query.k) : 5,
      threshold:
        req.query.threshold !== undefined
          ? Number(req.query.threshold)
          : undefined,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Semantic search completed successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getSimilarQuestionsController = async (req, res, next) => {
  try {
    const result = await getSimilarQuestionsService({
      questionHash: req.params.questionHash,
      k: req.query.k ? Number(req.query.k) : 5,
      threshold:
        req.query.threshold !== undefined
          ? Number(req.query.threshold)
          : undefined,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Similar questions fetched successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getSingleQuestionController = async (req, res, next) => {
  try {
    const result = await getSingleQuestionService({
      questionHash: req.params.questionHash,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Question fetched successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const generateQuestionDraftCoachController = async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const data = await generateQuestionDraftCoachService({ title, content });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Draft suggestions generated",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const assessAnswerAgainstQuestionController = async (req, res, next) => {
  try {
    const { questionHash } = req.params;
    const { answerText } = req.body;
    const data = await assessAnswerAgainstQuestionService({
      questionHash,
      answerText,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Answer fit assessed",
      data,
    });
  } catch (error) {
    next(error);
  }
};
