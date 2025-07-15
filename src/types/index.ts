import { TFile } from "obsidian";

// Settings interfaces
export interface DeduplicatorSettings {
  duplicateType: "exact" | "canonical" | "near";
  similarityThreshold: number;
  ignorePaths: string[];
  sizeCapMB: number;
  action: "tag" | "trash" | "none";
  confirmBeforeDelete: boolean;
  enableLLM: boolean;
  llmProvider: "openai" | "azure" | "zhipu" | "qwen" | "custom";
  apiKey: string;
  endpoint: string;
  temperature: number;
}

// File metadata interfaces
export interface FileMeta {
  mtime: number;
  size: number;
  hash: string;
}

export type HashMap = Record<string, FileMeta & { path: string }>;

// Duplicate detection interfaces
export interface DuplicateGroup {
  hash: string;
  files: TFile[];
}

// LLM interfaces
export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
}

// Constants
export const DEFAULT_SETTINGS: DeduplicatorSettings = {
  duplicateType: "exact",
  similarityThreshold: 80,
  ignorePaths: [],
  sizeCapMB: 5,
  action: "tag",
  confirmBeforeDelete: true,
  enableLLM: false,
  llmProvider: "openai",
  apiKey: "",
  endpoint: "",
  temperature: 0.7
};

export const VIEW_TYPE_DUPLICATE = "deduplicator-view";