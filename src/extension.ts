import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as topicsData from '../data/topics.json';
import { DevMapStore } from './store';
import { TopicProvider } from './topicProvider';
import { DashboardPanel } from './dashboardPanel';
import { scanCodeForTopics } from './scanner';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('DevMap extension is now active!');

  // Initialize Store
  const store = DevMapStore.getInstance();
  store.initialize(context);

  // Register TreeView Sidebar Provider
  const topicProvider = new TopicProvider();
  vscode.window.registerTreeDataProvider('devmap.topicsView', topicProvider);

  // Register Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'devmap.openDashboard';
  statusBarItem.tooltip = 'Show DevMap Learning Dashboard';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();
  updateStatusBar();

  // Listen for store updates to refresh status bar
  store.onDidUpdate(() => {
    updateStatusBar();
  });

  // Helper to scan a single document and notify if new topics unlocked
  const scanDocument = (doc: vscode.TextDocument) => {
    const filePath = doc.uri.fsPath;
    const ext = path.extname(filePath).toLowerCase();
    
    // Only scan supported files
    if (!['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      return;
    }
    
    // Ignore node_modules, build directories, etc.
    if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('out') || filePath.includes('dist')) {
      return;
    }

    try {
      const code = doc.getText();
      const detected = scanCodeForTopics(code, filePath);
      const previouslyCovered = store.getCoveredTopics();
      const unlocked: string[] = [];

      detected.forEach(topicId => {
        if (!previouslyCovered.has(topicId)) {
          unlocked.push(topicId);
        }
      });

      if (unlocked.length > 0) {
        // Add all detected topics
        store.addCoveredTopics(detected);

        // Find labels and display notification
        const tracks = (topicsData as any).tracks;
        unlocked.forEach(topicId => {
          for (const track of tracks) {
            const found = track.topics.find((t: any) => t.id === topicId);
            if (found) {
              vscode.window.showInformationMessage(`🎉 DevMap Unlocked: ${found.label} in ${track.label}!`);
              break;
            }
          }
        });
      } else {
        // Save anyway to cover the state
        store.addCoveredTopics(detected);
      }
    } catch (err) {
      console.error('Error scanning saved document: ', err);
    }
  };

  // 1. Hook onDidSaveTextDocument
  const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    scanDocument(doc);
  });
  context.subscriptions.push(saveListener);

  // 2. Command: Open Dashboard
  const openDashboardCmd = vscode.commands.registerCommand('devmap.openDashboard', () => {
    DashboardPanel.createOrShow(context.extensionUri);
  });
  context.subscriptions.push(openDashboardCmd);

  // 3. Command: Reset Progress
  const resetProgressCmd = vscode.commands.registerCommand('devmap.resetProgress', () => {
    store.resetProgress();
  });
  context.subscriptions.push(resetProgressCmd);

  // 4. Command: Scan Workspace
  const scanWorkspaceCmd = vscode.commands.registerCommand('devmap.scanWorkspace', async () => {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Scanning workspace for learning topics...",
      cancellable: false
    }, async (progress) => {
      // Find all JS/TS files
      const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx}', '**/node_modules/**');
      let scannedCount = 0;
      const allDetected = new Set<string>();

      for (const file of files) {
        try {
          const docBytes = await vscode.workspace.fs.readFile(file);
          const docText = Buffer.from(docBytes).toString('utf-8');
          const detected = scanCodeForTopics(docText, file.fsPath);
          detected.forEach(topicId => allDetected.add(topicId));
          scannedCount++;
        } catch (e) {
          console.error('Failed to read file during scan:', file.fsPath, e);
        }
      }

      // Diff covered topics
      const previouslyCovered = store.getCoveredTopics();
      const unlocked: string[] = [];

      allDetected.forEach(topicId => {
        if (!previouslyCovered.has(topicId)) {
          unlocked.push(topicId);
        }
      });

      store.addCoveredTopics(allDetected);

      if (unlocked.length > 0) {
        vscode.window.showInformationMessage(`DevMap Scan Complete: Analyzed ${scannedCount} files, unlocking ${unlocked.length} new topics!`);
      } else {
        vscode.window.showInformationMessage(`DevMap Scan Complete: Analyzed ${scannedCount} files. No new topics unlocked.`);
      }
    });
  });
  context.subscriptions.push(scanWorkspaceCmd);

  // Auto scan open text editor on activate
  if (vscode.window.activeTextEditor) {
    scanDocument(vscode.window.activeTextEditor.document);
  }
}

function updateStatusBar() {
  const store = DevMapStore.getInstance();
  const coveredCount = store.getCoveredTopics().size;
  
  // Compute total topics
  let totalCount = 0;
  const tracks = (topicsData as any).tracks;
  for (const track of tracks) {
    totalCount += track.topics.length;
  }

  statusBarItem.text = `$(map) ${coveredCount}/${totalCount} Topics`;
}

export function deactivate() {
  // cleanup if necessary
}
