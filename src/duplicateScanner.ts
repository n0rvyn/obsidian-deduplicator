import { App, TFile } from "obsidian";
import { DeduplicatorSettings } from "./settings";
import { DuplicateRegistry, FileMeta } from "./duplicateRegistry";

export interface DuplicateGroup {
  hash: string;
  files: TFile[];
}

export class DuplicateScanner {
  private app: App;
  private settings: DeduplicatorSettings;
  private registry: DuplicateRegistry;

  constructor(app: App, settings: DeduplicatorSettings, registry: DuplicateRegistry) {
    this.app = app;
    this.settings = settings;
    this.registry = registry;
  }

  async scan(): Promise<DuplicateGroup[]> {
    const files = this.app.vault.getMarkdownFiles();
    const groups: Map<string, TFile[]> = new Map();

    for (const file of files) {
      if (this.shouldIgnore(file)) continue;
      const meta = await this.processFile(file);
      if (!groups.has(meta.hash)) groups.set(meta.hash, []);
      groups.get(meta.hash)!.push(file);
    }

    const duplicates: DuplicateGroup[] = [];
    for (const [hash, groupFiles] of groups) {
      if (groupFiles.length > 1) duplicates.push({ hash, files: groupFiles });
    }
    return duplicates;
  }

  private shouldIgnore(file: TFile): boolean {
    const { ignorePaths, sizeCapMB } = this.settings;
    if (ignorePaths.some(path => file.path.startsWith(path))) return true;
    if (file.stat.size > sizeCapMB * 1024 * 1024) return true;
    return false;
  }

  private async processFile(file: TFile): Promise<FileMeta> {
    const cached = this.registry.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
      return cached;
    }
    const data = await this.app.vault.adapter.readBinary(file.path);
    const hash = await this.sha256(data);
    const meta: FileMeta = { mtime: file.stat.mtime, size: file.stat.size, hash };
    this.registry.set(file.path, meta);
    return meta;
  }

  private async sha256(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
}