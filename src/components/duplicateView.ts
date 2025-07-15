import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, App, Plugin } from "obsidian";
import { DuplicateGroup, VIEW_TYPE_DUPLICATE, DeduplicatorSettings } from "../types";

/**
 * View for displaying duplicate file groups
 */
export class DuplicateView extends ItemView {
  private groups: DuplicateGroup[] = [];
  private plugin: Plugin & { settings: DeduplicatorSettings };
  // Manual selection state
  private manualSelectionGroups: Set<string> = new Set();
  private selectedFiles: Map<string, Set<string>> = new Map();
  // Track expanded groups
  private expandedGroups: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: Plugin & { settings: DeduplicatorSettings }) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DUPLICATE;
  }

  getDisplayText(): string {
    return "Duplicates";
  }

  getIcon(): string {
    return "files";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Set the duplicate groups to display
   * @param groups Array of duplicate groups
   */
  setGroups(groups: DuplicateGroup[]): void {
    this.groups = groups || [];
    this.render();
  }

  /**
   * Get the current duplicate groups
   * @returns Array of duplicate groups
   */
  getGroups(): DuplicateGroup[] {
    return [...this.groups];
  }

  /**
   * Render the view content
   */
  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();

    // Add title
    const header = container.createEl("div", { cls: "duplicate-view-header" });
    header.createEl("h2", { text: "Duplicate Files" });

    if (this.groups.length === 0) {
      const emptyState = container.createEl("div", { cls: "duplicate-view-empty" });
      emptyState.createEl("p", { text: "No duplicates found." });
      emptyState.createEl("p", {
        text: "Use the 'Scan vault for duplicate notes' command to search for duplicates.",
        cls: "text-muted"
      });
      return;
    }

    // Add summary
    const summary = container.createEl("div", { cls: "duplicate-view-summary" });
    const totalFiles = this.groups.reduce((sum, group) => sum + group.files.length, 0);
    summary.createEl("p", {
      text: `Found ${this.groups.length} duplicate groups with ${totalFiles} total files.`,
      cls: "text-muted"
    });

    // Add groups
    const groupsContainer = container.createEl("div", { cls: "duplicate-groups" });

    for (const group of this.groups) {
      this.renderGroup(groupsContainer, group);
    }
  }

  /**
   * Render a single duplicate group
   * @param container The container element
   * @param group The duplicate group to render
   */
  private renderGroup(container: HTMLElement, group: DuplicateGroup): void {
    const groupElement = container.createEl("div", { cls: "duplicate-group" });

    // Group header
    const header = groupElement.createEl("div", { cls: "duplicate-group-header" });
    const details = header.createEl("details");

    // Set initial open state - expand if in manual selection mode or previously expanded
    const shouldBeExpanded = this.manualSelectionGroups.has(group.hash) || this.expandedGroups.has(group.hash);
    details.open = shouldBeExpanded;

    // Track state changes
    details.addEventListener("toggle", () => {
      if (details.open) {
        this.expandedGroups.add(group.hash);
      } else {
        this.expandedGroups.delete(group.hash);
      }
    });

    const summary = details.createEl("summary");
    summary.createEl("span", {
      text: `${group.files.length}× ${group.files[0].basename}`,
      cls: "duplicate-group-title"
    });

    const hash = summary.createEl("span", {
      text: `(${group.hash.substring(0, 8)}...)`,
      cls: "duplicate-group-hash"
    });

    // Group content
    const content = details.createEl("div", { cls: "duplicate-group-content" });
    const fileList = content.createEl("ul", { cls: "duplicate-file-list" });

    for (const file of group.files) {
      this.renderFile(fileList, file, group.hash);
    }

    // Actions
    const actions = content.createEl("div", { cls: "duplicate-group-actions" });
    this.renderActions(actions, group);
  }

  /**
   * Render a single file in the list
   * @param container The container element
   * @param file The file to render
   * @param groupHash The hash of the group this file belongs to
   */
  private renderFile(container: HTMLElement, file: TFile, groupHash: string): void {
    const listItem = container.createEl("li", { cls: "duplicate-file-item" });

    // Add checkbox if in manual selection mode
    if (this.manualSelectionGroups.has(groupHash)) {
      const checkboxContainer = listItem.createEl("div", { cls: "duplicate-file-checkbox" });
      checkboxContainer.style.display = "inline-block";
      checkboxContainer.style.marginRight = "8px";

      const checkbox = checkboxContainer.createEl("input", { type: "checkbox" });
      checkbox.style.marginRight = "8px";

      // Check if this file is selected
      const selectedFilesForGroup = this.selectedFiles.get(groupHash);
      if (selectedFilesForGroup && selectedFilesForGroup.has(file.path)) {
        checkbox.checked = true;
      }

      checkbox.onchange = () => {
        this.toggleFileSelection(groupHash, file.path, checkbox.checked);
      };
    }

    // File link
    const link = listItem.createEl("a", {
      text: file.path,
      href: "#",
      cls: "duplicate-file-link"
    });

    link.onclick = (e) => {
      e.preventDefault();
      this.openFile(file);
    };

    // File info
    const info = listItem.createEl("div", { cls: "duplicate-file-info" });
    info.createEl("span", {
      text: `${this.formatFileSize(file.stat.size)}`,
      cls: "file-size"
    });
    info.createEl("span", {
      text: `Modified: ${new Date(file.stat.mtime).toLocaleString()}`,
      cls: "file-mtime"
    });
  }

  /**
   * Render action buttons for a group
   * @param container The container element
   * @param group The duplicate group
   */
  private renderActions(container: HTMLElement, group: DuplicateGroup): void {
    const buttonContainer = container.createEl("div", { cls: "duplicate-actions" });

    // Keep newest button
    const keepNewestBtn = buttonContainer.createEl("button", {
      text: "Keep Newest",
      cls: "mod-cta"
    });
    keepNewestBtn.onclick = async () => {
      keepNewestBtn.disabled = true;
      keepNewestBtn.textContent = "Processing...";
      try {
        await this.keepNewest(group);
      } finally {
        keepNewestBtn.disabled = false;
        keepNewestBtn.textContent = "Keep Newest";
      }
    };

    // Keep oldest button
    const keepOldestBtn = buttonContainer.createEl("button", {
      text: "Keep Oldest"
    });
    keepOldestBtn.onclick = async () => {
      keepOldestBtn.disabled = true;
      keepOldestBtn.textContent = "Processing...";
      try {
        await this.keepOldest(group);
      } finally {
        keepOldestBtn.disabled = false;
        keepOldestBtn.textContent = "Keep Oldest";
      }
    };

        // Manual selection button
    const isInSelectionMode = this.manualSelectionGroups.has(group.hash);
    const manualBtn = buttonContainer.createEl("button", {
      text: isInSelectionMode ? "Remove" : "Select Manually"
    });

    if (isInSelectionMode) {
      manualBtn.classList.add("mod-warning");
    }

    manualBtn.onclick = () => this.selectManually(group);

    // Add cancel button when in selection mode
    if (isInSelectionMode) {
      const cancelBtn = buttonContainer.createEl("button", {
        text: "Cancel"
      });
      cancelBtn.onclick = () => this.cancelManualSelection(group);
    }
  }

  /**
   * Open a file in the workspace
   * @param file The file to open
   */
  private async openFile(file: TFile): Promise<void> {
    try {
      await this.app.workspace.openLinkText(file.path, "");
    } catch (error) {
      console.error("Error opening file:", error);
    }
  }

  /**
   * Keep the newest file in a group
   * @param group The duplicate group
   */
  private async keepNewest(group: DuplicateGroup): Promise<void> {
    try {
      // Sort by modification time (newest first)
      const sortedFiles = [...group.files].sort((a, b) => b.stat.mtime - a.stat.mtime);
      const fileToKeep = sortedFiles[0];
      const filesToRemove = sortedFiles.slice(1);

      // Show confirmation dialog if enabled
      if (this.plugin.settings.confirmBeforeDelete) {
        const confirmed = await this.showConfirmationDialog(
          `Keep newest file: ${fileToKeep.path}`,
          `This will ${this.plugin.settings.action === "trash" ? "move to trash" : "tag"} the following files:`,
          filesToRemove
        );

        if (!confirmed) {
          return;
        }
      }

      // Process files based on action setting
      let processedCount = 0;
      const errors: string[] = [];

            for (const file of filesToRemove) {
        try {
          if (this.plugin.settings.action === "trash") {
            await this.app.vault.trash(file, false);
          } else if (this.plugin.settings.action === "tag") {
            await this.addDuplicateTag(file);
          }
          processedCount++;
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
          errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Show result notification
      const action = this.plugin.settings.action === "trash" ? "moved to trash" : "tagged";
      if (processedCount > 0) {
        new Notice(`Successfully ${action} ${processedCount} duplicate file(s)`);
      }

      if (errors.length > 0) {
        new Notice(`Failed to process ${errors.length} file(s). Check console for details.`, 5000);
      }

      // Remove processed group from view
      this.removeGroup(group);

    } catch (error) {
      console.error("Error in keepNewest:", error);
      new Notice("Error processing duplicates. Check console for details.");
    }
  }

  /**
   * Keep the oldest file in a group
   * @param group The duplicate group
   */
  private async keepOldest(group: DuplicateGroup): Promise<void> {
    try {
      // Sort by modification time (oldest first)
      const sortedFiles = [...group.files].sort((a, b) => a.stat.mtime - b.stat.mtime);
      const fileToKeep = sortedFiles[0];
      const filesToRemove = sortedFiles.slice(1);

      // Show confirmation dialog if enabled
      if (this.plugin.settings.confirmBeforeDelete) {
        const confirmed = await this.showConfirmationDialog(
          `Keep oldest file: ${fileToKeep.path}`,
          `This will ${this.plugin.settings.action === "trash" ? "move to trash" : "tag"} the following files:`,
          filesToRemove
        );

        if (!confirmed) {
          return;
        }
      }

      // Process files based on action setting
      let processedCount = 0;
      const errors: string[] = [];

            for (const file of filesToRemove) {
        try {
          if (this.plugin.settings.action === "trash") {
            await this.app.vault.trash(file, false);
          } else if (this.plugin.settings.action === "tag") {
            await this.addDuplicateTag(file);
          }
          processedCount++;
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
          errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Show result notification
      const action = this.plugin.settings.action === "trash" ? "moved to trash" : "tagged";
      if (processedCount > 0) {
        new Notice(`Successfully ${action} ${processedCount} duplicate file(s)`);
      }

      if (errors.length > 0) {
        new Notice(`Failed to process ${errors.length} file(s). Check console for details.`, 5000);
      }

      // Remove processed group from view
      this.removeGroup(group);

    } catch (error) {
      console.error("Error in keepOldest:", error);
      new Notice("Error processing duplicates. Check console for details.");
    }
  }

  /**
   * Manual selection for a group
   * @param group The duplicate group
   */
  private async selectManually(group: DuplicateGroup): Promise<void> {
    const isInSelectionMode = this.manualSelectionGroups.has(group.hash);

    if (isInSelectionMode) {
      // Remove mode - process selected files
      await this.removeSelectedFiles(group);
    } else {
      // Select mode - enter manual selection
      this.enterManualSelection(group);
    }
  }

  /**
   * Enter manual selection mode for a group
   * @param group The duplicate group
   */
  private enterManualSelection(group: DuplicateGroup): void {
    this.manualSelectionGroups.add(group.hash);
    this.selectedFiles.set(group.hash, new Set());
    // Ensure the group is expanded when entering manual selection mode
    this.expandedGroups.add(group.hash);
    this.render();
  }

  /**
   * Cancel manual selection mode for a group
   * @param group The duplicate group
   */
  private cancelManualSelection(group: DuplicateGroup): void {
    this.manualSelectionGroups.delete(group.hash);
    this.selectedFiles.delete(group.hash);
    // Keep the group expanded state as user manually expanded it
    this.render();
  }

  /**
   * Toggle file selection state
   * @param groupHash The group hash
   * @param filePath The file path
   * @param selected Whether the file is selected
   */
  private toggleFileSelection(groupHash: string, filePath: string, selected: boolean): void {
    const selectedFilesForGroup = this.selectedFiles.get(groupHash) || new Set();

    if (selected) {
      selectedFilesForGroup.add(filePath);
    } else {
      selectedFilesForGroup.delete(filePath);
    }

    this.selectedFiles.set(groupHash, selectedFilesForGroup);
  }

  /**
   * Remove selected files from a group
   * @param group The duplicate group
   */
  private async removeSelectedFiles(group: DuplicateGroup): Promise<void> {
    const selectedFilesForGroup = this.selectedFiles.get(group.hash);

    if (!selectedFilesForGroup || selectedFilesForGroup.size === 0) {
      new Notice("No files selected for removal.");
      return;
    }

    // Find the actual TFile objects for the selected paths
    const filesToRemove = group.files.filter(file => selectedFilesForGroup.has(file.path));

    if (filesToRemove.length === group.files.length) {
      new Notice("Cannot remove all files from a group. Please keep at least one file.");
      return;
    }

    // Show confirmation dialog if enabled
    if (this.plugin.settings.confirmBeforeDelete) {
      const confirmed = await this.showConfirmationDialog(
        "Remove selected files",
        `This will ${this.plugin.settings.action === "trash" ? "move to trash" : "tag"} the following files:`,
        filesToRemove
      );

      if (!confirmed) {
        return;
      }
    }

    // Process files based on action setting
    let processedCount = 0;
    const errors: string[] = [];

    for (const file of filesToRemove) {
      try {
        if (this.plugin.settings.action === "trash") {
          await this.app.vault.trash(file, false);
        } else if (this.plugin.settings.action === "tag") {
          await this.addDuplicateTag(file);
        }
        processedCount++;
      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Show result notification
    const action = this.plugin.settings.action === "trash" ? "moved to trash" : "tagged";
    if (processedCount > 0) {
      new Notice(`Successfully ${action} ${processedCount} selected file(s)`);
    }

    if (errors.length > 0) {
      new Notice(`Failed to process ${errors.length} file(s). Check console for details.`, 5000);
    }

    // Update the group to remove processed files
    const remainingFiles = group.files.filter(file => !selectedFilesForGroup.has(file.path));

    if (remainingFiles.length <= 1) {
      // If only one file remains, remove the entire group
      this.removeGroup(group);
    } else {
      // Update the group with remaining files
      const groupIndex = this.groups.findIndex(g => g.hash === group.hash);
      if (groupIndex !== -1) {
        this.groups[groupIndex] = { ...group, files: remainingFiles };
      }
    }

        // Exit manual selection mode
    this.manualSelectionGroups.delete(group.hash);
    this.selectedFiles.delete(group.hash);
    // Keep the group expanded if it still exists after removal

    // Re-render the view
    this.render();
  }

  /**
   * Format file size for display
   * @param bytes File size in bytes
   * @returns Formatted size string
   */
  private formatFileSize(bytes: number): string {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Show confirmation dialog for file operations
   * @param title Dialog title
   * @param message Dialog message
   * @param files Files to be processed
   * @returns Promise<boolean> true if confirmed, false otherwise
   */
  private showConfirmationDialog(title: string, message: string, files: TFile[]): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmationModal(this.app, title, message, files, resolve);
      modal.open();
    });
  }

    /**
   * Add duplicate tag to a file
   * @param file The file to tag
   */
  private async addDuplicateTag(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const tagToAdd = "#duplicate";

      // Check if file already has the tag
      if (content.includes(tagToAdd)) {
        return;
      }

      // Add tag to the beginning of the file
      const newContent = `${tagToAdd}\n\n${content}`;
      await this.app.vault.modify(file, newContent);
    } catch (error) {
      console.error(`Error adding tag to file ${file.path}:`, error);
      throw error;
    }
  }

  /**
   * Remove a processed group from the view
   * @param groupToRemove The group to remove
   */
  private removeGroup(groupToRemove: DuplicateGroup): void {
    this.groups = this.groups.filter(group => group.hash !== groupToRemove.hash);
    // Clean up state for removed group
    this.expandedGroups.delete(groupToRemove.hash);
    this.manualSelectionGroups.delete(groupToRemove.hash);
    this.selectedFiles.delete(groupToRemove.hash);
    this.render();
  }
}

/**
 * Modal for confirming file operations
 */
class ConfirmationModal extends Modal {
  private title: string;
  private message: string;
  private files: TFile[];
  private resolve: (value: boolean) => void;

  constructor(app: App, title: string, message: string, files: TFile[], resolve: (value: boolean) => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.files = files;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Title
    contentEl.createEl("h2", { text: this.title });

    // Message
    contentEl.createEl("p", { text: this.message });

    // File list
    const fileList = contentEl.createEl("ul", { cls: "duplicate-confirmation-files" });
    this.files.forEach(file => {
      const listItem = fileList.createEl("li");
      listItem.createEl("strong", { text: file.path });
      listItem.createEl("span", { text: ` (${new Date(file.stat.mtime).toLocaleString()})` });
    });

    // Button container
    const buttonContainer = contentEl.createEl("div", { cls: "duplicate-confirmation-buttons" });
    buttonContainer.style.marginTop = "20px";
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.justifyContent = "flex-end";

    // Cancel button
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => {
      this.resolve(false);
      this.close();
    };

    // Confirm button
    const confirmBtn = buttonContainer.createEl("button", { text: "Confirm", cls: "mod-cta" });
    confirmBtn.onclick = () => {
      this.resolve(true);
      this.close();
    };

    // Focus confirm button
    confirmBtn.focus();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}