import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { DuplicateGroup } from "../duplicateScanner";

export const VIEW_TYPE_DUPLICATE = "deduplicator-view";

export class DuplicateView extends ItemView {
  private groups: DuplicateGroup[] = [];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DUPLICATE;
  }

  getDisplayText(): string {
    return "Duplicates";
  }

  async onClose(): Promise<void> {}

  setGroups(groups: DuplicateGroup[]): void {
    this.groups = groups;
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();

    if (this.groups.length === 0) {
      container.createEl("p", { text: "No duplicates found." });
      return;
    }

    for (const group of this.groups) {
      const details = container.createEl("details");
      details.createEl("summary", { text: `${group.files.length}× ${group.files[0].basename}` });
      const list = details.createEl("ul");
      for (const file of group.files) {
        const li = list.createEl("li");
        const link = li.createEl("a", { text: file.path, href: "#" });
        link.onclick = () => this.app.workspace.openLinkText(file.path, "");
      }
    }
  }
}