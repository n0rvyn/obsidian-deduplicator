import { TFile } from "obsidian";
import { FileMeta, HashMap } from "../types";

/**
 * Registry for managing file metadata and tracking duplicates
 */
export class DuplicateRegistry {
  private map: HashMap = {};

  constructor(initial?: HashMap) {
    if (initial) {
      this.map = this.validateHashMap(initial);
    }
  }

  /**
   * Get all entries in the registry
   * @returns The complete HashMap
   */
  getAll(): HashMap {
    return { ...this.map };
  }

  /**
   * Get metadata for a specific file path
   * @param path The file path to look up
   * @returns FileMeta if found, undefined otherwise
   */
  get(path: string): FileMeta | undefined {
    if (!path || typeof path !== "string") {
      console.warn("Invalid path provided to registry.get()");
      return undefined;
    }
    return this.map[path];
  }

  /**
   * Set metadata for a file path
   * @param path The file path
   * @param meta The file metadata
   */
  set(path: string, meta: FileMeta): void {
    if (!path || typeof path !== "string") {
      console.warn("Invalid path provided to registry.set()");
      return;
    }

    if (!this.isValidFileMeta(meta)) {
      console.warn("Invalid metadata provided to registry.set()");
      return;
    }

    this.map[path] = { ...meta, path };
  }

  /**
   * Remove an entry from the registry
   * @param path The file path to remove
   */
  remove(path: string): void {
    if (!path || typeof path !== "string") {
      console.warn("Invalid path provided to registry.remove()");
      return;
    }
    delete this.map[path];
  }

  /**
   * Clear all entries from the registry
   */
  clear(): void {
    this.map = {};
  }

  /**
   * Get the number of entries in the registry
   * @returns Number of entries
   */
  size(): number {
    return Object.keys(this.map).length;
  }

  /**
   * Validate a HashMap structure
   * @param hashMap The HashMap to validate
   * @returns Validated HashMap
   */
  private validateHashMap(hashMap: HashMap): HashMap {
    const validatedMap: HashMap = {};

    for (const [path, entry] of Object.entries(hashMap)) {
      if (typeof path === "string" && this.isValidFileMeta(entry)) {
        validatedMap[path] = entry;
      } else {
        console.warn(`Invalid registry entry for path: ${path}`);
      }
    }

    return validatedMap;
  }

  /**
   * Check if an object is valid FileMeta
   * @param meta The object to validate
   * @returns true if valid FileMeta
   */
  private isValidFileMeta(meta: any): meta is FileMeta {
    return meta &&
      typeof meta.mtime === "number" &&
      typeof meta.size === "number" &&
      typeof meta.hash === "string" &&
      meta.hash.length > 0;
  }
}