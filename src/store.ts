import * as vscode from 'vscode';

export class DevMapStore {
  private static instance: DevMapStore;
  private context: vscode.ExtensionContext | null = null;
  private coveredTopics: Set<string> = new Set();
  
  private _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  private constructor() {}

  public static getInstance(): DevMapStore {
    if (!DevMapStore.instance) {
      DevMapStore.instance = new DevMapStore();
    }
    return DevMapStore.instance;
  }

  public initialize(context: vscode.ExtensionContext) {
    this.context = context;
    // Load from workspaceState
    const saved = context.workspaceState.get<string[]>('coveredTopics') || [];
    this.coveredTopics = new Set(saved);
  }

  public getCoveredTopics(): Set<string> {
    return new Set(this.coveredTopics);
  }

  public addCoveredTopics(topics: Set<string> | string[]) {
    let changed = false;
    topics.forEach(topic => {
      if (!this.coveredTopics.has(topic)) {
        this.coveredTopics.add(topic);
        changed = true;
      }
    });

    if (changed && this.context) {
      this.context.workspaceState.update('coveredTopics', Array.from(this.coveredTopics));
      this._onDidUpdate.fire();
    }
  }

  public resetProgress() {
    this.coveredTopics.clear();
    if (this.context) {
      this.context.workspaceState.update('coveredTopics', []);
      this._onDidUpdate.fire();
    }
  }
}
