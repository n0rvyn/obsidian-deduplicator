/**
 * Text normalization and similarity utilities for duplicate detection
 */

/**
 * Normalize text content for canonical matching
 * Removes extra whitespace, normalizes line endings, and standardizes formatting
 * @param content The raw text content
 * @returns Normalized text content
 */
export function normalizeTextContent(content: string): string {
  return content
    // Normalize line endings to \n
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove markdown formatting characters that don't affect meaning
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/__(.*?)__/g, '$1') // Bold
    .replace(/_(.*?)_/g, '$1') // Italic
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
    .replace(/\n\s+/g, '\n') // Remove leading whitespace from lines
    .replace(/\s+\n/g, '\n') // Remove trailing whitespace from lines
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
    // Trim start and end
    .trim();
}

/**
 * Calculate Jaccard similarity between two texts
 * @param text1 First text
 * @param text2 Second text
 * @returns Similarity score between 0 and 1
 */
export function calculateJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Calculate cosine similarity between two texts using word frequency vectors
 * @param text1 First text
 * @param text2 Second text
 * @returns Similarity score between 0 and 1
 */
export function calculateCosineSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  // Create word frequency maps
  const freq1 = new Map<string, number>();
  const freq2 = new Map<string, number>();

  for (const word of words1) {
    freq1.set(word, (freq1.get(word) || 0) + 1);
  }

  for (const word of words2) {
    freq2.set(word, (freq2.get(word) || 0) + 1);
  }

  // Get all unique words
  const allWords = new Set([...freq1.keys(), ...freq2.keys()]);

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const word of allWords) {
    const f1 = freq1.get(word) || 0;
    const f2 = freq2.get(word) || 0;

    dotProduct += f1 * f2;
    magnitude1 += f1 * f1;
    magnitude2 += f2 * f2;
  }

  const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Calculate a simple similarity score based on character-level differences
 * @param text1 First text
 * @param text2 Second text
 * @returns Similarity score between 0 and 100
 */
export function calculateSimpleSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 100;
  if (text1.length === 0 && text2.length === 0) return 100;
  if (text1.length === 0 || text2.length === 0) return 0;

  const maxLength = Math.max(text1.length, text2.length);
  const distance = levenshteinDistance(text1, text2);

  return Math.max(0, (1 - distance / maxLength) * 100);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param str1 First string
 * @param str2 Second string
 * @returns Edit distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}