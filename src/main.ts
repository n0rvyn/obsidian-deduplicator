import { DuplicateRegistry } from "./duplicateRegistry";
import { DuplicateScanner } from "./duplicateScanner";
import { DuplicateView, VIEW_TYPE_DUPLICATE } from "./views/duplicateView";

export default class DeduplicatorPlugin extends Plugin {
  settings: DeduplicatorSettings;
  private registry: DuplicateRegistry;

  async onload(): Promise<void> {
    await this.loadSettings();
    const savedRegistry = (await this.loadData())?.registry ?? {};
    this.registry = new DuplicateRegistry(savedRegistry);

    this.addSettingTab(new DeduplicatorSettingTab(this.app, this));

    this.addCommand({
      id: "scan-duplicates",
      name: "Scan vault for duplicate notes",
      callback: () => this.scanDuplicates()
    });

    this.registerView(VIEW_TYPE_DUPLICATE, leaf => new DuplicateView(leaf));
    if (!this.app.workspace.getLeavesOfType(VIEW_TYPE_DUPLICATE).length) {
      this.app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE_DUPLICATE });
    }
  }

  async scanDuplicates(): Promise<void> {
    const scanner = new DuplicateScanner(this.app, this.settings, this.registry);
    const groups = await scanner.scan();

    // Update view
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DUPLICATE);
    if (leaves.length) {
      (leaves[0].view as DuplicateView).setGroups(groups);
    }

    new Notice(`${groups.length} duplicate groups found.`);
    await this.saveData({ registry: this.registry.getAll() });
  }
}