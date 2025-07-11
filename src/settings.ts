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