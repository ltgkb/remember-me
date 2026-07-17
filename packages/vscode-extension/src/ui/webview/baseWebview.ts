/**
 * Remember Me - Webview 基础类
 * 封装 VS Code WebviewPanel 的通用创建和管理逻辑
 */

import * as vscode from 'vscode';

export interface WebviewOptions {
  readonly viewType: string;
  readonly title: string;
  readonly column?: vscode.ViewColumn;
  readonly enableScripts?: boolean;
  readonly retainContextWhenHidden?: boolean;
  readonly localResourceRoots?: vscode.Uri[];
}

export abstract class BaseWebview {
  protected panel: vscode.WebviewPanel | undefined;
  protected context: vscode.ExtensionContext;
  protected disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 创建或显示 Webview 面板
   */
  protected createOrShowPanel(options: WebviewOptions): vscode.WebviewPanel {
    const column = options.column || vscode.ViewColumn.One;

    // 如果面板已存在，则显示它
    if (this.panel) {
      this.panel.reveal(column);
      return this.panel;
    }

    // 创建新面板
    this.panel = vscode.window.createWebviewPanel(
      options.viewType,
      options.title,
      column,
      {
        enableScripts: options.enableScripts ?? true,
        retainContextWhenHidden: options.retainContextWhenHidden ?? true,
        localResourceRoots: options.localResourceRoots,
      }
    );

    // 面板关闭时清理资源
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.dispose();
      },
      null,
      this.disposables
    );

    // 处理来自 Webview 的消息
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => this.handleMessage(message),
      null,
      this.disposables
    );

    return this.panel;
  }

  /**
   * 生成基础 HTML 模板
   */
  protected getBaseHtml(webview: vscode.Webview, contentHtml: string, styleCss: string = ''): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remember Me</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background, #1e1e1e);
      --bg-secondary: var(--vscode-panel-background, #252526);
      --fg-primary: var(--vscode-foreground, #cccccc);
      --fg-secondary: var(--vscode-descriptionForeground, #858585);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
      --border: var(--vscode-panel-border, #3c3c3c);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --info: #2196f3;
      --radius: 6px;
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      --spacing-xl: 32px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.6;
      color: var(--fg-primary);
      background: var(--bg-primary);
      padding: var(--spacing-lg);
    }

    h1, h2, h3, h4 {
      font-weight: 600;
      margin-bottom: var(--spacing-md);
      color: var(--fg-primary);
    }

    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.25rem; }
    h3 { font-size: 1.1rem; }
    h4 { font-size: 1rem; }

    p {
      margin-bottom: var(--spacing-md);
      color: var(--fg-secondary);
    }

    .container {
      max-width: 720px;
      margin: 0 auto;
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--spacing-lg);
      margin-bottom: var(--spacing-lg);
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: var(--spacing-md);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .form-group {
      margin-bottom: var(--spacing-md);
    }

    label {
      display: block;
      margin-bottom: var(--spacing-xs);
      font-weight: 500;
      color: var(--fg-primary);
    }

    input[type="text"],
    input[type="url"],
    textarea,
    select {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    input:focus,
    textarea:focus,
    select:focus {
      border-color: var(--accent);
    }

    textarea {
      resize: vertical;
      min-height: 80px;
    }

    select {
      cursor: pointer;
    }

    .checkbox-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.2s;
    }

    .checkbox-item:hover {
      border-color: var(--accent);
    }

    .checkbox-item.checked {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .checkbox-item input {
      display: none;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      border: none;
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      outline: none;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: transparent;
      color: var(--fg-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-primary);
      border-color: var(--accent);
    }

    .btn-group {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-success { background: rgba(76, 175, 80, 0.2); color: var(--success); }
    .badge-warning { background: rgba(255, 152, 0, 0.2); color: var(--warning); }
    .badge-error { background: rgba(244, 67, 54, 0.2); color: var(--error); }
    .badge-info { background: rgba(33, 150, 243, 0.2); color: var(--info); }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-radius: var(--radius);
      margin-bottom: var(--spacing-md);
    }

    .alert-success { background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success); }
    .alert-warning { background: rgba(255, 152, 0, 0.1); border: 1px solid var(--warning); }
    .alert-error { background: rgba(244, 67, 54, 0.1); border: 1px solid var(--error); }
    .alert-info { background: rgba(33, 150, 243, 0.1); border: 1px solid var(--info); }

    .hidden { display: none !important; }

    .step-indicator {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-xl);
      padding: var(--spacing-md);
      background: var(--bg-secondary);
      border-radius: var(--radius);
    }

    .step-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--bg-primary);
      border: 2px solid var(--border);
      color: var(--fg-secondary);
    }

    .step-dot.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .step-dot.completed {
      background: var(--success);
      border-color: var(--success);
      color: white;
    }

    .step-line {
      flex: 1;
      height: 2px;
      background: var(--border);
      max-width: 40px;
    }

    .step-line.completed {
      background: var(--success);
    }

    .memory-item {
      padding: var(--spacing-md);
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: var(--spacing-sm);
    }

    .memory-item-title {
      font-weight: 600;
      margin-bottom: var(--spacing-xs);
    }

    .memory-item-meta {
      font-size: 0.85rem;
      color: var(--fg-secondary);
    }

    .tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      margin-right: var(--spacing-xs);
      margin-bottom: var(--spacing-xs);
    }

    .search-box {
      position: relative;
      margin-bottom: var(--spacing-lg);
    }

    .search-box input {
      padding-left: 36px;
    }

    .search-box::before {
      content: '🔍';
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.6;
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-xl);
      color: var(--fg-secondary);
    }

    .empty-state-icon {
      font-size: 3rem;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-in {
      animation: fadeIn 0.3s ease-out;
    }
  </style>
  ${styleCss ? `<style>${styleCss}</style>` : ''}
</head>
<body>
  <div class="container">
    ${contentHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    function postMessage(command, data = {}) {
      vscode.postMessage({ command, ...data });
    }

    // 监听来自扩展的消息
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (window.handleExtensionMessage) {
        window.handleExtensionMessage(message);
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * 向 Webview 发送消息
   */
  protected postMessage(message: unknown): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * 处理来自 Webview 的消息，子类需覆盖
   */
  protected abstract handleMessage(message: unknown): void;

  /**
   * 生成 Webview 的 HTML 内容，子类需覆盖
   */
  protected abstract getHtml(webview: vscode.Webview): string;

  /**
   * 显示面板
   */
  abstract show(): void;

  /**
   * 释放资源
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.panel?.dispose();
    this.panel = undefined;
  }
}
