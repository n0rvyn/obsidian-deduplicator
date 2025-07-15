import { Plugin, Notice } from "obsidian";
import { DeduplicatorSettings, DEFAULT_SETTINGS, VIEW_TYPE_DUPLICATE } from "./types";
import { DuplicateRegistry } from "./services/duplicateRegistry";
import { DuplicateScanner } from "./services/duplicateScanner";
import { SemanticSimilarityService } from "./services/semanticSimilarity";
import { DuplicateView } from "./components/duplicateView";
import { DeduplicatorSettingTab } from "./components/settingsTab";

/**
 * Main plugin class for the Obsidian Deduplicator plugin
 */
class DeduplicatorPlugin extends Plugin {
  settings!: DeduplicatorSettings;
  private registry!: DuplicateRegistry;

  async onload(): Promise<void> {
    console.log("Loading Deduplicator plugin");

    try {
      await this.loadSettings();

      // Initialize registry with saved data
      const savedData = await this.loadData();
      const savedRegistry = savedData?.registry ?? {};
      this.registry = new DuplicateRegistry(savedRegistry);

      // Register settings tab
      this.addSettingTab(new DeduplicatorSettingTab(this.app, this));

      // Register commands
      this.addCommand({
        id: "scan-duplicates",
        name: "Scan vault for duplicate notes",
        callback: () => this.scanDuplicates()
      });

      this.addCommand({
        id: "show-duplicates",
        name: "Show duplicates view",
        callback: () => this.showDuplicatesView()
      });

      this.addCommand({
        id: "clear-cache",
        name: "Clear duplicate cache",
        callback: () => this.clearCache()
      });

      this.addCommand({
        id: "clear-similarity-cache",
        name: "Clear similarity cache",
        callback: () => this.clearSimilarityCache()
      });

      this.addCommand({
        id: "test-llm-connection",
        name: "Test LLM connection",
        callback: () => this.testLLMConnection()
      });

      // Register view
      this.registerView(VIEW_TYPE_DUPLICATE, (leaf) => new DuplicateView(leaf, this));

      // Open duplicates view on plugin load
      this.app.workspace.onLayoutReady(() => {
        this.showDuplicatesView();
      });

      console.log("Deduplicator plugin loaded successfully");
    } catch (error) {
      console.error("Error loading Deduplicator plugin:", error);
      new Notice("Failed to load Deduplicator plugin. Check console for details.");
    }
  }

  async onunload(): Promise<void> {
    console.log("Unloading Deduplicator plugin");
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Show the duplicates view
   */
  async showDuplicatesView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_DUPLICATE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_DUPLICATE, active: true });
      } else {
        console.error("Could not create new leaf for duplicates view");
        return;
      }
    }

    workspace.revealLeaf(leaf);
  }

  /**
   * Clear the duplicate cache
   */
  async clearCache(): Promise<void> {
    try {
      this.registry.clear();
      await this.saveData({
        registry: {},
        settings: this.settings
      });
      new Notice("Duplicate cache cleared successfully");
    } catch (error) {
      console.error("Error clearing cache:", error);
      new Notice("Error clearing cache. Check console for details.");
    }
  }

  /**
   * Clear the similarity cache
   */
  async clearSimilarityCache(): Promise<void> {
    try {
      const scanner = new DuplicateScanner(this.app, this.settings, this.registry);
      scanner.clearSimilarityCache();
      new Notice("Similarity cache cleared successfully");
    } catch (error) {
      console.error("Error clearing similarity cache:", error);
      new Notice("Error clearing similarity cache. Check console for details.");
    }
  }

  /**
   * Test LLM connection for semantic similarity
   */
  async testLLMConnection(): Promise<void> {
    if (!this.settings.enableLLM) {
      new Notice("LLM is not enabled. Please enable it in settings first.");
      return;
    }

    if (!this.settings.apiKey) {
      new Notice("API key is required for LLM testing. Please configure it in settings.");
      return;
    }

    try {
      new Notice("Testing LLM connection...");
      const semanticService = new SemanticSimilarityService(this.settings);
      const isWorking = await semanticService.testSemanticSimilarity();

      if (isWorking) {
        new Notice("✅ LLM connection test successful! Semantic similarity is working.");
      } else {
        new Notice("❌ LLM connection test failed. Check your API key and settings.");
      }
    } catch (error) {
      console.error("LLM test error:", error);
      new Notice(`❌ LLM test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Scan vault for duplicate files
   */
  async scanDuplicates(): Promise<void> {
    try {
      // Show initial notice based on scan type
      const scanTypeMessage = this.getScanTypeMessage();
      new Notice(scanTypeMessage);

      const scanner = new DuplicateScanner(this.app, this.settings, this.registry);
      const groups = await scanner.scan();

      // Update view with results
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DUPLICATE);
      if (leaves.length > 0) {
        const view = leaves[0].view as DuplicateView;
        view.setGroups(groups);
      }

      // Save registry data
      await this.saveData({
        registry: this.registry.getAll(),
        settings: this.settings
      });

      // Show results with detailed stats
      const stats = scanner.getStats();
      const message = this.getResultsMessage(groups, stats);
      new Notice(message);

      // Show view if duplicates were found
      if (groups.length > 0) {
        this.showDuplicatesView();
      }
    } catch (error) {
      console.error("Error scanning duplicates:", error);
      new Notice("Error scanning duplicates. Check console for details.");
    }
  }

  /**
   * Get scan type message based on current settings
   * @returns Descriptive message about the scan type
   */
  private getScanTypeMessage(): string {
    switch (this.settings.duplicateType) {
      case "exact":
        return "Starting exact duplicate scan (binary content matching)...";
      case "canonical":
        return "Starting canonical duplicate scan (ignoring whitespace and formatting)...";
      case "near":
        const llmStatus = this.settings.enableLLM ? "with LLM enhancement" : "using traditional algorithms";
        return `Starting near duplicate scan ${llmStatus} (${this.settings.similarityThreshold}% threshold)...`;
      default:
        return "Starting duplicate scan...";
    }
  }

  /**
   * Get results message with detailed statistics
   * @param groups Found duplicate groups
   * @param stats Scanner statistics
   * @returns Detailed results message
   */
  private getResultsMessage(groups: any[], stats: any): string {
    if (groups.length === 0) {
      return `No duplicates found. Scanned ${stats.totalFiles} files.`;
    }

    const totalFiles = groups.reduce((sum, group) => sum + group.files.length, 0);
    const matchType = this.settings.duplicateType;
    const cacheInfo = stats.cacheSize > 0 ? ` (${stats.cacheSize} cached comparisons)` : "";

    let message = `Found ${groups.length} ${matchType} duplicate groups with ${totalFiles} total files`;

    if (matchType === "near") {
      const avgSimilarity = groups
        .filter(g => g.similarityScore)
        .reduce((sum, g) => sum + g.similarityScore, 0) / groups.length;

      if (avgSimilarity) {
        message += ` (avg similarity: ${avgSimilarity.toFixed(1)}%)`;
      }
    }

    return message + cacheInfo;
  }
}

export default DeduplicatorPlugin;