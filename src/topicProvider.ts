import * as vscode from 'vscode';
import * as topicsData from '../data/topics.json';
import { DevMapStore } from './store';

interface Topic {
  id: string;
  label: string;
  astPattern: string;
  docsUrl: string;
}

interface Track {
  id: string;
  label: string;
  topics: Topic[];
}

export class TopicProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private store = DevMapStore.getInstance();
  private tracks: Track[] = (topicsData as any).tracks;

  constructor() {
    // Refresh the view whenever the store changes
    this.store.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!element) {
      // Root level: return tracks
      const trackItems = this.tracks.map(track => {
        const covered = this.store.getCoveredTopics();
        const totalTopics = track.topics.length;
        const coveredTopicsInTrack = track.topics.filter(t => covered.has(t.id)).length;
        
        return new TrackTreeItem(
          track.label,
          coveredTopicsInTrack,
          totalTopics,
          track,
          vscode.TreeItemCollapsibleState.Collapsed
        );
      });
      return Promise.resolve(trackItems);
    } else if (element instanceof TrackTreeItem) {
      // Middle level: return topics within track
      const covered = this.store.getCoveredTopics();
      const topicItems = element.track.topics.map(topic => {
        const isCovered = covered.has(topic.id);
        return new TopicTreeItem(topic, isCovered);
      });
      return Promise.resolve(topicItems);
    }

    return Promise.resolve([]);
  }
}

class TrackTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly coveredCount: number,
    public readonly totalCount: number,
    public readonly track: Track,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = `${coveredCount}/${totalCount} (${Math.round((coveredCount / totalCount) * 100)}%)`;
    this.contextValue = 'track';
    
    // Set track color indicators or native folder icon
    this.iconPath = new vscode.ThemeIcon('folder-active');
  }
}

class TopicTreeItem extends vscode.TreeItem {
  constructor(
    public readonly topic: Topic,
    public readonly isCovered: boolean
  ) {
    super(topic.label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${topic.label} - Click to view documentation`;
    this.contextValue = 'topic';
    
    if (isCovered) {
      this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
      this.description = '✓ Done';
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconQueued'));
      this.description = 'Pending';
    }

    // Assign command to open the documentation link on click
    this.command = {
      command: 'vscode.open',
      title: 'Open Documentation',
      arguments: [vscode.Uri.parse(topic.docsUrl)]
    };
  }
}
