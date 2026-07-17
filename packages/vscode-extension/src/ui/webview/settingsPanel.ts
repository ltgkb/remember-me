/**
 * Remember Me - 设置向导面板（Webview）
 * 提供首次使用的 3 分钟问卷式设置向导
 * 支持个人画像配置、项目创建、AI 提供商设置
 */

import * as vscode from 'vscode';
import type { JsonStorage } from '../../memory/storage';
import type { Profile, IdentityInfo, StyleInfo, ProjectContext } from '../../types';

export class SettingsPanelWebview {
  public static currentPanel: SettingsPanelWebview | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly storage: JsonStorage;
  private readonly onRefresh: (() => void) | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    storage: JsonStorage,
    initialTab: string,
    onRefresh?: () => void
  ) {
    this.panel = panel;
    this.storage = storage;
    this.onRefresh = onRefresh;

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, extensionUri);

    this.panel.webview.onDidReceiveMessage(
      async (message) => this.handleMessage(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(
      () => this.dispose(),
      null,
      this.disposables
    );

    // 初始加载数据并切换标签
    void this.loadInitialData(initialTab);
  }

  /**
   * 创建或显示设置面板
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    storage: JsonStorage,
    initialTab: string = 'welcome',
    onRefresh?: () => void
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanelWebview.currentPanel) {
      SettingsPanelWebview.currentPanel.panel.reveal(column);
      void SettingsPanelWebview.currentPanel.panel.webview.postMessage({
        command: 'switchTab',
        tab: initialTab
      });
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'rememberMeSettings',
      'Remember Me - 设置',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    SettingsPanelWebview.currentPanel = new SettingsPanelWebview(
      panel,
      extensionUri,
      storage,
      initialTab,
      onRefresh
    );
  }

  /**
   * 加载初始数据
   */
  private async loadInitialData(initialTab: string): Promise<void> {
    // 发送已有数据（如果有）
    const profile = this.storage.read<Profile>('profile.json');
    await this.panel.webview.postMessage({
      command: 'profileData',
      data: profile
    });

    await this.panel.webview.postMessage({
      command: 'switchTab',
      tab: initialTab
    });
  }

  /**
   * 处理 Webview 发来的消息
   */
  private async handleMessage(message: unknown): Promise<void> {
    const msg = message as { command: string; data?: Record<string, unknown> };

    switch (msg.command) {
      case 'saveProfile':
        await this.saveProfile(msg.data);
        break;
      case 'saveProject':
        await this.saveProject(msg.data);
        break;
      case 'close':
        this.panel.dispose();
        break;
    }
  }

  /**
   * 保存个人画像
   */
  private async saveProfile(data?: Record<string, unknown>): Promise<void> {
    if (!data) {
      await this.panel.webview.postMessage({ command: 'saveError', type: 'profile' });
      return;
    }

    const now = new Date().toISOString();
    const existing = this.storage.read<Profile>('profile.json');

    const identity: IdentityInfo = {
      role: (data.role as IdentityInfo['role']) || '其他',
      experience: (data.experience as IdentityInfo['experience']) || '新手',
      industry: (data.industry as IdentityInfo['industry']) || '其他',
      background: (data.background as IdentityInfo['background']) || '其他'
    };

    const style: StyleInfo = {
      documentStructure: (data.documentStructure as StyleInfo['documentStructure']) || '先背景后功能',
      detailLevel: (data.detailLevel as StyleInfo['detailLevel']) || '标准（3-5页）',
      language: (data.language as StyleInfo['language']) || '中文',
      tone: (data.tone as StyleInfo['tone']) || '正式',
      specialHabits: Array.isArray(data.specialHabits) ? data.specialHabits as string[] : [],
      responseStyle: (data.responseStyle as StyleInfo['responseStyle']) || '先框架再细节'
    };

    const profile: Profile = existing
      ? { ...existing, identity, style, updatedAt: now }
      : {
          id: `profile-${Date.now()}`,
          createdAt: now,
          updatedAt: now,
          identity,
          style
        };

    const success = this.storage.write(profile, 'profile.json');

    if (success) {
      await this.panel.webview.postMessage({ command: 'saveSuccess', type: 'profile' });
      void vscode.window.showInformationMessage('✅ 个人画像已保存');
      this.onRefresh?.();
    } else {
      await this.panel.webview.postMessage({ command: 'saveError', type: 'profile' });
      void vscode.window.showErrorMessage('❌ 个人画像保存失败');
    }
  }

  /**
   * 保存项目上下文
   */
  private async saveProject(data?: Record<string, unknown>): Promise<void> {
    if (!data) {
      await this.panel.webview.postMessage({ command: 'saveError', type: 'project' });
      return;
    }

    const name = String(data.name || '').trim();
    if (!name) {
      void vscode.window.showWarningMessage('项目名称不能为空');
      return;
    }

    const now = new Date().toISOString();

    const project: ProjectContext = {
      id: `proj-${Date.now()}`,
      name,
      createdAt: now,
      updatedAt: now,
      targetUsers: String(data.targetUsers || ''),
      coreFeatures: String(data.coreFeatures || ''),
      decisions: [],
      terminology: [],
      competitors: String(data.competitors || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    };

    const success = this.storage.write(project, 'projects', name, 'context.json');

    if (success) {
      await this.panel.webview.postMessage({ command: 'saveSuccess', type: 'project' });
      void vscode.window.showInformationMessage(`✅ 项目 "${name}" 已创建`);
      this.onRefresh?.();
    } else {
      await this.panel.webview.postMessage({ command: 'saveError', type: 'project' });
      void vscode.window.showErrorMessage('❌ 项目创建失败');
    }
  }

  /**
   * 生成 Webview HTML
   */
  private getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = this.getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Remember Me - 设置</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --border: var(--vscode-input-border, #3c3c3c);
      --focus-border: var(--vscode-focusBorder, #007fd4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto);
      background: var(--bg);
      color: var(--fg);
      padding: 24px;
      line-height: 1.6;
      max-width: 720px;
      margin: 0 auto;
    }
    h1 { font-size: 1.5em; margin-bottom: 4px; }
    .subtitle { opacity: 0.7; margin-bottom: 20px; font-size: 0.95em; }
    .tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      opacity: 0.6;
      transition: all 0.2s;
      font-size: 0.9em;
      user-select: none;
    }
    .tab:hover { opacity: 0.9; }
    .tab.active { opacity: 1; border-bottom-color: var(--accent); font-weight: 600; }
    .tab-content { display: none; animation: fadeIn 0.2s ease; }
    .tab-content.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .form-group { margin-bottom: 18px; }
    label { display: block; margin-bottom: 6px; font-weight: 500; font-size: 0.95em; }
    select, input[type="text"], textarea {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.95em;
      outline: none;
      transition: border-color 0.2s;
    }
    select:focus, input[type="text"]:focus, textarea:focus {
      border-color: var(--focus-border);
    }
    textarea { min-height: 80px; resize: vertical; }
    .checkbox-group {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
      margin-top: 8px;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 4px 0;
    }
    .checkbox-item input { cursor: pointer; }
    button {
      padding: 10px 24px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95em;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .msg {
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.9em;
      display: none;
    }
    .msg.success { background: rgba(76, 175, 80, 0.15); color: #4caf50; display: block; }
    .msg.error { background: rgba(244, 67, 54, 0.15); color: #f44336; display: block; }
    .progress-bar {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .welcome-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .welcome-card h3 { margin-bottom: 8px; }
    .welcome-card ul { margin-left: 20px; line-height: 2; }
    .welcome-card li { list-style: none; }
    .step-nav {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .hint {
      font-size: 0.85em;
      opacity: 0.6;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <h1>🧠 Remember Me</h1>
  <p class="subtitle">让 AI 记住你的风格、偏好和项目上下文</p>

  <nav class="tabs">
    <div class="tab active" data-tab="welcome" onclick="switchTab('welcome')">欢迎</div>
    <div class="tab" data-tab="profile" onclick="switchTab('profile')">个人画像</div>
    <div class="tab" data-tab="project" onclick="switchTab('project')">项目设置</div>
  </nav>

  <!-- ═════ 欢迎页 ═════ -->
  <section id="welcome" class="tab-content active">
    <div class="welcome-card">
      <h2>👋 欢迎使用 Remember Me</h2>
      <p style="margin: 12px 0;">首次使用只需 <strong>3 分钟</strong> 完成设置，AI 就能记住你：</p>
      <ul>
        <li>✅ 你的身份和背景</li>
        <li>✅ 你的写作风格和偏好</li>
        <li>✅ 当前项目的上下文</li>
      </ul>
      <p style="margin-top: 12px;">设置完成后，每次与 AI 对话都会自动注入你的记忆。</p>
    </div>
    <button onclick="switchTab('profile')">开始设置向导 →</button>
  </section>

  <!-- ═════ 个人画像 ═════ -->
  <section id="profile" class="tab-content">
    <div class="progress-bar"><div class="progress-fill" style="width: 50%"></div></div>
    <h2>你是谁？</h2>
    <p class="subtitle">让 AI 了解你的背景</p>

    <form id="profileForm" onsubmit="event.preventDefault(); saveProfile();">
      <div class="form-group">
        <label for="role">身份角色</label>
        <select id="role" required>
          <option value="产品经理">产品经理</option>
          <option value="运营">运营</option>
          <option value="设计师">设计师</option>
          <option value="学生">学生</option>
          <option value="创业者">创业者</option>
          <option value="管理者">管理者</option>
          <option value="其他">其他</option>
        </select>
      </div>

      <div class="form-group">
        <label for="experience">经验水平</label>
        <select id="experience" required>
          <option value="新手">新手</option>
          <option value="1-3年">1-3年</option>
          <option value="3-5年">3-5年</option>
          <option value="5年以上">5年以上</option>
        </select>
      </div>

      <div class="form-group">
        <label for="industry">行业领域</label>
        <select id="industry" required>
          <option value="电商">电商</option>
          <option value="SaaS">SaaS</option>
          <option value="社交">社交</option>
          <option value="金融">金融</option>
          <option value="教育">教育</option>
          <option value="医疗">医疗</option>
          <option value="其他">其他</option>
        </select>
      </div>

      <div class="form-group">
        <label for="background">专业背景</label>
        <select id="background" required>
          <option value="技术">技术</option>
          <option value="商业">商业</option>
          <option value="设计">设计</option>
          <option value="文科">文科</option>
          <option value="其他">其他</option>
        </select>
      </div>

      <h3 style="margin-top: 28px; margin-bottom: 8px;">写作风格</h3>

      <div class="form-group">
        <label for="documentStructure">文档结构偏好</label>
        <select id="documentStructure">
          <option value="先背景后功能">先背景后功能</option>
          <option value="先功能后背景">先功能后背景</option>
          <option value="自由结构">自由结构</option>
        </select>
      </div>

      <div class="form-group">
        <label for="detailLevel">详细程度</label>
        <select id="detailLevel">
          <option value="简洁（1页）">简洁（1页）</option>
          <option value="标准（3-5页）" selected>标准（3-5页）</option>
          <option value="详尽（10页以上）">详尽（10页以上）</option>
        </select>
      </div>

      <div class="form-group">
        <label for="language">语言</label>
        <select id="language">
          <option value="中文" selected>中文</option>
          <option value="英文">英文</option>
          <option value="双语">双语</option>
        </select>
      </div>

      <div class="form-group">
        <label for="tone">语气</label>
        <select id="tone">
          <option value="正式">正式</option>
          <option value="口语化">口语化</option>
          <option value="学术">学术</option>
        </select>
      </div>

      <div class="form-group">
        <label for="responseStyle">回复风格</label>
        <select id="responseStyle">
          <option value="先框架再细节">先框架再细节</option>
          <option value="直接完整内容">直接完整内容</option>
          <option value="逐步引导">逐步引导</option>
        </select>
      </div>

      <div class="form-group">
        <label>特殊习惯（多选）</label>
        <div class="checkbox-group">
          <label class="checkbox-item"><input type="checkbox" value="MoSCoW优先级"> MoSCoW 优先级</label>
          <label class="checkbox-item"><input type="checkbox" value="用户旅程图"> 用户旅程图</label>
          <label class="checkbox-item"><input type="checkbox" value="竞品对比"> 竞品对比</label>
          <label class="checkbox-item"><input type="checkbox" value="财务预测"> 财务预测</label>
          <label class="checkbox-item"><input type="checkbox" value="引用格式规范"> 引用格式规范</label>
          <label class="checkbox-item"><input type="checkbox" value="验收标准"> 验收标准</label>
        </div>
      </div>

      <div class="step-nav">
        <button type="submit">保存个人画像</button>
        <button type="button" class="secondary" onclick="switchTab('project')">跳过，去设置项目 →</button>
      </div>

      <div id="profileMsg" class="msg"></div>
    </form>
  </section>

  <!-- ═════ 项目设置 ═════ -->
  <section id="project" class="tab-content">
    <div class="progress-bar"><div class="progress-fill" style="width: 100%"></div></div>
    <h2>你在做什么项目？</h2>
    <p class="subtitle">让 AI 了解你的工作上下文</p>

    <form id="projectForm" onsubmit="event.preventDefault(); saveProject();">
      <div class="form-group">
        <label for="projectName">项目名称 *</label>
        <input type="text" id="projectName" placeholder="例如：TeamFlow" required>
      </div>

      <div class="form-group">
        <label for="targetUsers">目标用户</label>
        <input type="text" id="targetUsers" placeholder="例如：企业管理员、B端用户">
      </div>

      <div class="form-group">
        <label for="coreFeatures">核心功能</label>
        <textarea id="coreFeatures" placeholder="描述项目的核心功能，用简洁的语言..."></textarea>
      </div>

      <div class="form-group">
        <label for="competitors">主要竞品（用逗号分隔）</label>
        <input type="text" id="competitors" placeholder="例如：Slack, 飞书, Notion">
      </div>

      <div class="step-nav">
        <button type="submit">创建项目</button>
        <button type="button" class="secondary" onclick="switchTab('welcome')">← 返回欢迎</button>
      </div>

      <div id="projectMsg" class="msg"></div>
    </form>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // 标签切换
    function switchTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tabEl = document.querySelector('[data-tab="' + tabId + '"]');
      if (tabEl) tabEl.classList.add('active');
      const contentEl = document.getElementById(tabId);
      if (contentEl) contentEl.classList.add('active');
    }

    // 收集表单数据
    function getProfileData() {
      const habits = [];
      document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        habits.push(cb.value);
      });
      return {
        role: document.getElementById('role').value,
        experience: document.getElementById('experience').value,
        industry: document.getElementById('industry').value,
        background: document.getElementById('background').value,
        documentStructure: document.getElementById('documentStructure').value,
        detailLevel: document.getElementById('detailLevel').value,
        language: document.getElementById('language').value,
        tone: document.getElementById('tone').value,
        responseStyle: document.getElementById('responseStyle').value,
        specialHabits: habits
      };
    }

    function getProjectData() {
      return {
        name: document.getElementById('projectName').value.trim(),
        targetUsers: document.getElementById('targetUsers').value.trim(),
        coreFeatures: document.getElementById('coreFeatures').value.trim(),
        competitors: document.getElementById('competitors').value.trim()
      };
    }

    // 保存操作
    function saveProfile() {
      showMsg('profileMsg', '');
      vscode.postMessage({ command: 'saveProfile', data: getProfileData() });
    }

    function saveProject() {
      showMsg('projectMsg', '');
      vscode.postMessage({ command: 'saveProject', data: getProjectData() });
    }

    // 消息显示
    function showMsg(id, text, isError) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'msg' + (text ? (isError ? ' error' : ' success') : '');
    }

    // 接收 VS Code 消息
    window.addEventListener('message', event => {
      const msg = event.data;
      if (!msg || !msg.command) return;

      switch (msg.command) {
        case 'saveSuccess':
          showMsg(msg.type + 'Msg', '✅ 保存成功', false);
          setTimeout(() => showMsg(msg.type + 'Msg', ''), 3000);
          break;
        case 'saveError':
          showMsg(msg.type + 'Msg', '❌ 保存失败，请重试', true);
          break;
        case 'switchTab':
          if (msg.tab) switchTab(msg.tab);
          break;
        case 'profileData':
          if (msg.data) populateProfile(msg.data);
          break;
      }
    });

    // 回填已有数据
    function populateProfile(profile) {
      if (!profile) return;
      const ids = ['role', 'experience', 'industry', 'background', 'documentStructure',
        'detailLevel', 'language', 'tone', 'responseStyle'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && profile.identity && profile.identity[id] !== undefined) {
          el.value = profile.identity[id];
        } else if (el && profile.style && profile.style[id] !== undefined) {
          el.value = profile.style[id];
        }
      });
      if (profile.style && Array.isArray(profile.style.specialHabits)) {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = profile.style.specialHabits.includes(cb.value);
        });
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * 生成 CSP nonce
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    SettingsPanelWebview.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
