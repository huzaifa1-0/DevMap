import * as vscode from 'vscode';

export class DevMapStore {
  private static instance: DevMapStore;
  private context: vscode.ExtensionContext | null = null;
  private coveredTopics: Set<string> = new Set();
  private topicSnippets: Record<string, string> = {};
  
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
    const savedSnippets = context.workspaceState.get<Record<string, string>>('topicSnippets') || {};
    this.topicSnippets = savedSnippets;
  }

  public getCoveredTopics(): Set<string> {
    return new Set(this.coveredTopics);
  }

  public getCodeSnippet(topicId: string): string {
    return this.topicSnippets[topicId] || '';
  }

  public getTopicSnippets(): Record<string, string> {
    return { ...this.topicSnippets };
  }

  public addCoveredTopics(topics: Set<string> | string[]) {
    const topicsMap = new Map<string, string>();
    topics.forEach(t => {
      topicsMap.set(t, this.topicSnippets[t] || '');
    });
    this.addCoveredTopicsWithSnippets(topicsMap);
  }

  public addCoveredTopicsWithSnippets(topicsMap: Map<string, string>) {
    let changed = false;
    for (const [topicId, snippet] of topicsMap.entries()) {
      if (!this.coveredTopics.has(topicId)) {
        this.coveredTopics.add(topicId);
        changed = true;
      }
      if (snippet && (!this.topicSnippets[topicId] || this.topicSnippets[topicId] !== snippet)) {
        this.topicSnippets[topicId] = snippet;
        changed = true;
      }
    }

    if (changed && this.context) {
      this.context.workspaceState.update('coveredTopics', Array.from(this.coveredTopics));
      this.context.workspaceState.update('topicSnippets', this.topicSnippets);
      this._onDidUpdate.fire();
    }
  }

  public resetProgress() {
    this.coveredTopics.clear();
    this.topicSnippets = {};
    if (this.context) {
      this.context.workspaceState.update('coveredTopics', []);
      this.context.workspaceState.update('topicSnippets', {});
      this._onDidUpdate.fire();
    }
  }
}

