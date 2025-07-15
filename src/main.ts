import { Plugin, Notice } from "obsidian";
import { DeduplicatorSettings, DEFAULT_SETTINGS, VIEW_TYPE_DUPLICATE } from "./types";
import { DuplicateRegistry } from "./services/duplicateRegistry";
import { DuplicateScanner } from "./services/duplicateScanner";
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

    try {
      // Save registry data before unloading
      await this.saveData({ registry: this.registry.getAll() });
    } catch (error) {
      console.error("Error saving data on unload:", error);
    }
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    try {
      const loadedData = await this.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData?.settings || {});
    } catch (error) {
      console.error("Error loading settings:", error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    try {
      const currentData = await this.loadData() || {};
      await this.saveData({
        ...currentData,
        settings: this.settings
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      new Notice("Failed to save settings");
    }
  }

  /**
   * Scan vault for duplicate files
   */
  async scanDuplicates(): Promise<void> {
    try {
      new Notice("Starting duplicate scan...");

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

      // Show results
      const message = groups.length > 0
        ? `Found ${groups.length} duplicate groups with ${groups.reduce((sum, group) => sum + group.files.length, 0)} total files`
        : "No duplicates found";

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
   * Show or focus the duplicates view
   */
  async showDuplicatesView(): Promise<void> {
    try {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DUPLICATE);

      if (existing.length > 0) {
        // Focus existing view
        this.app.workspace.revealLeaf(existing[0]);
      } else {
        // Create new view
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
          await leaf.setViewState({ type: VIEW_TYPE_DUPLICATE });
        }
      }
    } catch (error) {
      console.error("Error showing duplicates view:", error);
      new Notice("Error opening duplicates view");
    }
  }

  /**
   * Clear the duplicate cache
   */
  async clearCache(): Promise<void> {
    try {
      this.registry.clear();
      await this.saveData({
        registry: this.registry.getAll(),
        settings: this.settings
      });

      new Notice("Duplicate cache cleared");
    } catch (error) {
      console.error("Error clearing cache:", error);
      new Notice("Error clearing cache");
    }
  }

  /**
   * Get plugin statistics
   */
  getStats(): { registrySize: number; settingsValid: boolean } {
    return {
      registrySize: this.registry.size(),
      settingsValid: this.settings !== undefined
    };
  }
}

export default DeduplicatorPlugin;