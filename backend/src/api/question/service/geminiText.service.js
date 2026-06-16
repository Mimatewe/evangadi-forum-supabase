import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  NotFoundError,
  ServiceUnavailableError,
} from "../../../utils/errors/index.js";
import { getSingleQuestionService } from "./question.service.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

const geminiTextModel = ai.getGenerativeModel({ model: GEMINI_TEXT_MODEL });

function parseJSONFromText(text) {
  if (!text || typeof text !== "string") {
    throw new Error("AI response text is empty");
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object could be extracted from AI response");
  }

  return JSON.parse(jsonMatch[0]);
}

function extractTextFromResponse(response) {
  const candidate = response?.candidates?.[0];
  if (!candidate) return "";

  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) {
    return String(candidate?.content || "").trim();
  }

  return parts
    .map((part) => part.text || "")
    .join("")
    .trim();
}

export async function generateText(prompt) {
  try {
    const result = await geminiTextModel.generateContent(prompt);

    return result.response.text();
  } catch (error) {
    console.error("=== GEMINI TEXT GENERATION ERROR ===");
    console.error(error);

    throw new ServiceUnavailableError(
      "Failed to generate text from Gemini. Please try again later.",
    );
  }
}

export async function generateQuestionDraftCoachService({ title, content }) {
  const prompt = `You are an expert programming forum coach. Review the draft question below and provide a JSON object with two fields: \n1) feedback: an array of concise observations about clarity, structure, and completeness.\n2) suggestions: an array of practical improvements to make the question stronger.\nOnly return valid JSON with those two fields.\n\nDraft question title: ${title || "(no title provided)"}\nDraft question content: ${content}\n`;

  const systemInstruction =
    "You are a helpful, concise, and structured AI coach for programming forum questions.";

  const rawResponse = await generateText(prompt, systemInstruction);

  try {
    const parsed = parseJSONFromText(rawResponse);
    return {
      feedback: Array.isArray(parsed.feedback)
        ? parsed.feedback
        : [String(parsed.feedback || "")],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : parsed.suggestions
          ? [String(parsed.suggestions)]
          : [],
    };
  } catch (error) {
    throw new ServiceUnavailableError(
      "Unable to parse draft coach response from Gemini.",
    );
  }
}

export async function assessAnswerAgainstQuestionService({
  questionHash,
  answerText,
}) {
  const { question } = await getSingleQuestionService({ questionHash });
  if (!question) {
    throw new NotFoundError("Question not found");
  }

  const prompt = `You are an expert answer evaluator for a programming forum. Given the original question and the draft answer, respond with valid JSON containing: \n- level: one of \"strong\", \"partial\", or \"weak\"\n- note: a short explanation of how well the answer fits the question.\n\nOriginal question title: ${question.title}\nOriginal question content: ${question.content}\nDraft answer: ${answerText}\n`;

  const systemInstruction =
    "Evaluate how well the answer addresses the question. Return only valid JSON with level and note.";

  const rawResponse = await generateText(prompt, systemInstruction);

  try {
    const parsed = parseJSONFromText(rawResponse);
    return {
      level: String(parsed.level || "weak").toLowerCase(),
      note: String(parsed.note || parsed.feedback || "No note returned."),
    };
  } catch (error) {
    throw new ServiceUnavailableError(
      "Unable to parse answer fit response from Gemini.",
    );
  }
}
