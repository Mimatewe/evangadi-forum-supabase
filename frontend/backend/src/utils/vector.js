import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

// Initialize the Google Gen AI client.
// It automatically detects the GEMINI_API_KEY environment variable.
const ai = new GoogleGenAI();

/**
 * Generates a high-dimensional vector array using Google Gen AI embedding models.
 * @param {string} text - Combined forum post context (title + content).
 * @returns {Promise<number[]>} High-density numerical embedding vector array.
 */
export const generateEmbedding = async (text) => {
  try {
    // Sanitize the input content
    const sanitizedText = text.replace(/\n/g, " ").trim();

    // Call the structured embedContent API
    const response = await ai.models.embedContent({
      model: "text-embedding-004", // Google's robust, latest text embedding model
      contents: sanitizedText,
    });

    // The SDK returns coordinates inside the values block of the embedding object
    const embeddingVector = response.embedding.values;

    return embeddingVector; // Yields a dense numerical array (typically 768 dimensions)
  } catch (error) {
    console.error("Error generating vector with @google/genai:", error.message);
    throw new Error("Google Gen AI Embedding generation failed.");
  }
};
