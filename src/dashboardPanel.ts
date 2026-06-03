import * as vscode from 'vscode';
import * as topicsData from '../data/topics.json';
import { DevMapStore } from './store';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private store = DevMapStore.getInstance();

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(column);
      DashboardPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'devmapDashboard',
      'DevMap Learning Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial HTML content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'reset':
            const selection = await vscode.window.showWarningMessage(
              'Are you sure you want to clear your learning progress?',
              { modal: true },
              'Yes, Clear Progress'
            );
            if (selection === 'Yes, Clear Progress') {
              this.store.resetProgress();
              vscode.window.showInformationMessage('DevMap: Progress cleared successfully.');
            }
            break;
          case 'openDocs':
            if (message.url) {
              vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(message.url));
            }
            break;
        }
      },
      null,
      this._disposables
    );

    // Listen for state updates in the store
    this.store.onDidUpdate(() => {
      this.update();
    }, null, this._disposables);

    // Run initial update
    this.update();
  }

  public update() {
    const covered = Array.from(this.store.getCoveredTopics());
    const tracks = (topicsData as any).tracks;

    this._panel.webview.postMessage({
      type: 'update',
      covered,
      tracks
    });
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net ${cspSource}; img-src ${cspSource} https:; font-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevMap Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-color: #1e1e2e;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-hover: rgba(255, 255, 255, 0.06);
      --border-color: rgba(255, 255, 255, 0.08);
      --primary-color: #3b82f6;
      --success-color: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --success-border: rgba(16, 185, 129, 0.4);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
    }

    body.vscode-light {
      --bg-color: #f3f4f6;
      --card-bg: rgba(0, 0, 0, 0.02);
      --card-hover: rgba(0, 0, 0, 0.05);
      --border-color: rgba(0, 0, 0, 0.08);
      --primary-color: #2563eb;
      --success-color: #059669;
      --success-bg: rgba(5, 150, 105, 0.08);
      --success-border: rgba(5, 150, 105, 0.3);
      --text-main: #1f2937;
      --text-muted: #4b5563;
    }

    body {
      background-color: var(--vscode-editor-background, var(--bg-color));
      color: var(--vscode-editor-foreground, var(--text-main));
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      margin: 0;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 16px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }

    .subtitle {
      color: var(--text-muted);
      margin: 4px 0 0 0;
      font-size: 14px;
    }

    .btn-reset {
      background: transparent;
      border: 1px solid #ef444488;
      color: #ef4444;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s ease;
    }

    .btn-reset:hover {
      background: #ef444415;
      border-color: #ef4444;
    }

    .dashboard-layout {
      display: flex;
      flex-direction: column;
      gap: 30px;
    }

    @media (min-width: 900px) {
      .dashboard-layout {
        flex-direction: row;
      }
      .chart-container {
        flex: 1;
        max-width: 450px;
      }
      .tracks-container {
        flex: 2;
      }
    }

    .card {
      background: var(--vscode-editor-background, var(--card-bg));
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .chart-card {
      height: fit-content;
      position: sticky;
      top: 24px;
    }

    .track-section {
      margin-bottom: 24px;
    }

    .track-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .track-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }

    .track-progress-badge {
      font-size: 13px;
      color: var(--text-muted);
      background: var(--card-bg);
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid var(--border-color);
    }

    .topic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .topic-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s ease;
      font-size: 14px;
    }

    .topic-card:hover {
      background: var(--card-hover);
      transform: translateY(-2px);
    }

    .topic-card.completed {
      background: var(--success-bg);
      border-color: var(--success-border);
      color: var(--success-color);
      font-weight: 500;
    }

    .status-icon {
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-icon.completed::after {
      content: "✓";
      font-weight: bold;
    }

    .status-icon.pending::after {
      content: "○";
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>DevMap Dashboard</h1>
      <p class="subtitle">Real-time learning analysis driven by static code compilation patterns</p>
    </div>
    <button class="btn-reset" onclick="resetProgress()">Clear Progress</button>
  </header>

  <div class="dashboard-layout">
    <!-- Visual Representation of Completion -->
    <div class="chart-container">
      <div class="card chart-card">
        <h3 style="margin-top: 0; margin-bottom: 16px;">Track Completion Status</h3>
        <div style="position: relative; width: 100%; height: 260px;">
          <canvas id="progressChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Details Grid -->
    <div class="tracks-container" id="tracksContainer">
      <!-- Tracks and topics will be injected dynamically -->
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let myChart = null;

    function resetProgress() {
      vscode.postMessage({ command: 'reset' });
    }

    function openDocs(url) {
      vscode.postMessage({ command: 'openDocs', url: url });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        const { covered, tracks } = message;
        renderDashboard(covered, tracks);
      }
    });

    function renderDashboard(covered, tracks) {
      const container = document.getElementById('tracksContainer');
      container.innerHTML = '';

      const chartLabels = [];
      const chartData = [];
      const chartColors = [];

      tracks.forEach(track => {
        const total = track.topics.length;
        const completed = track.topics.filter(t => covered.includes(t.id)).length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        chartLabels.push(track.label);
        chartData.push(percentage);
        chartColors.push(track.id === 'javascript' ? '#3b82f6' : (track.id === 'node' ? '#10b981' : '#f59e0b'));

        // Render HTML Elements
        const section = document.createElement('div');
        section.className = 'track-section';

        const header = document.createElement('div');
        header.className = 'track-header';
        header.innerHTML = \`
          <h3 class="track-title">\${track.label}</h3>
          <span class="track-progress-badge">\${completed}/\${total} (\${percentage}%)</span>
        \`;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'topic-grid';

        track.topics.forEach(topic => {
          const isDone = covered.includes(topic.id);
          const topicCard = document.createElement('div');
          topicCard.className = \`topic-card \${isDone ? 'completed' : 'pending'}\`;
          topicCard.onclick = () => openDocs(topic.docsUrl);
          
          topicCard.innerHTML = \`
            <span>\${topic.label}</span>
            <span class="status-icon \${isDone ? 'completed' : 'pending'}"></span>
          \`;
          grid.appendChild(topicCard);
        });

        section.appendChild(grid);
        container.appendChild(section);
      });

      // Render or Update Chart.js
      updateChart(chartLabels, chartData, chartColors);
    }

    function updateChart(labels, data, colors) {
      const ctx = document.getElementById('progressChart').getContext('2d');
      
      const isDark = !document.body.classList.contains('vscode-light');
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
      const textColor = isDark ? '#9ca3af' : '#4b5563';

      if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = data;
        myChart.data.datasets[0].backgroundColor = colors;
        myChart.options.scales.x.grid.color = gridColor;
        myChart.options.scales.x.ticks.color = textColor;
        myChart.options.scales.y.grid.color = gridColor;
        myChart.options.scales.y.ticks.color = textColor;
        myChart.update();
      } else {
        myChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: '% Complete',
              data: data,
              backgroundColor: colors,
              borderRadius: 6,
              borderWidth: 0,
              barThickness: 32
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return context.parsed.y + '% Completed';
                  }
                }
              }
            },
            scales: {
              x: {
                grid: {
                  color: gridColor
                },
                ticks: {
                  color: textColor
                }
              },
              y: {
                min: 0,
                max: 100,
                grid: {
                  color: gridColor
                },
                ticks: {
                  color: textColor,
                  stepSize: 20,
                  callback: function(value) {
                    return value + '%';
                  }
                }
              }
            }
          }
        });
      }
    }
  </script>
</body>
</html>`;
  }
}
