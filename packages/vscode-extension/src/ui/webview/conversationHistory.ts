/**
 * Remember Me - 对话历史 Webview
 * 提供完整的对话历史浏览界面，支持项目分组、筛选、搜索和详情查看
 */

import * as vscode from 'vscode';
import { BaseWebview } from './baseWebview';
import type { Conversation, ChatMessage, Decision, Insight } from '../../types';
import { getConversationManager, type SearchResult } from '../../memory/conversation';
import { getProjectManager } from '../../memory/project';

/**
 * 对话筛选选项
 */
export interface ConversationFilterOptions {
  /** 项目名称 */
  projectName?: string;
  /** 标签列表 */
  tags?: string[];
  /** 开始日期（ISO 格式或 YYYY-MM-DD） */
  startDate?: string;
  /** 结束日期（ISO 格式或 YYYY-MM-DD） */
  endDate?: string;
  /** 关键词 */
  keyword?: string;
}

/**
 * 对话历史 Webview 类
 * 继承 BaseWebview，提供对话历史浏览界面
 */
export class ConversationHistoryWebview extends BaseWebview {
  /** 当前筛选条件 */
  protected currentFilter: ConversationFilterOptions;
  /** 当前选中的对话 ID */
  protected selectedConversationId: string | null = null;
  /** 当前选中的项目名称 */
  protected selectedProjectName: string | null = null;
  /** 当前选中的对话完整数据 */
  protected selectedConversationData: Conversation | null = null;
  /** 所有项目列表 */
  protected allProjects: Array<{ name: string }> = [];
  /** 筛选后的对话结果 */
  protected filteredResults: SearchResult[] = [];
  /** 所有可用的标签 */
  protected availableTags: string[] = [];
  /** 防抖刷新计时器 */
  private refreshTimer?: ReturnType<typeof setTimeout>;

  /**
   * 构造函数
   * @param context VS Code 扩展上下文
   * @param initialFilter 可选的初始筛选条件
   */
  constructor(context: vscode.ExtensionContext, initialFilter?: ConversationFilterOptions) {
    super(context);
    this.currentFilter = initialFilter || {};
  }

  /**
   * 显示对话历史面板
   * 创建或显示 Webview 面板，加载数据并渲染 HTML
   */
  show(): void {
    const panel = this.createOrShowPanel({
      viewType: 'rememberMe.conversationHistory',
      title: '对话历史',
      column: vscode.ViewColumn.One,
    });
    this.loadData();
    panel.webview.html = this.getHtml(panel.webview);
  }

  /**
   * 重新加载数据并刷新 Webview
   */
  refresh(): void {
    this.loadData();
    // 刷新选中对话的数据
    if (this.selectedProjectName && this.selectedConversationId) {
      const conversationManager = getConversationManager();
      const data = conversationManager.read(this.selectedProjectName, this.selectedConversationId);
      if (data) {
        this.selectedConversationData = data;
      } else {
        // 对话已不存在，清除选中状态
        this.selectedConversationData = null;
        this.selectedConversationId = null;
        this.selectedProjectName = null;
      }
    }
    if (this.panel) {
      this.panel.webview.html = this.getHtml(this.panel.webview);
    }
  }

  /**
   * 设置筛选条件
   * @param options 筛选选项
   */
  setFilter(options: ConversationFilterOptions): void {
    this.currentFilter = { ...this.currentFilter, ...options };
    this.refresh();
  }

  /**
   * 获取当前筛选条件的副本
   */
  getCurrentFilter(): ConversationFilterOptions {
    return { ...this.currentFilter };
  }

  /**
   * 生成 Webview 的 HTML 内容
   * @param webview VS Code Webview 实例
   */
  protected getHtml(webview: vscode.Webview): string {
    const contentHtml = this.renderToolbar() + this.renderMainContent();
    const styleCss = this.getCustomStyles();
    return this.getBaseHtml(webview, contentHtml, styleCss);
  }

  /**
   * 处理来自 Webview 的消息
   * @param message 消息对象
   */
  protected handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const msg = message as Record<string, unknown>;

    switch (msg.command) {
      case 'selectConversation':
        this.handleSelectConversation(
          (msg.projectName as string) || '',
          (msg.conversationId as string) || ''
        );
        break;
      case 'searchConversations':
        this.currentFilter = {
          ...this.currentFilter,
          keyword: (msg.keyword as string) || '',
        };
        this.scheduleRefresh();
        break;
      case 'filterByProject':
        this.currentFilter = {
          ...this.currentFilter,
          projectName: (msg.projectName as string) || undefined,
        };
        this.scheduleRefresh();
        break;
      case 'filterByDateRange':
        this.currentFilter = {
          ...this.currentFilter,
          startDate: (msg.startDate as string) || undefined,
          endDate: (msg.endDate as string) || undefined,
        };
        this.scheduleRefresh();
        break;
      case 'filterByTags':
        this.currentFilter = {
          ...this.currentFilter,
          tags: Array.isArray(msg.tags) ? (msg.tags as string[]) : undefined,
        };
        this.scheduleRefresh();
        break;
      case 'loadConversationDetail':
        this.handleLoadDetail(
          (msg.projectName as string) || '',
          (msg.conversationId as string) || ''
        );
        break;
      case 'exportConversation':
        void this.handleExport(
          (msg.projectName as string) || '',
          (msg.conversationId as string) || ''
        );
        break;
      case 'clearFilters':
        this.currentFilter = {};
        this.scheduleRefresh();
        break;
    }
  }

  /**
   * 防抖刷新：避免筛选时频繁全量重绘 HTML
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), 250);
  }

  /**
   * 加载所有项目数据并应用筛选
   */
  private loadData(): void {
    const projectManager = getProjectManager();
    const conversationManager = getConversationManager();

    const projects = projectManager.list();
    this.allProjects = projects.map((p) => ({ name: p.name }));

    const tagSet = new Set<string>();
    this.filteredResults = [];

    for (const project of this.allProjects) {
      if (this.currentFilter.projectName && project.name !== this.currentFilter.projectName) {
        continue;
      }

      // 收集所有可用标签
      const projectConversations = conversationManager.list(project.name);
      for (const item of projectConversations) {
        for (const tag of item.conversation.tags) {
          tagSet.add(tag);
        }
      }

      // 搜索对话
      const results = conversationManager.search(project.name, {
        keyword: this.currentFilter.keyword,
        tags: this.currentFilter.tags,
        startDate: this.currentFilter.startDate,
        endDate: this.currentFilter.endDate,
      });

      this.filteredResults.push(...results);
    }

    this.availableTags = Array.from(tagSet).sort();

    // 按更新时间倒序排列
    this.filteredResults.sort(
      (a, b) =>
        new Date(b.conversation.updatedAt).getTime() -
        new Date(a.conversation.updatedAt).getTime()
    );
  }

  /**
   * 渲染顶部工具栏
   */
  private renderToolbar(): string {
    const projectOptions = this.allProjects
      .map(
        (p) =>
          `<option value="${this.escapeHtml(p.name)}" ${
            this.currentFilter.projectName === p.name ? 'selected' : ''
          }>${this.escapeHtml(p.name)}</option>`
      )
      .join('');

    const tagCheckboxes = this.availableTags
      .map(
        (t) =>
          `<label class="checkbox-item ${
            this.currentFilter.tags?.includes(t) ? 'checked' : ''
          }" onclick="toggleTag(this, '${this.escapeJsString(t)}')">
            <input type="checkbox" value="${this.escapeHtml(t)}" ${
            this.currentFilter.tags?.includes(t) ? 'checked' : ''
          }>
            ${this.escapeHtml(t)}
          </label>`
      )
      .join('');

    const startDateValue = this.toDateInputValue(this.currentFilter.startDate);
    const endDateValue = this.toDateInputValue(this.currentFilter.endDate);

    return `
      <div class="history-toolbar">
        <h2>💬 对话历史</h2>
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="搜索关键词..." value="${this.escapeHtml(
            this.currentFilter.keyword || ''
          )}" oninput="scheduleSearch()" onkeydown="if(event.key==='Enter') doSearch()">
        </div>
        <div class="filter-bar">
          <div class="filter-group">
            <label>项目</label>
            <select id="projectFilter" onchange="updateProjectFilter()">
              <option value="" ${!this.currentFilter.projectName ? 'selected' : ''}>全部项目</option>
              ${projectOptions}
            </select>
          </div>
          <div class="filter-group">
            <label>开始日期</label>
            <input type="date" id="startDate" value="${startDateValue}" onchange="updateDateFilter()">
          </div>
          <div class="filter-group">
            <label>结束日期</label>
            <input type="date" id="endDate" value="${endDateValue}" onchange="updateDateFilter()">
          </div>
          <div class="filter-group filter-group-wide">
            <label>标签</label>
            <div class="checkbox-group" id="tagFilter">
              ${tagCheckboxes || '<span class="no-tags">暂无标签</span>'}
            </div>
          </div>
        </div>
        <div class="toolbar-actions">
          <button class="btn btn-primary" onclick="doSearch()">🔍 搜索</button>
          <button class="btn btn-secondary" onclick="clearFilters()">清除筛选</button>
        </div>
      </div>
      <script>
        let searchTimer;
        function scheduleSearch() {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(doSearch, 300);
        }
        function doSearch() {
          clearTimeout(searchTimer);
          const keyword = document.getElementById('searchInput').value;
          postMessage('searchConversations', { keyword });
        }
        function updateProjectFilter() {
          const projectName = document.getElementById('projectFilter').value;
          postMessage('filterByProject', { projectName });
        }
        function updateDateFilter() {
          const startDate = document.getElementById('startDate').value;
          const endDate = document.getElementById('endDate').value;
          postMessage('filterByDateRange', { startDate, endDate });
        }
        function toggleTag(element, tag) {
          const checkbox = element.querySelector('input');
          checkbox.checked = !checkbox.checked;
          element.classList.toggle('checked', checkbox.checked);
          const checkboxes = document.querySelectorAll('#tagFilter input:checked');
          const tags = Array.from(checkboxes).map(cb => cb.value);
          postMessage('filterByTags', { tags });
        }
        function selectConversation(projectName, conversationId) {
          postMessage('selectConversation', { projectName, conversationId });
        }
        function toggleGroup(projectName) {
          const content = document.getElementById('group-' + projectName);
          if (content) {
            content.classList.toggle('collapsed');
            const toggle = content.previousElementSibling.querySelector('.project-group-toggle');
            if (toggle) {
              toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
            }
          }
        }
        function exportConversation(projectName, conversationId) {
          postMessage('exportConversation', { projectName, conversationId });
        }
        function clearFilters() {
          postMessage('clearFilters');
        }
      </script>
    `;
  }

  /**
   * 渲染主内容区域
   */
  private renderMainContent(): string {
    return `
      <div class="history-main">
        <div class="history-sidebar">
          ${this.renderConversationList()}
        </div>
        <div class="history-detail">
          ${this.renderDetailPanel()}
        </div>
      </div>
    `;
  }

  /**
   * 渲染对话列表（按项目分组）
   */
  private renderConversationList(): string {
    if (this.filteredResults.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>未找到对话</p>
          <p style="font-size: 0.9rem;">尝试调整筛选条件或创建新对话</p>
        </div>
      `;
    }

    // 按项目分组
    const groups = new Map<string, SearchResult[]>();
    for (const result of this.filteredResults) {
      const list = groups.get(result.projectName) || [];
      list.push(result);
      groups.set(result.projectName, list);
    }

    const groupHtml = Array.from(groups.entries())
      .map(
        ([projectName, results]) => `
        <div class="project-group">
          <div class="project-group-header" onclick="toggleGroup('${this.escapeJsString(projectName)}')">
            <span class="project-group-toggle">▼</span>
            <span class="project-group-name">${this.escapeHtml(projectName)}</span>
            <span class="project-group-count">${results.length}</span>
          </div>
          <div class="project-group-content" id="group-${this.escapeJsString(projectName)}">
            ${results.map((r) => this.renderConversationItem(r)).join('')}
          </div>
        </div>
      `
      )
      .join('');

    return groupHtml;
  }

  /**
   * 渲染单个对话列表项
   */
  private renderConversationItem(result: SearchResult): string {
    const conv = result.conversation;
    const isSelected =
      this.selectedConversationId === conv.id && this.selectedProjectName === result.projectName;
    const dateStr = this.formatDate(conv.updatedAt);
    const msgCount = conv.messages.length;
    const decisionCount = conv.keyDecisions.length;

    return `
      <div class="conversation-item ${isSelected ? 'selected' : ''}" onclick="selectConversation('${this.escapeJsString(
        result.projectName
      )}', '${this.escapeJsString(conv.id)}')">
        <div class="conversation-item-title">${this.escapeHtml(conv.title)}</div>
        <div class="conversation-item-meta">
          <span>${dateStr}</span>
          <span>💬 ${msgCount}</span>
          ${decisionCount > 0 ? `<span>📌 ${decisionCount}</span>` : ''}
        </div>
        <div class="conversation-item-tags">
          ${conv.tags.map((t: string) => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
        </div>
        ${
          result.matchedIn.length > 0
            ? `<div class="conversation-item-match">匹配: ${result.matchedIn
                .map((m) => this.getMatchTypeLabel(m))
                .join(', ')}</div>`
            : ''
        }
      </div>
    `;
  }

  /**
   * 渲染详情面板
   */
  private renderDetailPanel(): string {
    if (!this.selectedConversationData) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <p>选择一个对话查看详情</p>
          <p style="font-size: 0.9rem;">点击左侧对话列表中的项目即可查看</p>
        </div>
      `;
    }

    const conv = this.selectedConversationData;

    return `
      <div class="detail-panel animate-in">
        <div class="detail-header">
          <h3>${this.escapeHtml(conv.title)}</h3>
          <div class="detail-meta">
            <span>📅 ${this.formatDateTime(conv.createdAt)}</span>
            <span>📝 ${this.formatDateTime(conv.updatedAt)}</span>
            <span>💬 ${conv.messages.length} 条消息</span>
          </div>
          <div class="detail-tags">
            ${conv.tags.map((t: string) => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        
        <div class="detail-section">
          <h4>消息流</h4>
          <div class="message-list">
            ${conv.messages.map((m) => this.renderMessage(m)).join('')}
          </div>
        </div>
        
        ${
          conv.keyDecisions.length > 0
            ? `
          <div class="detail-section">
            <h4>关键决策</h4>
            <div class="decision-list">
              ${conv.keyDecisions.map((d) => this.renderDecision(d)).join('')}
            </div>
          </div>
        `
            : ''
        }
        
        ${
          conv.insights.length > 0
            ? `
          <div class="detail-section">
            <h4>洞察</h4>
            <div class="insight-list">
              ${conv.insights.map((i) => this.renderInsight(i)).join('')}
            </div>
          </div>
        `
            : ''
        }
        
        <div class="detail-actions">
          <button class="btn btn-secondary" onclick="exportConversation('${this.escapeJsString(
            this.selectedProjectName || ''
          )}', '${this.escapeJsString(conv.id)}')">📥 导出 Markdown</button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染单条消息
   */
  private renderMessage(message: ChatMessage): string {
    const isUser = message.role === 'user';
    const time = this.formatDateTime(message.timestamp);
    const content = this.escapeHtml(this.truncateMessage(message.content, 2000));
    return `
      <div class="message ${isUser ? 'message-user' : 'message-assistant'}">
        <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
        <div class="message-bubble">
          <div class="message-content">${content}</div>
          <div class="message-time">${time}</div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染单个决策
   */
  private renderDecision(decision: Decision): string {
    const badgeClass =
      decision.status === '已确定'
        ? 'badge-success'
        : decision.status === '待确认'
        ? 'badge-warning'
        : 'badge-error';
    return `
      <div class="decision-item">
        <div class="decision-header">
          <span class="decision-title">${this.escapeHtml(decision.title)}</span>
          <span class="badge ${badgeClass}">${this.escapeHtml(decision.status)}</span>
        </div>
        <div class="decision-desc">${this.escapeHtml(decision.description)}</div>
        <div class="decision-time">${this.formatDateTime(decision.createdAt)}</div>
      </div>
    `;
  }

  /**
   * 渲染单个洞察
   */
  private renderInsight(insight: Insight): string {
    const categoryColor =
      insight.category === '决策'
        ? 'var(--success)'
        : insight.category === '发现'
        ? 'var(--warning)'
        : 'var(--info)';
    return `
      <div class="insight-item">
        <span class="insight-category" style="color: ${categoryColor}; border-color: ${categoryColor};">
          ${this.escapeHtml(insight.category)}
        </span>
        <span class="insight-content">${this.escapeHtml(insight.content)}</span>
        <span class="insight-time">${this.formatDateTime(insight.createdAt)}</span>
      </div>
    `;
  }

  /**
   * 获取匹配类型中文标签
   */
  private getMatchTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      title: '标题',
      message: '消息',
      insight: '洞察',
      decision: '决策',
      tag: '标签',
    };
    return labels[type] || type;
  }

  /**
   * 处理选中对话
   */
  private handleSelectConversation(projectName: string, conversationId: string): void {
    this.selectedProjectName = projectName;
    this.selectedConversationId = conversationId;
    this.handleLoadDetail(projectName, conversationId);
  }

  /**
   * 加载对话详情
   */
  private handleLoadDetail(projectName: string, conversationId: string): void {
    const conversationManager = getConversationManager();
    const data = conversationManager.read(projectName, conversationId);
    if (data) {
      this.selectedConversationData = data;
      this.selectedProjectName = projectName;
      this.selectedConversationId = conversationId;
      if (this.panel) {
        this.panel.webview.html = this.getHtml(this.panel.webview);
      }
    }
  }

  /**
   * 导出对话为 Markdown
   */
  private async handleExport(projectName: string, conversationId: string): Promise<void> {
    const conversationManager = getConversationManager();
    const conv = conversationManager.read(projectName, conversationId);
    if (!conv) {
      await vscode.window.showErrorMessage('对话不存在，无法导出');
      return;
    }

    const markdown = this.generateMarkdown(conv);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${conv.title}.md`),
      filters: {
        Markdown: ['md'],
      },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf-8'));
      await vscode.window.showInformationMessage('对话已导出为 Markdown');
    }
  }

  /**
   * 生成 Markdown 内容
   */
  protected generateMarkdown(conv: Conversation): string {
    const lines: string[] = [];
    lines.push(`# ${conv.title}`);
    lines.push('');
    lines.push(`- 创建时间: ${this.formatDateTime(conv.createdAt)}`);
    lines.push(`- 更新时间: ${this.formatDateTime(conv.updatedAt)}`);
    lines.push(`- 标签: ${conv.tags.join(', ') || '无'}`);
    lines.push('');

    if (conv.keyDecisions.length > 0) {
      lines.push('## 关键决策');
      lines.push('');
      for (const d of conv.keyDecisions) {
        lines.push(`### ${d.title}`);
        lines.push(`- 状态: ${d.status}`);
        lines.push(`- 描述: ${d.description}`);
        lines.push(`- 时间: ${this.formatDateTime(d.createdAt)}`);
        lines.push('');
      }
    }

    if (conv.insights.length > 0) {
      lines.push('## 洞察');
      lines.push('');
      for (const i of conv.insights) {
        lines.push(`- [${i.category}] ${i.content} (${this.formatDateTime(i.createdAt)})`);
      }
      lines.push('');
    }

    lines.push('## 消息流');
    lines.push('');
    for (const m of conv.messages) {
      lines.push(`### ${m.role === 'user' ? '用户' : '助手'} (${this.formatDateTime(m.timestamp)})`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 生成自定义样式
   */
  private getCustomStyles(): string {
    return `
      .container {
        max-width: 100%;
        margin: 0;
        padding: var(--spacing-md);
      }
      .history-toolbar {
        margin-bottom: var(--spacing-lg);
        padding-bottom: var(--spacing-md);
        border-bottom: 1px solid var(--border);
      }
      .history-toolbar h2 {
        margin-bottom: var(--spacing-md);
      }
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm);
        margin-top: var(--spacing-sm);
        align-items: flex-end;
      }
      .filter-group {
        flex: 1;
        min-width: 120px;
      }
      .filter-group-wide {
        flex: 2;
        min-width: 200px;
      }
      .filter-group label {
        font-size: 0.85rem;
        margin-bottom: 2px;
      }
      .toolbar-actions {
        display: flex;
        gap: var(--spacing-sm);
        margin-top: var(--spacing-md);
      }
      .history-main {
        display: flex;
        gap: var(--spacing-lg);
        min-height: 500px;
      }
      .history-sidebar {
        flex: 0 0 320px;
        max-height: 700px;
        overflow-y: auto;
        border-right: 1px solid var(--border);
        padding-right: var(--spacing-md);
      }
      .history-detail {
        flex: 1;
        min-width: 0;
      }
      .project-group {
        margin-bottom: var(--spacing-sm);
      }
      .project-group-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius);
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
      }
      .project-group-header:hover {
        background: var(--bg-primary);
      }
      .project-group-toggle {
        font-size: 0.8rem;
        transition: transform 0.2s;
      }
      .project-group-content.collapsed {
        display: none;
      }
      .project-group-count {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--fg-secondary);
        background: var(--bg-primary);
        padding: 2px 8px;
        border-radius: 12px;
      }
      .conversation-item {
        padding: var(--spacing-md);
        margin: var(--spacing-xs) 0;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        cursor: pointer;
        transition: all 0.2s;
      }
      .conversation-item:hover {
        border-color: var(--accent);
        background: var(--bg-secondary);
      }
      .conversation-item.selected {
        border-color: var(--accent);
        background: rgba(14, 99, 156, 0.1);
      }
      .conversation-item-title {
        font-weight: 600;
        margin-bottom: var(--spacing-xs);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .conversation-item-meta {
        font-size: 0.85rem;
        color: var(--fg-secondary);
        display: flex;
        gap: var(--spacing-sm);
        margin-bottom: var(--spacing-xs);
      }
      .conversation-item-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
      }
      .conversation-item-match {
        font-size: 0.8rem;
        color: var(--info);
        margin-top: var(--spacing-xs);
      }
      .detail-panel {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: var(--spacing-lg);
      }
      .detail-header {
        margin-bottom: var(--spacing-lg);
        padding-bottom: var(--spacing-md);
        border-bottom: 1px solid var(--border);
      }
      .detail-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm);
        font-size: 0.85rem;
        color: var(--fg-secondary);
        margin-top: var(--spacing-sm);
      }
      .detail-tags {
        margin-top: var(--spacing-sm);
      }
      .detail-section {
        margin-bottom: var(--spacing-lg);
      }
      .detail-section h4 {
        margin-bottom: var(--spacing-sm);
        padding-bottom: var(--spacing-xs);
        border-bottom: 1px solid var(--border);
      }
      .message-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }
      .message {
        display: flex;
        gap: var(--spacing-sm);
        align-items: flex-start;
      }
      .message-user {
        flex-direction: row;
      }
      .message-assistant {
        flex-direction: row-reverse;
      }
      .message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        flex-shrink: 0;
      }
      .message-bubble {
        max-width: 80%;
        padding: var(--spacing-sm) var(--spacing-md);
        border-radius: var(--radius);
        position: relative;
      }
      .message-user .message-bubble {
        background: rgba(33, 150, 243, 0.15);
        border: 1px solid rgba(33, 150, 243, 0.3);
        color: var(--fg-primary);
      }
      .message-assistant .message-bubble {
        background: var(--bg-primary);
        border: 1px solid var(--border);
        color: var(--fg-primary);
      }
      .message-content {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
      }
      .message-time {
        font-size: 0.75rem;
        color: var(--fg-secondary);
        margin-top: var(--spacing-xs);
        text-align: right;
      }
      .decision-item {
        padding: var(--spacing-md);
        background: var(--bg-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: var(--spacing-sm);
      }
      .decision-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-xs);
      }
      .decision-title {
        font-weight: 600;
      }
      .decision-desc {
        color: var(--fg-secondary);
        font-size: 0.9rem;
        margin-bottom: var(--spacing-xs);
      }
      .decision-time {
        font-size: 0.8rem;
        color: var(--fg-secondary);
      }
      .insight-item {
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: var(--spacing-xs);
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        flex-wrap: wrap;
      }
      .insight-category {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        border: 1px solid;
      }
      .insight-content {
        flex: 1;
        color: var(--fg-primary);
      }
      .insight-time {
        font-size: 0.75rem;
        color: var(--fg-secondary);
      }
      .detail-actions {
        margin-top: var(--spacing-lg);
        padding-top: var(--spacing-md);
        border-top: 1px solid var(--border);
      }
      .no-tags {
        color: var(--fg-secondary);
        font-size: 0.85rem;
        font-style: italic;
      }
      @media (max-width: 800px) {
        .history-main {
          flex-direction: column;
        }
        .history-sidebar {
          flex: 1;
          border-right: none;
          border-bottom: 1px solid var(--border);
          padding-right: 0;
          padding-bottom: var(--spacing-md);
        }
      }
    `;
  }

  /**
   * 格式化日期
   */
  protected formatDate(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * 格式化日期时间
   */
  protected formatDateTime(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * 截断消息内容
   */
  protected truncateMessage(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  }

  /**
   * 转义 HTML 特殊字符
   */
  protected escapeHtml(text: string): string {
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

  /**
   * 转义 JS 字符串中的特殊字符（用于 HTML 属性中的 JS 字符串）
   */
  private escapeJsString(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 将日期字符串转换为 date input 的 value 格式
   */
  private toDateInputValue(dateStr: string | undefined): string {
    if (!dateStr) {
      return '';
    }
    // 如果已经是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }
}
