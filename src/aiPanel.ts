import * as vscode from 'vscode';
import { DevMapStore } from './store';
import { PromptBuilder } from './promptBuilder';
import { GroqService } from './groqService';
import { AICache } from './cache';
import * as topicsData from '../data/topics.json';

export class AIPanel {
  public static currentPanel: AIPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _abortController: AbortController | null = null;
  private _currentTopicId = '';

  public static createOrShow(extensionUri: vscode.Uri, topicId: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AIPanel.currentPanel) {
      AIPanel.currentPanel._panel.reveal(column);
      AIPanel.currentPanel.loadTopic(topicId);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'devmap.aiPanel',
      'DevMap AI Tutor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    AIPanel.currentPanel = new AIPanel(panel, extensionUri, topicId);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, topicId: string) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial HTML
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for panel closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'explain':
            await this.explainTopic(message.topicId);
            break;
          case 'quiz':
            await this.startQuiz(message.topicId);
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

    this.loadTopic(topicId);
  }

  public dispose() {
    AIPanel.currentPanel = undefined;
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

  private async loadTopic(topicId: string) {
    this._currentTopicId = topicId;
    const topic = this.findTopic(topicId);
    if (!topic) { return; }

    this._panel.webview.postMessage({
      type: 'initTopic',
      topic: {
        id: topic.id,
        label: topic.label,
        docsUrl: topic.docsUrl,
        isCovered: DevMapStore.getInstance().getCoveredTopics().has(topicId),
      },
    });

    await this.explainTopic(topicId);
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
    this._panel.webview.postMessage({ type: 'stream_start', mode: 'explain' });

    const topic = this.findTopic(topicId);
    if (!topic) {
      this._panel.webview.postMessage({ type: 'error', message: 'Topic not found.' });
      return;
    }

    const codeSnippet = DevMapStore.getInstance().getCodeSnippet(topicId) || '// Code snippet not scanned yet.';
    
    // Check Cache
    const cache = AICache.getInstance();
    const cachedExplanation = cache.getExplanation(topicId);
    if (cachedExplanation) {
      await cache.simulateStream(cachedExplanation, (token) => {
        this._panel.webview.postMessage({ type: 'token', content: token });
      });
      this._panel.webview.postMessage({ type: 'stream_end' });
      return;
    }

    // Call Groq
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
    this._panel.webview.postMessage({ type: 'stream_start', mode: 'quiz' });

    const topic = this.findTopic(topicId);
    if (!topic) {
      this._panel.webview.postMessage({ type: 'error', message: 'Topic not found.' });
      return;
    }

    const codeSnippet = DevMapStore.getInstance().getCodeSnippet(topicId) || '// Code snippet not scanned yet.';
    
    // Check cache
    const cache = AICache.getInstance();
    const cachedQuiz = cache.getQuiz(topicId);
    if (cachedQuiz) {
      this._panel.webview.postMessage({ type: 'quiz_data', quiz: cachedQuiz });
      this._panel.webview.postMessage({ type: 'stream_end' });
      return;
    }

    try {
      await cache.enforceCooldown();
      this._abortController = new AbortController();
      const prompt = PromptBuilder.buildQuizPrompt(topic.label, codeSnippet);
      
      const response = await GroqService.getInstance().getChatCompletion(prompt, this._abortController.signal);
      
      // Clean up response if it has markdown formatting
      let cleanJson = response.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
      }
      
      const quiz = JSON.parse(cleanJson);
      cache.setQuiz(topicId, quiz);
      this._panel.webview.postMessage({ type: 'quiz_data', quiz });
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

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevMap AI Tutor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --accent: #f55036;
      --card-bg: var(--vscode-welcomePage-buttonBackground, #2d2d2d);
      --card-fg: var(--vscode-welcomePage-buttonHoverBackground, #e5e5e5);
      --border: var(--vscode-widget-border, #454545);
      --font: var(--vscode-font-family, system-ui, sans-serif);
    }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      padding: 15px;
      margin: 0;
      line-height: 1.6;
    }
    h2 {
      margin-top: 0;
      color: var(--accent);
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .badge.covered {
      background-color: #0f6e56;
      color: white;
    }
    .badge.pending {
      background-color: #ba7517;
      color: white;
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 15px;
    }
    .card-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--accent);
    }
    .code-box {
      font-family: monospace;
      background-color: rgba(0,0,0,0.2);
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      margin-bottom: 15px;
      border: 1px solid var(--border);
    }
    button {
      background-color: var(--accent);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      margin-right: 8px;
      margin-bottom: 8px;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    button:disabled {
      background-color: #555;
      cursor: not-allowed;
    }
    .btn-secondary {
      background-color: #534ab7;
    }
    .btn-stop {
      background-color: #993c1d;
    }
    .spinner {
      display: none;
      margin: 10px 0;
      font-style: italic;
      color: var(--accent);
    }
    .error-container {
      display: none;
      background-color: rgba(153, 60, 29, 0.2);
      border: 1px solid #993c1d;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    .quiz-question {
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--border);
    }
    .quiz-question:last-child {
      border-bottom: none;
    }
    .reveal-btn {
      background-color: #185fa5;
      font-size: 0.85em;
      padding: 4px 8px;
    }
    .answer-box {
      display: none;
      background-color: rgba(15, 110, 86, 0.15);
      border-left: 3px solid #0f6e56;
      padding: 8px;
      margin-top: 8px;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h2 id="topic-title">Select a Topic</h2>
  <div id="topic-status" class="badge">Pending</div>

  <div id="error-box" class="error-container">
    <div id="error-message"></div>
    <button id="set-key-btn" style="margin-top:10px; display:none;">Configure API Key</button>
  </div>

  <div class="card">
    <div id="panel-mode-title" class="card-title">AI Explanation</div>
    <div id="stream-text" style="white-space: pre-wrap;">Select a topic in the sidebar to view details.</div>
    <div id="quiz-container" style="display: none;"></div>
    <div id="spinner" class="spinner">Thinking...</div>
  </div>

  <div>
    <button id="explain-btn" disabled>Explain Concept</button>
    <button id="quiz-btn" class="btn-secondary" disabled>Start Quiz</button>
    <button id="stop-btn" class="btn-stop" style="display: none;">Stop Stream</button>
    <button id="docs-btn" class="btn-secondary">Open Docs</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentTopicId = '';
    let currentDocsUrl = '';

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'initTopic':
          currentTopicId = message.topic.id;
          currentDocsUrl = message.topic.docsUrl;
          document.getElementById('topic-title').innerText = message.topic.label;
          
          const status = document.getElementById('topic-status');
          if (message.topic.isCovered) {
            status.innerText = '✓ Covered';
            status.className = 'badge covered';
          } else {
            status.innerText = 'Pending Match';
            status.className = 'badge pending';
          }
          
          document.getElementById('explain-btn').removeAttribute('disabled');
          document.getElementById('quiz-btn').removeAttribute('disabled');
          document.getElementById('error-box').style.display = 'none';
          document.getElementById('set-key-btn').style.display = 'none';
          break;

        case 'stream_start':
          document.getElementById('error-box').style.display = 'none';
          document.getElementById('spinner').style.display = 'block';
          document.getElementById('stop-btn').style.display = 'inline-block';
          document.getElementById('explain-btn').disabled = true;
          document.getElementById('quiz-btn').disabled = true;
          
          if (message.mode === 'explain') {
            document.getElementById('panel-mode-title').innerText = 'AI Explanation';
            document.getElementById('stream-text').style.display = 'block';
            document.getElementById('stream-text').innerText = '';
            document.getElementById('quiz-container').style.display = 'none';
          } else {
            document.getElementById('panel-mode-title').innerText = 'Interactive Quiz';
            document.getElementById('stream-text').style.display = 'none';
            document.getElementById('quiz-container').style.display = 'block';
            document.getElementById('quiz-container').innerHTML = '';
          }
          break;

        case 'token':
          document.getElementById('stream-text').innerText += message.content;
          break;

        case 'quiz_data':
          renderQuiz(message.quiz);
          break;

        case 'stream_end':
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'none';
          document.getElementById('explain-btn').removeAttribute('disabled');
          document.getElementById('quiz-btn').removeAttribute('disabled');
          break;

        case 'error':
          document.getElementById('spinner').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'none';
          document.getElementById('explain-btn').removeAttribute('disabled');
          document.getElementById('quiz-btn').removeAttribute('disabled');
          
          const errBox = document.getElementById('error-box');
          const errMsg = document.getElementById('error-message');
          const setKeyBtn = document.getElementById('set-key-btn');
          
          errBox.style.display = 'block';
          if (message.message === 'API_KEY_MISSING') {
            errMsg.innerHTML = '<b>API Key Required</b><br/>You must configure a Groq API Key to use the AI Tutor.';
            setKeyBtn.style.display = 'inline-block';
          } else {
            errMsg.innerText = message.message;
            setKeyBtn.style.display = 'none';
          }
          break;
      }
    });

    document.getElementById('explain-btn').addEventListener('click', () => {
      if (currentTopicId) {
        vscode.postMessage({ command: 'explain', topicId: currentTopicId });
      }
    });

    document.getElementById('quiz-btn').addEventListener('click', () => {
      if (currentTopicId) {
        vscode.postMessage({ command: 'quiz', topicId: currentTopicId });
      }
    });

    document.getElementById('stop-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'stop' });
    });

    document.getElementById('docs-btn').addEventListener('click', () => {
      if (currentDocsUrl) {
        window.open(currentDocsUrl);
      }
    });

    document.getElementById('set-key-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'setKey' });
    });

    function renderQuiz(quizList) {
      const container = document.getElementById('quiz-container');
      container.innerHTML = '';
      
      quizList.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question';
        
        const text = document.createElement('div');
        text.innerHTML = '<b>Q' + (index + 1) + ':</b> ' + q.question;
        qDiv.appendChild(text);
        
        const ansBtn = document.createElement('button');
        ansBtn.innerText = 'Show Answer';
        ansBtn.className = 'reveal-btn';
        ansBtn.style.marginTop = '8px';
        
        const ansBox = document.createElement('div');
        ansBox.className = 'answer-box';
        ansBox.innerHTML = '<b>Answer:</b> ' + q.answer;
        
        ansBtn.addEventListener('click', () => {
          if (ansBox.style.display === 'none' || !ansBox.style.display) {
            ansBox.style.display = 'block';
            ansBtn.innerText = 'Hide Answer';
          } else {
            ansBox.style.display = 'none';
            ansBtn.innerText = 'Show Answer';
          }
        });
        
        qDiv.appendChild(ansBtn);
        qDiv.appendChild(ansBox);
        container.appendChild(qDiv);
      });
    }
  </script>
</body>
</html>`;
  }
}
