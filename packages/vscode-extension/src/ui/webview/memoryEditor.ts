/**
 * Remember Me - 记忆搜索与浏览面板
 * 支持关键词搜索、项目筛选、标签筛选和对话历史浏览
 */

import * as vscode from 'vscode';
import { BaseWebview } from './baseWebview';
import type { Conversation, ProjectContext, Decision, Insight } from '../../types';
import { getStorage } from '../../memory/storage';

interface SearchResult {
  type: 'conversation' | 'decision' | 'insight' | 'terminology';
  title: string;
  content: string;
  project: string;
  date: string;
  tags?: string[];
}

export class MemoryEditorWebview extends BaseWebview {
  private searchQuery: string = '';
  private selectedProject: string = 'all';
  private selectedTag: string = 'all';
  private searchResults: SearchResult[] = [];
  private projectList: Array<{ id: string; name: string }> = [];
  private isSearching: boolean = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  show(): void {
    const panel = this.createOrShowPanel({
      viewType: 'rememberMe.memoryEditor',
      title: '🧠 记忆浏览器',
      column: vscode.ViewColumn.One,
    });
    this.loadProjects();
    panel.webview.html = this.getHtml(panel.webview);
  }

  private loadProjects(): void {
    const storage = getStorage();
    const projectsDir = storage.listDir('projects');
    this.projectList = projectsDir.map(id => {
      const ctx = storage.read<ProjectContext>('projects', id, 'context.json');
      return { id, name: ctx?.name || id };
    });
  }

  protected getHtml(webview: vscode.Webview): string {
    const projectOptions = this.projectList.map(p =>
      `<option value="${p.id}" ${this.selectedProject === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`
    ).join('');

    const tagOptions = [
      { value: 'all', label: '全部标签' },
      { value: '已确定', label: '✅ 已确定' },
      { value: '待确认', label: '⏳ 待确认' },
      { value: '已废弃', label: '❌ 已废弃' },
      { value: '决策', label: '📌 决策' },
      { value: '发现', label: '💡 发现' },
      { value: '修改', label: '📝 修改' },
    ].map(t =>
      `<option value="${t.value}" ${this.selectedTag === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    const resultsHtml = this.renderSearchResults();

    const contentHtml = `
      <h2>🔍 记忆搜索</h2>
      <p>搜索你的历史记忆、决策和对话。</p>

      <div class="card">
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="输入关键词搜索记忆..." value="${this.escapeHtml(this.searchQuery)}" oninput="scheduleInputSearch()" onkeydown="if(event.key==='Enter') doSearch()" />
        </div>
        <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
          <div style="flex: 1;">
            <label style="margin-bottom: var(--spacing-xs); display: block;">项目筛选</label>
            <select id="projectFilter" onchange="updateFilter()">
              <option value="all" ${this.selectedProject === 'all' ? 'selected' : ''}>全部项目</option>
              ${projectOptions}
            </select>
          </div>
          <div style="flex: 1;">
            <label style="margin-bottom: var(--spacing-xs); display: block;">标签筛选</label>
            <select id="tagFilter" onchange="updateFilter()">
              ${tagOptions}
            </select>
          </div>
        </div>
        <div class="btn-group" style="margin-top: var(--spacing-md); margin-bottom: 0;">
          <button class="btn btn-primary" onclick="doSearch()">🔍 搜索</button>
          <button class="btn btn-secondary" onclick="clearSearch()">清除</button>
        </div>
      </div>

      <div id="results-area" style="margin-top: var(--spacing-lg);">
        ${resultsHtml}
      </div>

      <script>
        window.handleExtensionMessage = function(message) {
          if (message.command === 'updateResults') {
            const el = document.getElementById('results-area');
            if (el) { el.innerHTML = message.html; }
          }
        };

        let searchTimer;
        function scheduleInputSearch() {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(doSearch, 300);
        }

        function doSearch() {
          clearTimeout(searchTimer);
          const keyword = document.getElementById('searchInput').value;
          postMessage('search', { query: keyword });
        }

        function updateFilter() {
          const project = document.getElementById('projectFilter').value;
          const tag = document.getElementById('tagFilter').value;
          postMessage('updateFilter', { project, tag });
        }

        function clearSearch() {
          document.getElementById('searchInput').value = '';
          document.getElementById('projectFilter').value = 'all';
          document.getElementById('tagFilter').value = 'all';
          postMessage('clearSearch');
        }

        function viewDetail(type, title) {
          postMessage('viewDetail', { type, title });
        }

        function copyToPrompt(content) {
          postMessage('copyToPrompt', { content });
        }
      </script>
    `;

    const styleCss = `
      .result-item {
        padding: var(--spacing-md);
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: var(--spacing-sm);
        transition: all 0.2s;
      }
      .result-item:hover {
        border-color: var(--accent);
      }
      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-sm);
      }
      .result-type {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 500;
        background: var(--bg-primary);
        border: 1px solid var(--border);
      }
      .result-type.conversation { color: #2196f3; border-color: #2196f3; }
      .result-type.decision { color: #4caf50; border-color: #4caf50; }
      .result-type.insight { color: #ff9800; border-color: #ff9800; }
      .result-type.terminology { color: #9c27b0; border-color: #9c27b0; }
      .result-title {
        font-weight: 600;
        margin-bottom: var(--spacing-xs);
      }
      .result-content {
        color: var(--fg-secondary);
        font-size: 0.9rem;
        line-height: 1.5;
      }
      .result-meta {
        display: flex;
        gap: var(--spacing-sm);
        margin-top: var(--spacing-sm);
        font-size: 0.8rem;
        color: var(--fg-secondary);
      }
      .result-actions {
        display: flex;
        gap: var(--spacing-xs);
        margin-top: var(--spacing-sm);
      }
      .stats-bar {
        display: flex;
        gap: var(--spacing-md);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-primary);
        border-radius: var(--radius);
        margin-bottom: var(--spacing-md);
        font-size: 0.85rem;
        color: var(--fg-secondary);
      }
      .stats-bar strong {
        color: var(--fg-primary);
      }
    `;

    return this.getBaseHtml(webview, contentHtml, styleCss);
  }

  private renderSearchResults(): string {
    if (this.isSearching) {
      return '<div class="empty-state"><p>🔍 搜索中...</p></div>';
    }

    if (this.searchQuery || this.selectedProject !== 'all' || this.selectedTag !== 'all') {
      if (this.searchResults.length === 0) {
        return `
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <p>未找到匹配的记忆</p>
            <p style="font-size: 0.9rem;">尝试其他关键词或筛选条件</p>
          </div>
        `;
      }

      const statsHtml = `
        <div class="stats-bar">
          <span>找到 <strong>${this.searchResults.length}</strong> 条结果</span>
          ${this.searchQuery ? `<span>关键词："${this.escapeHtml(this.searchQuery)}"</span>` : ''}
          ${this.selectedProject !== 'all' ? `<span>项目：${this.escapeHtml(this.getProjectName(this.selectedProject))}</span>` : ''}
        </div>
      `;

      const resultsList = this.searchResults.map(r => `
        <div class="result-item animate-in">
          <div class="result-header">
            <span class="result-type ${r.type}">${this.getTypeLabel(r.type)}</span>
            <span style="font-size: 0.8rem; color: var(--fg-secondary);">${r.date}</span>
          </div>
          <div class="result-title">${this.escapeHtml(r.title)}</div>
          <div class="result-content">${this.escapeHtml(r.content)}</div>
          <div class="result-meta">
            <span>📁 ${this.escapeHtml(r.project)}</span>
            ${r.tags?.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('') || ''}
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="viewDetail('${r.type}', '${this.escapeHtml(r.title)}')">查看详情</button>
            <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="copyToPrompt('${this.escapeHtml(r.content.replace(/'/g, "\\'"))}')">复制到提示</button>
          </div>
        </div>
      `).join('');

      return statsHtml + resultsList;
    }

    // 默认显示最近记忆概览
    return this.renderMemoryOverview();
  }

  private renderMemoryOverview(): string {
    const storage = getStorage();
    const recentConversations: Array<{ project: string; conv: Conversation }> = [];

    for (const project of this.projectList) {
      const convs = storage.listDir('projects', project.id, 'conversations');
      for (const convFile of convs.slice(-3)) {
        const conv = storage.read<Conversation>('projects', project.id, 'conversations', convFile);
        if (conv) {
          recentConversations.push({ project: project.name, conv });
        }
      }
    }

    // 按时间排序取最近 5 条
    recentConversations.sort((a, b) =>
      new Date(b.conv.updatedAt).getTime() - new Date(a.conv.updatedAt).getTime()
    );
    const recent = recentConversations.slice(0, 5);

    return `
      <div class="stats-bar">
        <span>📁 <strong>${this.projectList.length}</strong> 个项目</span>
        <span>💬 <strong>${recentConversations.length}</strong> 条对话</span>
      </div>

      <h3 style="margin-bottom: var(--spacing-md);">📅 最近活动</h3>
      ${recent.length > 0 ? recent.map(r => `
        <div class="result-item animate-in">
          <div class="result-header">
            <span class="result-type conversation">对话</span>
            <span style="font-size: 0.8rem; color: var(--fg-secondary);">${this.formatDate(r.conv.updatedAt)}</span>
          </div>
          <div class="result-title">${this.escapeHtml(r.conv.title)}</div>
          <div class="result-content">${r.conv.messages.length} 条消息 · ${r.conv.keyDecisions.length} 个决策</div>
          <div class="result-meta">
            <span>📁 ${this.escapeHtml(r.project)}</span>
            ${r.conv.tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      `).join('') : `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>暂无最近活动</p>
          <p style="font-size: 0.9rem;">开始与 AI 对话，记忆将自动记录在这里</p>
        </div>
      `}
    `;
  }

  private performSearch(): void {
    this.isSearching = true;
    this.searchResults = [];

    const storage = getStorage();
    const query = this.searchQuery.toLowerCase().trim();

    for (const project of this.projectList) {
      if (this.selectedProject !== 'all' && this.selectedProject !== project.id) {
        continue;
      }

      const projectCtx = storage.read<ProjectContext>('projects', project.id, 'context.json');
      if (!projectCtx) {
        continue;
      }

      // 搜索决策
      for (const decision of projectCtx.decisions || []) {
        if (this.matchesSearch(decision, query) && this.matchesTag(decision.status)) {
          this.searchResults.push({
            type: 'decision',
            title: decision.title,
            content: decision.description,
            project: project.name,
            date: this.formatDate(decision.createdAt),
            tags: [decision.status],
          });
        }
      }

      // 搜索术语
      for (const term of projectCtx.terminology || []) {
        if (this.matchesSearch(term, query)) {
          this.searchResults.push({
            type: 'terminology',
            title: term.term,
            content: term.definition,
            project: project.name,
            date: '',
          });
        }
      }

      // 搜索对话
      const convs = storage.listDir('projects', project.id, 'conversations');
      for (const convFile of convs) {
        const conv = storage.read<Conversation>('projects', project.id, 'conversations', convFile);
        if (!conv) {
          continue;
        }

        const match = conv.title.toLowerCase().includes(query) ||
          conv.messages.some(m => m.content.toLowerCase().includes(query));

        if (match && this.matchesTagFilters(conv.tags)) {
          const preview = conv.messages[0]?.content.substring(0, 200) || '';
          this.searchResults.push({
            type: 'conversation',
            title: conv.title,
            content: preview,
            project: project.name,
            date: this.formatDate(conv.updatedAt),
            tags: conv.tags,
          });
        }

        // 搜索洞察
        for (const insight of conv.insights || []) {
          if (this.matchesSearch(insight, query) && this.matchesTag(insight.category)) {
            this.searchResults.push({
              type: 'insight',
              title: `洞察：${insight.category}`,
              content: insight.content,
              project: project.name,
              date: this.formatDate(insight.createdAt),
              tags: [insight.category],
            });
          }
        }
      }
    }

    this.isSearching = false;
  }

  private matchesSearch(item: { title?: string; description?: string; term?: string; definition?: string; content?: string }, query: string): boolean {
    if (!query) {
      return true;
    }
    const text = `${item.title || ''} ${item.description || ''} ${item.term || ''} ${item.definition || ''} ${item.content || ''}`.toLowerCase();
    return text.includes(query);
  }

  private matchesTag(tag: string): boolean {
    if (this.selectedTag === 'all') {
      return true;
    }
    return tag === this.selectedTag;
  }

  private matchesTagFilters(tags: string[]): boolean {
    if (this.selectedTag === 'all') {
      return true;
    }
    return tags.includes(this.selectedTag);
  }

  private getTypeLabel(type: SearchResult['type']): string {
    const labels: Record<SearchResult['type'], string> = {
      conversation: '💬 对话',
      decision: '📌 决策',
      insight: '💡 洞察',
      terminology: '📖 术语',
    };
    return labels[type];
  }

  private getProjectName(projectId: string): string {
    return this.projectList.find(p => p.id === projectId)?.name || projectId;
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  private escapeHtml(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  protected handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const msg = message as Record<string, unknown>;

    switch (msg.command) {
      case 'search':
        this.searchQuery = (msg.query as string) || '';
        this.scheduleRefresh();
        break;

      case 'updateFilter':
        this.selectedProject = (msg.project as string) || 'all';
        this.selectedTag = (msg.tag as string) || 'all';
        this.scheduleRefresh();
        break;

      case 'clearSearch':
        this.searchQuery = '';
        this.selectedProject = 'all';
        this.selectedTag = 'all';
        this.searchResults = [];
        this.refreshResults();
        break;

      case 'viewDetail':
        vscode.window.showInformationMessage(`查看详情：${msg.title} (${msg.type})`);
        break;

      case 'copyToPrompt':
        vscode.env.clipboard.writeText(msg.content as string);
        void vscode.window.showInformationMessage('✅ 已复制到剪贴板');
        break;

      case 'close':
        this.panel?.dispose();
        break;
    }
  }

  /**
   * 防抖刷新：避免每次按键都全量重新渲染 HTML
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refreshResults(), 250);
  }

  /**
   * 仅更新结果区域，保留输入框焦点和滚动位置
   */
  private refreshResults(): void {
    this.isSearching = true;
    this.performSearch();
    this.isSearching = false;
    this.postMessage({
      command: 'updateResults',
      html: this.renderSearchResults(),
    });
  }
}
