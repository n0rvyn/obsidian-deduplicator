import { TFile } from "obsidian";

/**
 * Checks if a file should be ignored based on path patterns and size limits
 * @param file The file to check
 * @param ignorePaths Array of path patterns to ignore
 * @param sizeCapMB Maximum file size in MB
 * @returns true if the file should be ignored
 */
export function shouldIgnoreFile(file: TFile, ignorePaths: string[], sizeCapMB: number): boolean {
  // Check if file path matches any ignore pattern
  if (ignorePaths.some(path => file.path.startsWith(path))) {
    return true;
  }

  // Check file size limit
  if (file.stat.size > sizeCapMB * 1024 * 1024) {
    return true;
  }

  return false;
}

/**
 * Validates file path patterns
 * @param patterns Array of path patterns to validate
 * @returns Array of valid patterns
 */
export function validateIgnorePatterns(patterns: string[]): string[] {
  return patterns
    .filter(pattern => pattern.trim().length > 0)
    .map(pattern => pattern.trim());
}