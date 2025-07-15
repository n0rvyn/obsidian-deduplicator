import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { DeduplicatorSettings } from "../types";

/**
 * Settings tab for the Deduplicator plugin
 */
export class DeduplicatorSettingTab extends PluginSettingTab {
  plugin: Plugin & {
    settings: DeduplicatorSettings;
    saveSettings(): Promise<void>;
  };

  constructor(app: App, plugin: Plugin & { settings: DeduplicatorSettings; saveSettings(): Promise<void> }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Deduplicator Settings" });

    this.addDuplicateDetectionSettings();
    this.addFileProcessingSettings();
    this.addActionSettings();
    this.addLLMSettings();
  }

  /**
   * Add duplicate detection settings
   */
  private addDuplicateDetectionSettings(): void {
    const { containerEl } = this;

    containerEl.createEl("h3", { text: "Duplicate Detection" });

    new Setting(containerEl)
      .setName("Detection type")
      .setDesc("How to detect duplicates")
      .addDropdown(dropdown => dropdown
        .addOption("exact", "Exact match (fastest)")
        .addOption("canonical", "Canonical match (ignores whitespace)")
        .addOption("near", "Near match (uses similarity threshold)")
        .setValue(this.plugin.settings.duplicateType)
        .onChange(async (value: any) => {
          this.plugin.settings.duplicateType = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide similarity threshold
        }));

    if (this.plugin.settings.duplicateType === "near") {
      new Setting(containerEl)
        .setName("Similarity threshold")
        .setDesc("Minimum similarity percentage for near duplicate detection")
        .addSlider(slider => slider
          .setLimits(50, 100, 1)
          .setValue(this.plugin.settings.similarityThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.similarityThreshold = value;
            await this.plugin.saveSettings();
          }));
    }
  }

  /**
   * Add file processing settings
   */
  private addFileProcessingSettings(): void {
    const { containerEl } = this;

    containerEl.createEl("h3", { text: "File Processing" });

    new Setting(containerEl)
      .setName("Ignore paths")
      .setDesc("File paths to ignore during scanning (one per line)")
      .addTextArea(text => text
        .setPlaceholder("templates/\narchive/\n_attachments/")
        .setValue(this.plugin.settings.ignorePaths.join("\n"))
        .onChange(async (value) => {
          this.plugin.settings.ignorePaths = value
            .split("\n")
            .map(path => path.trim())
            .filter(path => path.length > 0);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Size limit")
      .setDesc("Maximum file size to scan (in MB)")
      .addSlider(slider => slider
        .setLimits(1, 100, 1)
        .setValue(this.plugin.settings.sizeCapMB)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.sizeCapMB = value;
          await this.plugin.saveSettings();
        }));
  }

  /**
   * Add action settings
   */
  private addActionSettings(): void {
    const { containerEl } = this;

    containerEl.createEl("h3", { text: "Actions" });

    new Setting(containerEl)
      .setName("Default action")
      .setDesc("What to do with duplicates by default")
      .addDropdown(dropdown => dropdown
        .addOption("tag", "Tag duplicates")
        .addOption("trash", "Move to trash")
        .addOption("none", "No action (manual only)")
        .setValue(this.plugin.settings.action)
        .onChange(async (value: any) => {
          this.plugin.settings.action = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Confirm before delete")
      .setDesc("Show confirmation dialog before deleting duplicates")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.confirmBeforeDelete)
        .onChange(async (value) => {
          this.plugin.settings.confirmBeforeDelete = value;
          await this.plugin.saveSettings();
        }));
  }

  /**
   * Add LLM integration settings
   */
  private addLLMSettings(): void {
    const { containerEl } = this;

    containerEl.createEl("h3", { text: "LLM Integration" });
    containerEl.createEl("p", {
      text: "Use AI to analyze content similarity for better duplicate detection",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Enable LLM")
      .setDesc("Use AI for advanced duplicate detection")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableLLM)
        .onChange(async (value) => {
          this.plugin.settings.enableLLM = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide LLM settings
        }));

    if (this.plugin.settings.enableLLM) {
      this.addLLMProviderSettings();
    }
  }

  /**
   * Add LLM provider settings
   */
  private addLLMProviderSettings(): void {
    const { containerEl } = this;

    new Setting(containerEl)
      .setName("LLM Provider")
      .setDesc("Choose your AI provider")
      .addDropdown(dropdown => dropdown
        .addOption("openai", "OpenAI")
        .addOption("azure", "Azure OpenAI")
        .addOption("zhipu", "Zhipu AI")
        .addOption("qwen", "Qwen")
        .addOption("custom", "Custom endpoint")
        .setValue(this.plugin.settings.llmProvider)
        .onChange(async (value: any) => {
          this.plugin.settings.llmProvider = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide endpoint field
        }));

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Your LLM API key")
      .addText(text => text
        .setPlaceholder("sk-...")
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    if (this.plugin.settings.llmProvider === "azure" || this.plugin.settings.llmProvider === "custom") {
      new Setting(containerEl)
        .setName("Endpoint")
        .setDesc("API endpoint URL")
        .addText(text => text
          .setPlaceholder("https://your-endpoint.com/v1/chat/completions")
          .setValue(this.plugin.settings.endpoint)
          .onChange(async (value) => {
            this.plugin.settings.endpoint = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Controls randomness in AI responses (0.0-2.0)")
      .addSlider(slider => slider
        .setLimits(0, 2, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        }));

    // Add test connection button
    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Test your LLM configuration")
      .addButton(button => button
        .setButtonText("Test")
        .setCta()
        .onClick(async () => {
          await this.testLLMConnection(button);
        }));
  }

  /**
   * Test LLM connection
   * @param button The button element
   */
  private async testLLMConnection(button: any): Promise<void> {
    const originalText = button.buttonEl.textContent;
    button.setButtonText("Testing...");
    button.setDisabled(true);

    try {
      // Import LLMService dynamically to avoid circular dependency
      const { LLMService } = await import("../services/llmService");
      const llmService = new LLMService(this.plugin.settings);

      const success = await llmService.testConnection();

      if (success) {
        button.setButtonText("✓ Success");
        button.buttonEl.style.backgroundColor = "var(--color-green)";
      } else {
        button.setButtonText("✗ Failed");
        button.buttonEl.style.backgroundColor = "var(--color-red)";
      }
    } catch (error) {
      console.error("LLM test failed:", error);
      button.setButtonText("✗ Error");
      button.buttonEl.style.backgroundColor = "var(--color-red)";
    }

    // Reset button after 3 seconds
    setTimeout(() => {
      button.setButtonText(originalText);
      button.setDisabled(false);
      button.buttonEl.style.backgroundColor = "";
    }, 3000);
  }
}