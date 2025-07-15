import { LLMService } from "./llmService";
import { DeduplicatorSettings, LLMRequest, SimilarityResult } from "../types";
import { TFile } from "obsidian";

/**
 * Service for computing semantic similarity using LLM
 */
export class SemanticSimilarityService {
  private llmService: LLMService;
  private settings: DeduplicatorSettings;

  constructor(settings: DeduplicatorSettings) {
    this.settings = settings;
    this.llmService = new LLMService(settings);
  }

  /**
   * Calculate semantic similarity between two texts using LLM
   * @param text1 First text content
   * @param text2 Second text content
   * @returns Promise that resolves to similarity score (0-100)
   */
  async calculateSemanticSimilarity(text1: string, text2: string): Promise<number> {
    if (!this.settings.enableLLM) {
      throw new Error("LLM is not enabled for semantic similarity");
    }

    try {
      const request: LLMRequest = {
        systemPrompt: `You are a text similarity analyzer. Your task is to compare two texts and determine their semantic similarity.

Instructions:
1. Analyze the semantic meaning and content of both texts
2. Ignore formatting differences (markdown, spacing, etc.)
3. Focus on conceptual similarity, not exact word matching
4. Return ONLY a number between 0 and 100, where:
   - 0 = completely different topics/meanings
   - 50 = somewhat related topics
   - 80 = very similar content with minor differences
   - 95+ = essentially the same content with different wording
   - 100 = identical meaning

Do not include any explanation, just return the numerical score.`,

        userPrompt: `Compare these two texts for semantic similarity:

TEXT 1:
${text1.substring(0, 2000)}${text1.length > 2000 ? '...' : ''}

TEXT 2:
${text2.substring(0, 2000)}${text2.length > 2000 ? '...' : ''}

Similarity score (0-100):`
      };

      const response = await this.llmService.call(request);
      const score = this.parseScoreFromResponse(response);

      return Math.min(100, Math.max(0, score));
    } catch (error) {
      console.error("Error calculating semantic similarity:", error);
      throw new Error(`Semantic similarity calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Generate semantic embeddings for a text (simplified approach)
   * @param text Text content
   * @returns Promise that resolves to similarity vector
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    if (!this.settings.enableLLM) {
      throw new Error("LLM is not enabled for embeddings generation");
    }

    try {
      const request: LLMRequest = {
        systemPrompt: `You are a text analysis system that generates semantic feature vectors.

Analyze the given text and rate it on these 10 semantic dimensions (scale 0-10):
1. Technical/Scientific content
2. Personal/Emotional content
3. Instructional/How-to content
4. Narrative/Story content
5. Analytical/Critical content
6. Creative/Artistic content
7. Business/Professional content
8. Academic/Research content
9. Casual/Conversational tone
10. Formal/Official tone

Return ONLY 10 numbers separated by commas, no explanations.`,

        userPrompt: `Analyze this text:

${text.substring(0, 1500)}${text.length > 1500 ? '...' : ''}

Semantic vector (10 numbers, 0-10 scale):`
      };

      const response = await this.llmService.call(request);
      return this.parseVectorFromResponse(response);
    } catch (error) {
      console.error("Error generating embeddings:", error);
      // Return a default vector if LLM fails
      return new Array(10).fill(5);
    }
  }

  /**
   * Calculate similarity between two embedding vectors
   * @param vector1 First embedding vector
   * @param vector2 Second embedding vector
   * @returns Similarity score (0-100)
   */
  calculateVectorSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error("Vectors must have the same length");
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }

    const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    const similarity = magnitude === 0 ? 0 : dotProduct / magnitude;

    // Convert to percentage (0-100)
    return Math.max(0, similarity * 100);
  }

  /**
   * Parse numeric score from LLM response
   * @param response LLM response text
   * @returns Parsed score
   */
  private parseScoreFromResponse(response: string): number {
    // Try to extract a number from the response
    const numberMatch = response.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numberMatch) {
      return parseFloat(numberMatch[1]);
    }

    // Fallback: look for percentage patterns
    const percentMatch = response.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      return parseFloat(percentMatch[1]);
    }

    // Default to 50 if no number found
    console.warn("Could not parse similarity score from LLM response:", response);
    return 50;
  }

  /**
   * Parse embedding vector from LLM response
   * @param response LLM response text
   * @returns Parsed vector
   */
  private parseVectorFromResponse(response: string): number[] {
    try {
      // Extract numbers from comma-separated response
      const numbers = response
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(s => /^\d+(\.\d+)?$/.test(s))
        .map(s => parseFloat(s))
        .slice(0, 10); // Take only first 10 numbers

      // Pad with 5s if we don't have enough numbers
      while (numbers.length < 10) {
        numbers.push(5);
      }

      return numbers;
    } catch (error) {
      console.warn("Could not parse embedding vector from LLM response:", response);
      return new Array(10).fill(5);
    }
  }

  /**
   * Test LLM connection for semantic similarity
   * @returns Promise that resolves to true if working
   */
  async testSemanticSimilarity(): Promise<boolean> {
    try {
      const score = await this.calculateSemanticSimilarity(
        "The quick brown fox jumps over the lazy dog.",
        "A fast brown fox leaps above a sleepy dog."
      );
      return score > 70 && score <= 100; // Should be high similarity
    } catch (error) {
      console.error("Semantic similarity test failed:", error);
      return false;
    }
  }
}