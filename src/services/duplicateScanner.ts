import { App, TFile, Notice } from "obsidian";
import { DeduplicatorSettings, DuplicateGroup, FileMeta } from "../types";
import { DuplicateRegistry } from "./duplicateRegistry";
import { sha256 } from "../utils/crypto";
import { shouldIgnoreFile } from "../utils/fileUtils";

/**
 * Scanner for detecting duplicate files in the vault
 */
export class DuplicateScanner {
  private app: App;
  private settings: DeduplicatorSettings;
  private registry: DuplicateRegistry;

  constructor(app: App, settings: DeduplicatorSettings, registry: DuplicateRegistry) {
    this.app = app;
    this.settings = settings;
    this.registry = registry;
  }

  /**
   * Scan the vault for duplicate files
   * @returns Array of duplicate groups
   */
  async scan(): Promise<DuplicateGroup[]> {
    try {
      const files = this.app.vault.getMarkdownFiles();
      const groups: Map<string, TFile[]> = new Map();
      const progressNotice = new Notice("Scanning for duplicates...", 0);

      let processed = 0;
      const total = files.length;

      for (const file of files) {
        try {
          if (shouldIgnoreFile(file, this.settings.ignorePaths, this.settings.sizeCapMB)) {
            continue;
          }

          const meta = await this.processFile(file);
          if (!groups.has(meta.hash)) {
            groups.set(meta.hash, []);
          }
          groups.get(meta.hash)!.push(file);

          processed++;
          progressNotice.setMessage(`Scanning for duplicates... ${processed}/${total}`);
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
          // Continue processing other files
        }
      }

      progressNotice.hide();

      const duplicates: DuplicateGroup[] = [];
      for (const [hash, groupFiles] of groups) {
        if (groupFiles.length > 1) {
          duplicates.push({ hash, files: groupFiles });
        }
      }

      return duplicates;
    } catch (error) {
      console.error("Error during duplicate scan:", error);
      throw new Error("Failed to scan for duplicates");
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
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
      return cached;
    }

    try {
      const data = await this.app.vault.adapter.readBinary(file.path);
      const hash = await sha256(data);
      const meta: FileMeta = {
        mtime: file.stat.mtime,
        size: file.stat.size,
        hash
      };

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
  getStats(): { registrySize: number; totalFiles: number } {
    return {
      registrySize: this.registry.size(),
      totalFiles: this.app.vault.getMarkdownFiles().length
    };
  }
}