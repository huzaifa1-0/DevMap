import * as vscode from 'vscode';
import * as topicsData from '../data/topics.json';
import { DevMapStore } from './store';
import { SecretStore } from './secretStore';
import { GroqService } from './groqService';
import { AICache } from './cache';
import { PromptBuilder } from './promptBuilder';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private store = DevMapStore.getInstance();
  private _abortController: AbortController | null = null;
  private _lastSuggestedHash = '';

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

    // Set HTML content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages
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
              this._lastSuggestedHash = '';
              vscode.window.showInformationMessage('DevMap: Progress cleared successfully.');
            }
            break;

          case 'explain':
            await this.explainTopic(message.topicId);
            break;

          case 'quiz':
            await this.startQuiz(message.topicId);
            break;

          case 'checkAnswer':
            await this.checkAnswer(message.topicId, message.question, message.correctAnswer, message.userAnswer, message.qIndex);
            break;

          case 'stop':
            this.stopStream();
            break;

          case 'setKey':
            await vscode.commands.executeCommand('devmap.setApiKey');
            break;
        }
      },
      null,
      this._disposables
    );

    this.store.onDidUpdate(() => {
      this.update();
    }, null, this._disposables);

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

    // Check if we need to update AI suggestions
    const currentHash = covered.sort().join(',');
    if (currentHash !== this._lastSuggestedHash) {
      this._lastSuggestedHash = currentHash;
      this.runSuggestions();
    }
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;
    this.stopStream();
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private stopStream() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  private findTopic(topicId: string) {
    const tracks = (topicsData as any).tracks;
    for (const track of tracks) {
      const t = track.topics.find((x: any) => x.id === topicId);
      if (t) { return t; }
    }
    return null;
  }

  private async explainTopic(topicId: string) {
    this.stopStream();
    this._panel.webview.postMessage({ type: 'stream_start', mode: 'explain', topicId });

    const topic = this.findTopic(topicId);
    if (!topic) {
      this._panel.webview.postMessage({ type: 'error', message: 'Topic not found.' });
      return;
    }

    const codeSnippet = this.store.getCodeSnippet(topicId) || '// Code snippet not scanned yet.';
    const cache = AICache.getInstance();
    const cachedExplanation = cache.getExplanation(topicId);

    if (cachedExplanation) {
      await cache.simulateStream(cachedExplanation, (token) => {
        this._panel.webview.postMessage({ type: 'token', content: token });
      });
      this._panel.webview.postMessage({ type: 'stream_end' });
      return;
    }

    try {
      await cache.enforceCooldown();
      this._abortController = new AbortController();
      const prompt = PromptBuilder.buildExplainPrompt(topic.label, codeSnippet);

      let collectedText = '';
      await GroqService.getInstance().streamChatCompletion(
        prompt,
        (token) => {
          collectedText += token;
          this._panel.webview.postMessage({ type: 'token', content: token });
        },
        this._abortController.signal
      );

      cache.setExplanation(topicId, collectedText);
      this._panel.webview.postMessage({ type: 'stream_end' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this._panel.webview.postMessage({ type: 'stream_end', status: 'cancelled' });
      } else if (err.message === 'APIKeyMissing') {
        this._panel.webview.postMessage({ type: 'error', message: 'API_KEY_MISSING' });
      } else {
        this._panel.webview.postMessage({ type: 'error', message: err.message || 'Failed to call Groq AI.' });
      }
    } finally {
      this._abortController = null;
    }
  }

  private async startQuiz(topicId: string) {
    this.stopStream();
    this._panel.webview.postMessage({ type: 'stream_start', mode: 'quiz', topicId });

    const topic = this.findTopic(topicId);
    if (!topic) {
      this._panel.webview.postMessage({ type: 'error', message: 'Topic not found.' });
      return;
    }

    const codeSnippet = this.store.getCodeSnippet(topicId) || '// Code snippet not scanned yet.';
    const cache = AICache.getInstance();
    const cachedQuiz = cache.getQuiz(topicId);

    if (cachedQuiz) {
      this._panel.webview.postMessage({ type: 'quiz_data', quiz: cachedQuiz, topicId });
      this._panel.webview.postMessage({ type: 'stream_end' });
      return;
    }

    try {
      await cache.enforceCooldown();
      this._abortController = new AbortController();
      const prompt = PromptBuilder.buildQuizPrompt(topic.label, codeSnippet);

      const response = await GroqService.getInstance().getChatCompletion(prompt, this._abortController.signal);

      let cleanJson = response.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
      }

      const quiz = JSON.parse(cleanJson);
      cache.setQuiz(topicId, quiz);
      this._panel.webview.postMessage({ type: 'quiz_data', quiz, topicId });
      this._panel.webview.postMessage({ type: 'stream_end' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this._panel.webview.postMessage({ type: 'stream_end', status: 'cancelled' });
      } else if (err.message === 'APIKeyMissing') {
        this._panel.webview.postMessage({ type: 'error', message: 'API_KEY_MISSING' });
      } else {
        this._panel.webview.postMessage({ type: 'error', message: 'Could not generate quiz. Check JSON formatting.' });
      }
    } finally {
      this._abortController = null;
    }
  }

  private async checkAnswer(
    topicId: string,
    question: string,
    correctAnswer: string,
    userAnswer: string,
    qIndex: number
  ) {
    this._panel.webview.postMessage({ type: 'grading_start', qIndex });

    const prompt = `You are a JavaScript tutor.
Question: "${question}"
Correct Answer: "${correctAnswer}"
Student Answer: "${userAnswer}"

Evaluate if the student's answer is correct or shows a good understanding of the concept. Give a friendly 1-2 sentence validation or correction. Keep feedback under 50 words. Do not show code templates.`;

    try {
      this._abortController = new AbortController();
      const feedback = await GroqService.getInstance().getChatCompletion(prompt, this._abortController.signal);
      this._panel.webview.postMessage({ type: 'grading_result', qIndex, feedback });
    } catch (err: any) {
      this._panel.webview.postMessage({ type: 'grading_result', qIndex, feedback: 'Could not evaluate answer. Check API status.' });
    } finally {
      this._abortController = null;
    }
  }

  private async runSuggestions() {
    const covered = Array.from(this.store.getCoveredTopics());
    const tracks = (topicsData as any).tracks;

    const remaining: string[] = [];
    const coveredLabels: string[] = [];

    tracks.forEach((track: any) => {
      track.topics.forEach((topic: any) => {
        if (covered.includes(topic.id)) {
          coveredLabels.push(topic.label);
        } else {
          remaining.push(topic.label);
        }
      });
    });

    if (remaining.length === 0) {
      this._panel.webview.postMessage({ type: 'suggestions', suggestions: [] });
      return;
    }

    try {
      const apiKey = await SecretStore.getInstance().getApiKey();
      if (!apiKey) { return; } // Don't prompt error for background suggestions

      const prompt = PromptBuilder.buildSuggestPrompt(coveredLabels, remaining);
      const response = await GroqService.getInstance().getChatCompletion(prompt);

      let cleanJson = response.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
      }

      const suggestions = JSON.parse(cleanJson);
      
      // Match suggestions back to topic IDs
      const formattedSuggestions = suggestions.map((s: any) => {
        let topicId = '';
        tracks.forEach((track: any) => {
          const found = track.topics.find((t: any) => t.label.toLowerCase() === s.label.toLowerCase() || t.id.toLowerCase() === s.id.toLowerCase());
          if (found) { topicId = found.id; }
        });
        return {
          id: topicId || s.id,
          label: s.label,
          reason: s.reason
        };
      }).filter((s: any) => s.id !== '');

      this._panel.webview.postMessage({ type: 'suggestions', suggestions: formattedSuggestions });
    } catch (e) {
      console.error('Failed to load AI suggestions:', e);
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
      --bg-color: #0d0d1a;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-hover: rgba(255, 255, 255, 0.06);
      --border-color: rgba(255, 255, 255, 0.08);
      --primary-color: #f55036;
      --secondary-color: #534ab7;
      --success-color: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --success-border: rgba(16, 185, 129, 0.4);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
    }

    body.vscode-light {
      --bg-color: #f4f2ec;
      --card-bg: rgba(0, 0, 0, 0.02);
      --card-hover: rgba(0, 0, 0, 0.05);
      --border-color: rgba(0, 0, 0, 0.08);
      --primary-color: #e03c25;
      --secondary-color: #433ca8;
      --success-color: #059669;
      --success-bg: rgba(5, 150, 105, 0.08);
      --success-border: rgba(5, 150, 105, 0.3);
      --text-main: #1f2937;
      --text-muted: #4b5563;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      margin: 0;
      line-height: 1.6;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 16px;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      color: var(--text-main);
    }

    .subtitle {
      color: var(--text-muted);
      margin: 4px 0 0 0;
      font-size: 14px;
    }

    .btn {
      background-color: var(--primary-color);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary { background-color: var(--secondary-color); }
    .btn-reset {
      background: transparent;
      border: 1px solid #ef444488;
      color: #ef4444;
    }
    .btn-reset:hover {
      background: #ef444415;
      border-color: #ef4444;
    }

    /* Tabs Layout */
    .tab-bar {
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 20px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 10px 16px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn.active {
      color: var(--primary-color);
      border-bottom-color: var(--primary-color);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .dashboard-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }

    @media (min-width: 1024px) {
      .dashboard-layout {
        grid-template-columns: 1.2fr 2fr;
      }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-bottom: 20px;
    }

    .track-section { margin-bottom: 24px; }
    .track-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .track-title { font-size: 18px; font-weight: 600; margin: 0; }
    .track-progress-badge {
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(255,255,255,0.05);
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid var(--border-color);
    }

    .topic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
      font-size: 13.5px;
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

    .status-icon.completed::after { content: "✓"; font-weight: bold; }
    .status-icon.pending::after { content: "○"; opacity: 0.6; }

    /* AI Explain & Quiz View */
    .ai-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .ai-stream {
      white-space: pre-wrap;
      font-size: 14px;
      min-height: 100px;
      line-height: 1.7;
    }
    .spinner {
      display: none;
      font-style: italic;
      color: var(--primary-color);
      margin: 10px 0;
    }

    .suggestion-card {
      border-left: 4px solid var(--primary-color);
      background: rgba(245, 80, 54, 0.04);
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .quiz-form {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .quiz-q {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 15px;
    }
    .quiz-q input[type="text"] {
      width: 100%;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border-color);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      margin-top: 8px;
    }
    .grading-box {
      margin-top: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.05);
      border-left: 3px solid var(--secondary-color);
      font-size: 0.9em;
    }

    .error-box {
      display: none;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>DevMap Dashboard</h1>
      <p class="subtitle">Real-time compilation analysis powered by Groq AI</p>
    </div>
    <div>
      <button class="btn btn-reset" onclick="resetProgress()">Clear Progress</button>
    </div>
  </header>

  <div class="tab-bar">
    <button class="tab-btn active" onclick="switchTab('overview')">Overview Map</button>
    <button class="tab-btn" onclick="switchTab('ai-tutor')">AI Tutor & Quiz</button>
  </div>

  <div id="error-container" class="error-box">
    <div id="error-text"></div>
    <button class="btn" style="margin-top:10px;" onclick="setApiKey()">Configure API Key</button>
  </div>

  <!-- OVERVIEW TAB -->
  <div id="tab-overview" class="tab-content active">
    <div class="dashboard-layout">
      <div class="left-col">
        <!-- Suggestions Card -->
        <div class="card">
          <h3 style="margin-top: 0; margin-bottom: 16px;">Next Learning Steps</h3>
          <div id="suggestionsList">
            <div style="color:var(--text-muted); font-size:13px;">Complete your first topic to unlock suggestions.</div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top: 0; margin-bottom: 16px;">Progress Status</h3>
          <div style="position: relative; width: 100%; height: 240px;">
            <canvas id="progressChart"></canvas>
          </div>
        </div>
      </div>

      <div class="tracks-container" id="tracksContainer">
        <!-- Dynamically Rendered Tracks -->
      </div>
    </div>
  </div>

  <!-- AI TUTOR TAB -->
  <div id="tab-ai-tutor" class="tab-content">
    <div class="card">
      <div class="ai-panel-header">
        <h2 id="ai-topic-title" style="margin: 0; font-size:22px; color:var(--primary-color);">Select a Topic</h2>
        <div>
          <button class="btn btn-secondary" id="explain-btn" onclick="triggerExplain()" disabled>Explain Concept</button>
          <button class="btn btn-secondary" id="quiz-btn" onclick="triggerQuiz()" disabled>Start Quiz</button>
          <button class="btn btn-secondary" style="background-color:#993c1d; display:none;" id="stop-btn" onclick="stopStream()">Stop</button>
        </div>
      </div>

      <!-- Inner tabs for Explain vs Quiz -->
      <div id="explain-view">
        <div class="spinner" id="explain-spinner">Tutor is thinking...</div>
        <div class="ai-stream" id="explain-text">Click any topic card on the Overview page or select Explain above.</div>
      </div>

      <div id="quiz-view" style="display: none;">
        <div class="spinner" id="quiz-spinner">Generating quiz...</div>
        <div class="quiz-form" id="quiz-container">
          <div style="color:var(--text-muted);">No quiz generated. Select a topic and click "Start Quiz".</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let myChart = null;
    let currentTopicId = '';
    let currentTopicLabel = '';
    let generatedQuiz = [];

    function resetProgress() {
      vscode.postMessage({ command: 'reset' });
    }

    function setApiKey() {
      vscode.postMessage({ command: 'setKey' });
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.toLowerCase().includes(tabId.split('-')[0]));
      if (activeBtn) activeBtn.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
    }

    function selectTopicForAI(id, label) {
      currentTopicId = id;
      currentTopicLabel = label;
      document.getElementById('ai-topic-title').innerText = label;
      document.getElementById('explain-btn').removeAttribute('disabled');
      document.getElementById('quiz-btn').removeAttribute('disabled');
      
      switchTab('ai-tutor');
      triggerExplain();
    }

    function triggerExplain() {
      if (!currentTopicId) return;
      document.getElementById('explain-view').style.display = 'block';
      document.getElementById('quiz-view').style.display = 'none';
      vscode.postMessage({ command: 'explain', topicId: currentTopicId });
    }

    function triggerQuiz() {
      if (!currentTopicId) return;
      document.getElementById('explain-view').style.display = 'none';
      document.getElementById('quiz-view').style.display = 'block';
      vscode.postMessage({ command: 'quiz', topicId: currentTopicId });
    }

    function stopStream() {
      vscode.postMessage({ command: 'stop' });
    }

    function submitAnswer(qIndex, question, correctAnswer) {
      const userAnswer = document.getElementById('user-ans-' + qIndex).value;
      if (!userAnswer.trim()) return;

      document.getElementById('submit-btn-' + qIndex).disabled = true;
      vscode.postMessage({
        command: 'checkAnswer',
        topicId: currentTopicId,
        question: question,
        correctAnswer: correctAnswer,
        userAnswer: userAnswer,
        qIndex: qIndex
      });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          const { covered, tracks } = message;
          renderDashboard(covered, tracks);
          break;

        case 'suggestions':
          renderSuggestions(message.suggestions);
          break;

        case 'stream_start':
          document.getElementById('error-container').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'inline-block';
          
          if (message.mode === 'explain') {
            document.getElementById('explain-spinner').style.display = 'block';
            document.getElementById('explain-text').innerText = '';
          } else {
            document.getElementById('quiz-spinner').style.display = 'block';
            document.getElementById('quiz-container').innerHTML = '';
          }
          break;

        case 'token':
          document.getElementById('explain-text').innerText += message.content;
          break;

        case 'quiz_data':
          generatedQuiz = message.quiz;
          renderQuiz(message.quiz);
          break;

        case 'stream_end':
          document.getElementById('explain-spinner').style.display = 'none';
          document.getElementById('quiz-spinner').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'none';
          break;

        case 'grading_start':
          const gradeBox = document.getElementById('grading-' + message.qIndex);
          gradeBox.style.display = 'block';
          gradeBox.innerText = 'Evaluating your answer...';
          break;

        case 'grading_result':
          const resultBox = document.getElementById('grading-' + message.qIndex);
          resultBox.style.display = 'block';
          resultBox.innerText = message.feedback;
          document.getElementById('submit-btn-' + message.qIndex).removeAttribute('disabled');
          break;

        case 'error':
          document.getElementById('explain-spinner').style.display = 'none';
          document.getElementById('quiz-spinner').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'none';

          const errBox = document.getElementById('error-container');
          errBox.style.display = 'block';
          
          if (message.message === 'API_KEY_MISSING') {
            document.getElementById('error-text').innerHTML = '<b>API Key Required</b><br/>Configure your Groq API key to activate AI features.';
          } else {
            document.getElementById('error-text').innerText = message.message;
          }
          break;
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
        chartColors.push(track.id === 'javascript' ? '#f55036' : (track.id === 'node' ? '#534ab7' : '#10b981'));

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
          topicCard.onclick = () => selectTopicForAI(topic.id, topic.label);
          
          topicCard.innerHTML = \`
            <span>\${topic.label}</span>
            <span class="status-icon \${isDone ? 'completed' : 'pending'}"></span>
          \`;
          grid.appendChild(topicCard);
        });

        section.appendChild(grid);
        container.appendChild(section);
      });

      updateChart(chartLabels, chartData, chartColors);
    }

    function renderSuggestions(list) {
      const container = document.getElementById('suggestionsList');
      if (!list || list.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No suggestions available or API key not set.</div>';
        return;
      }

      container.innerHTML = '';
      list.forEach(s => {
        const item = document.createElement('div');
        item.className = 'suggestion-card';
        item.innerHTML = \`
          <div>
            <div style="font-weight:600; font-size:14px;">\${s.label}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">\${s.reason}</div>
          </div>
          <button class="btn" style="padding:4px 8px; font-size:11px;" onclick="selectTopicForAI('\${s.id}', '\${s.label}')">Learn</button>
        \`;
        container.appendChild(item);
      });
    }

    function renderQuiz(quizList) {
      const container = document.getElementById('quiz-container');
      container.innerHTML = '';

      quizList.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-q';
        qDiv.innerHTML = \`
          <div style="font-weight:600; font-size:14px;">Q\${index+1}: \${q.question}</div>
          <input type="text" id="user-ans-\${index}" placeholder="Type your answer here..." />
          <div style="margin-top:8px;">
            <button class="btn" style="padding:4px 10px; font-size:11px;" id="submit-btn-\${index}" onclick="submitAnswer(\${index}, \\\`\${q.question.replace(/'/g, "\\\\'")}\\\`, \\\`\${q.answer.replace(/'/g, "\\\\'")}\\\`)">Check Answer</button>
          </div>
          <div class="grading-box" id="grading-\${index}" style="display:none;"></div>
        \`;
        container.appendChild(qDiv);
      });
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
              barThickness: 24
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) { return context.parsed.y + '% Completed'; }
                }
              }
            },
            scales: {
              x: {
                grid: { color: gridColor },
                ticks: { color: textColor }
              },
              y: {
                min: 0,
                max: 100,
                grid: { color: gridColor },
                ticks: {
                  color: textColor,
                  stepSize: 20,
                  callback: function(value) { return value + '%'; }
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
