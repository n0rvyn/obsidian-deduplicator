import { App, TFile, Notice } from "obsidian";
import { DeduplicatorSettings, DuplicateGroup, FileMeta, SimilarityResult } from "../types";
import { DuplicateRegistry } from "./duplicateRegistry";
import { SemanticSimilarityService } from "./semanticSimilarity";
import { sha256 } from "../utils/crypto";
import { shouldIgnoreFile } from "../utils/fileUtils";
import { normalizeTextContent, calculateJaccardSimilarity, calculateCosineSimilarity, calculateSimpleSimilarity } from "../utils/textUtils";

/**
 * Scanner for detecting duplicate files in the vault
 */
export class DuplicateScanner {
  private app: App;
  private settings: DeduplicatorSettings;
  private registry: DuplicateRegistry;
  private semanticService?: SemanticSimilarityService;
  private similarityCache: Map<string, number> = new Map();
  private static readonly BATCH_SIZE = 20; // Process files in batches to avoid UI blocking
  private static readonly MAX_COMPARISONS = 10000; // Limit comparisons for very large vaults

  constructor(app: App, settings: DeduplicatorSettings, registry: DuplicateRegistry) {
    this.app = app;
    this.settings = settings;
    this.registry = registry;

    // Initialize semantic similarity service if LLM is enabled for near matching
    if (settings.duplicateType === "near" && settings.enableLLM) {
      this.semanticService = new SemanticSimilarityService(settings);
    }
  }

  /**
   * Scan the vault for duplicate files
   * @returns Array of duplicate groups
   */
  async scan(): Promise<DuplicateGroup[]> {
    try {
      const files = this.app.vault.getMarkdownFiles();

      // Filter out ignored files
      const validFiles = files.filter(file =>
        !shouldIgnoreFile(file, this.settings.ignorePaths, this.settings.sizeCapMB)
      );

      // Sort by size for better performance (larger files first for early exact matches)
      validFiles.sort((a, b) => b.stat.size - a.stat.size);

      if (this.settings.duplicateType === "near") {
        return await this.scanNearDuplicates(validFiles);
      } else {
        return await this.scanExactDuplicates(validFiles);
      }
    } catch (error) {
      console.error("Error during duplicate scan:", error);
      throw new Error("Failed to scan for duplicates");
    }
  }

  /**
   * Scan for exact or canonical duplicates using hash-based grouping
   * @param files Files to scan
   * @returns Array of duplicate groups
   */
  private async scanExactDuplicates(files: TFile[]): Promise<DuplicateGroup[]> {
    const groups: Map<string, TFile[]> = new Map();
    const progressNotice = new Notice("Scanning for duplicates...", 0);

    let processed = 0;
    const total = files.length;

    // Process files in batches to avoid blocking UI
    for (let i = 0; i < files.length; i += DuplicateScanner.BATCH_SIZE) {
      const batch = files.slice(i, i + DuplicateScanner.BATCH_SIZE);

      await Promise.all(batch.map(async (file) => {
        try {
          const meta = await this.processFile(file);
          const hashKey = this.getHashKey(meta);

          if (!groups.has(hashKey)) {
            groups.set(hashKey, []);
          }
          groups.get(hashKey)!.push(file);

          processed++;
          progressNotice.setMessage(`Scanning for duplicates... ${processed}/${total}`);
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
          // Continue processing other files
        }
      }));

      // Allow UI to update between batches
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    progressNotice.hide();

    const duplicates: DuplicateGroup[] = [];
    for (const [hash, groupFiles] of groups) {
      if (groupFiles.length > 1) {
        duplicates.push({
          hash,
          files: groupFiles,
          matchType: this.settings.duplicateType
        });
      }
    }

    return duplicates;
  }

  /**
   * Scan for near duplicates using similarity comparison
   * @param files Files to scan
   * @returns Array of duplicate groups
   */
  private async scanNearDuplicates(files: TFile[]): Promise<DuplicateGroup[]> {
    const progressNotice = new Notice("Scanning for near duplicates...", 0);
    const similarities: SimilarityResult[] = [];

    // Limit files for performance if vault is very large
    const maxFiles = Math.min(files.length, 500); // Limit to 500 files max
    const limitedFiles = files.slice(0, maxFiles);

    if (files.length > maxFiles) {
      new Notice(`Large vault detected. Limiting scan to ${maxFiles} largest files for performance.`);
    }

    // Process all files to get their content
    const fileContents: Map<string, string> = new Map();
    const fileVectors: Map<string, number[]> = new Map();

    let processed = 0;
    const total = limitedFiles.length;

    // First pass: read all file contents in batches
    for (let i = 0; i < limitedFiles.length; i += DuplicateScanner.BATCH_SIZE) {
      const batch = limitedFiles.slice(i, i + DuplicateScanner.BATCH_SIZE);

      await Promise.all(batch.map(async (file) => {
        try {
          const content = await this.app.vault.read(file);
          fileContents.set(file.path, content);

          // Generate embeddings if LLM is enabled (but limit to avoid excessive API calls)
          if (this.semanticService && processed < 100) {
            try {
              const vector = await this.semanticService.generateEmbeddings(content);
              fileVectors.set(file.path, vector);
            } catch (error) {
              console.warn(`Failed to generate embeddings for ${file.path}:`, error);
            }
          }

          processed++;
          progressNotice.setMessage(`Reading files... ${processed}/${total}`);
        } catch (error) {
          console.error(`Error reading file ${file.path}:`, error);
        }
      }));

      // Allow UI to update between batches
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // Second pass: compare file pairs with smart limiting
    let comparisons = 0;
    const maxComparisons = Math.min(
      (limitedFiles.length * (limitedFiles.length - 1)) / 2,
      DuplicateScanner.MAX_COMPARISONS
    );

    // Use a more efficient comparison strategy for large sets
    const comparisonPairs = this.generateOptimalComparisonPairs(limitedFiles, maxComparisons);

    for (const { file1, file2 } of comparisonPairs) {
      const content1 = fileContents.get(file1.path);
      const content2 = fileContents.get(file2.path);

      if (!content1 || !content2) continue;

      try {
        const similarity = await this.calculateSimilarity(
          content1, content2, file1, file2, fileVectors
        );

        if (similarity.score >= this.settings.similarityThreshold) {
          similarities.push(similarity);
        }

        comparisons++;
        if (comparisons % 50 === 0) {
          progressNotice.setMessage(`Comparing files... ${comparisons}/${maxComparisons}`);
          // Allow UI to update periodically
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      } catch (error) {
        console.error(`Error comparing ${file1.path} and ${file2.path}:`, error);
      }
    }

    progressNotice.hide();

    // Group similar files together
    return this.groupSimilarFiles(similarities);
  }

  /**
   * Generate optimal comparison pairs for large file sets
   * @param files Files to compare
   * @param maxComparisons Maximum number of comparisons to perform
   * @returns Array of file pairs to compare
   */
  private generateOptimalComparisonPairs(files: TFile[], maxComparisons: number): Array<{file1: TFile, file2: TFile}> {
    const pairs: Array<{file1: TFile, file2: TFile}> = [];

    // If we can do all comparisons, do them
    const totalPossible = (files.length * (files.length - 1)) / 2;
    if (totalPossible <= maxComparisons) {
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          pairs.push({ file1: files[i], file2: files[j] });
        }
      }
      return pairs;
    }

    // For large sets, use a sampling strategy
    // Compare each file with its most likely candidates (similar size, recent files)
    const maxPerFile = Math.floor(maxComparisons / files.length);

    for (let i = 0; i < files.length && pairs.length < maxComparisons; i++) {
      const file1 = files[i];
      const candidates = files
        .slice(i + 1)
        .sort((a, b) => {
          // Prioritize files with similar size and recent modification times
          const sizeDiff1 = Math.abs(a.stat.size - file1.stat.size);
          const sizeDiff2 = Math.abs(b.stat.size - file1.stat.size);
          return sizeDiff1 - sizeDiff2;
        })
        .slice(0, maxPerFile);

      for (const file2 of candidates) {
        pairs.push({ file1, file2 });
        if (pairs.length >= maxComparisons) break;
      }
    }

    return pairs;
  }

  /**
   * Calculate similarity between two file contents using various methods
   * @param content1 First file content
   * @param content2 Second file content
   * @param file1 First file
   * @param file2 Second file
   * @param fileVectors Map of file paths to embedding vectors
   * @returns Similarity result
   */
  private async calculateSimilarity(
    content1: string,
    content2: string,
    file1: TFile,
    file2: TFile,
    fileVectors: Map<string, number[]>
  ): Promise<SimilarityResult> {
    // Create cache key for this pair
    const cacheKey = [file1.path, file2.path].sort().join('|');

    // Check cache first
    const cachedScore = this.similarityCache.get(cacheKey);
    if (cachedScore !== undefined) {
      return {
        file1,
        file2,
        score: cachedScore,
        method: "cached" as any
      };
    }

    // Quick size-based filtering
    if (Math.abs(content1.length - content2.length) / Math.max(content1.length, content2.length) > 0.5) {
      // If files differ significantly in size, they're likely not similar
      const score = 0;
      this.similarityCache.set(cacheKey, score);
      return {
        file1,
        file2,
        score,
        method: "size_filter" as any
      };
    }

    // Try LLM-based semantic similarity first if available
    if (this.semanticService) {
      try {
        const llmScore = await this.semanticService.calculateSemanticSimilarity(content1, content2);
        this.similarityCache.set(cacheKey, llmScore);

        if (llmScore >= this.settings.similarityThreshold) {
          return {
            file1,
            file2,
            score: llmScore,
            method: "llm"
          };
        }
      } catch (error) {
        console.warn("LLM similarity failed, falling back to traditional methods:", error);
      }

      // Try vector similarity if embeddings are available
      const vector1 = fileVectors.get(file1.path);
      const vector2 = fileVectors.get(file2.path);
      if (vector1 && vector2) {
        const vectorScore = this.semanticService.calculateVectorSimilarity(vector1, vector2);
        this.similarityCache.set(cacheKey, vectorScore);

        if (vectorScore >= this.settings.similarityThreshold) {
          return {
            file1,
            file2,
            score: vectorScore,
            method: "llm"
          };
        }
      }
    }

    // Fall back to traditional similarity methods
    const jaccardScore = calculateJaccardSimilarity(content1, content2) * 100;
    const cosineScore = calculateCosineSimilarity(content1, content2) * 100;
    const simpleScore = calculateSimpleSimilarity(content1, content2);

    // Use the highest score among traditional methods
    const scores = [
      { score: jaccardScore, method: "jaccard" as const },
      { score: cosineScore, method: "cosine" as const },
      { score: simpleScore, method: "simple" as const }
    ];

    const bestMethod = scores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    // Cache the result
    this.similarityCache.set(cacheKey, bestMethod.score);

    return {
      file1,
      file2,
      score: bestMethod.score,
      method: bestMethod.method
    };
  }

  /**
   * Group similar files into duplicate groups
   * @param similarities Array of similarity results
   * @returns Array of duplicate groups
   */
  private groupSimilarFiles(similarities: SimilarityResult[]): DuplicateGroup[] {
    const groups: Map<string, Set<TFile>> = new Map();
    const fileToGroup: Map<string, string> = new Map();

    // Build groups using union-find like algorithm
    for (const similarity of similarities) {
      const path1 = similarity.file1.path;
      const path2 = similarity.file2.path;

      const group1 = fileToGroup.get(path1);
      const group2 = fileToGroup.get(path2);

      if (!group1 && !group2) {
        // Create new group
        const groupId = `group_${groups.size}`;
        const group = new Set([similarity.file1, similarity.file2]);
        groups.set(groupId, group);
        fileToGroup.set(path1, groupId);
        fileToGroup.set(path2, groupId);
      } else if (group1 && !group2) {
        // Add file2 to existing group1
        groups.get(group1)!.add(similarity.file2);
        fileToGroup.set(path2, group1);
      } else if (!group1 && group2) {
        // Add file1 to existing group2
        groups.get(group2)!.add(similarity.file1);
        fileToGroup.set(path1, group2);
      } else if (group1 !== group2) {
        // Merge two different groups
        const files1 = groups.get(group1!)!;
        const files2 = groups.get(group2!)!;

        for (const file of files2) {
          files1.add(file);
          fileToGroup.set(file.path, group1!);
        }
        groups.delete(group2!);
      }
    }

    // Convert to DuplicateGroup format
    const duplicateGroups: DuplicateGroup[] = [];
    let groupIndex = 0;

    for (const [groupId, files] of groups) {
      if (files.size > 1) {
        // Calculate average similarity for this group
        const groupSimilarities = similarities.filter(sim =>
          files.has(sim.file1) && files.has(sim.file2)
        );
        const avgSimilarity = groupSimilarities.length > 0
          ? groupSimilarities.reduce((sum, sim) => sum + sim.score, 0) / groupSimilarities.length
          : this.settings.similarityThreshold;

        duplicateGroups.push({
          hash: `near_${groupIndex++}`,
          files: Array.from(files),
          matchType: "near",
          similarityScore: avgSimilarity
        });
      }
    }

    return duplicateGroups;
  }

  /**
   * Clear similarity cache
   */
  clearSimilarityCache(): void {
    this.similarityCache.clear();
  }

  /**
   * Get the appropriate hash key for grouping based on match type
   * @param meta File metadata
   * @returns Hash key for grouping
   */
  private getHashKey(meta: FileMeta): string {
    switch (this.settings.duplicateType) {
      case "canonical":
        return meta.normalizedHash || meta.hash;
      case "exact":
      default:
        return meta.hash;
    }
  }

  /**
   * Process a single file to get or compute its metadata
   * @param file The file to process
   * @returns Promise that resolves to file metadata
   */
  private async processFile(file: TFile): Promise<FileMeta> {
    if (!file || !file.path) {
      throw new Error("Invalid file provided");
    }

    const cached = this.registry.get(file.path);
    if (cached &&
        cached.mtime === file.stat.mtime &&
        cached.size === file.stat.size &&
        cached.matchType === this.settings.duplicateType) {
      return cached;
    }

    try {
      // Always compute the exact binary hash for caching purposes
      const data = await this.app.vault.adapter.readBinary(file.path);
      const exactHash = await sha256(data);

      const meta: FileMeta = {
        mtime: file.stat.mtime,
        size: file.stat.size,
        hash: exactHash,
        matchType: this.settings.duplicateType,
        contentHash: exactHash
      };

      // For canonical matching, also compute normalized hash
      if (this.settings.duplicateType === "canonical") {
        try {
          const textContent = await this.app.vault.read(file);
          const normalizedContent = normalizeTextContent(textContent);
          const normalizedBuffer = new TextEncoder().encode(normalizedContent);
          meta.normalizedHash = await sha256(normalizedBuffer);
        } catch (error) {
          console.warn(`Could not read text content for ${file.path}, falling back to binary hash:`, error);
          meta.normalizedHash = exactHash;
        }
      }

      this.registry.set(file.path, meta);
      return meta;
    } catch (error) {
      console.error(`Error reading file ${file.path}:`, error);
      throw new Error(`Failed to process file: ${file.path}`);
    }
  }

  /**
   * Get scan statistics
   * @returns Object with scan statistics
   */
  getStats(): { registrySize: number; totalFiles: number; cacheSize: number } {
    return {
      registrySize: this.registry.size(),
      totalFiles: this.app.vault.getMarkdownFiles().length,
      cacheSize: this.similarityCache.size
    };
  }
}