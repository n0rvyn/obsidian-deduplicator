import { TFile } from "obsidian";

export interface FileMeta {
  mtime: number;
  size: number;
  hash: string;
}

export type HashMap = Record<string, FileMeta & { path: string }>;

export class DuplicateRegistry {
  private map: HashMap = {};

  constructor(initial?: HashMap) {
    if (initial) this.map = initial;
  }

  getAll(): HashMap {
    return this.map;
  }

  get(path: string): FileMeta | undefined {
    return this.map[path];
  }

  set(path: string, meta: FileMeta): void {
    this.map[path] = { ...meta, path };
  }

  remove(path: string): void {
    delete this.map[path];
  }
}