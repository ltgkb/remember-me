/**
 * Remember Me - 记忆版本控制 Webview
 * 提供可视化的备份历史查看和回滚功能（PRD §4.3 记忆更新 — 版本控制）
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseWebview } from './baseWebview';
import { getStorage } from '../../memory/storage';
import { getLogger } from '../../utils/logger';

/**
 * 单个备份项信息
 */
interface BackupItem {
  /** 备份文件名 */
  fileName: string;
  /** 备份文件绝对路径 */
  backupPath: string;
  /** 原文件绝对路径 */
  originalPath: string;
  /** 备份时间戳（ISO 字符串） */
  timestamp: string;
  /** 文件大小（字节） */
  size: number;
  /** 显示名称（相对路径，仅预览时使用） */
  displayName?: string;
}


/**
 * 同一原文件的备份分组
 */
interface BackupGroup {
  /** 原文件绝对路径 */
  originalPath: string;
  /** 显示名称（相对路径） */
  displayName: string;
  /** 该文件的所有备份（按时间倒序） */
  backups: BackupItem[];
}

/**
 * 版本控制 Webview 类
 * 继承 BaseWebview，实现备份历史时间轴、JSON 预览和回滚功能
 */
export class VersionControlWebview extends BaseWebview {
  /** 当前选中的备份路径 */
  protected selectedBackupPath: string | null = null;
  protected previewItem: BackupItem | null = null;
  /** 缓存的备份分组数据 */
  private backupGroups: BackupGroup[] = [];
  /** 当前预览的备份内容 */
  private previewContent: string = '';


  /**
   * 构造函数
   * @param context VS Code 扩展上下文
   */
  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  /**
   * 显示版本控制面板
   * 创建或显示 Webview 面板，扫描备份并渲染 HTML
   */
  show(): void {
    const panel = this.createOrShowPanel({
      viewType: 'rememberMe.versionControl',
      title: '🗂️ 记忆版本控制',
      column: vscode.ViewColumn.One,
    });
    this.scanBackups();
    panel.webview.html = this.getHtml(panel.webview);
  }

  /**
   * 重新扫描备份并刷新 Webview
   */
  refresh(): void {
    this.scanBackups();
    if (this.panel) {
      this.panel.webview.html = this.getHtml(this.panel.webview);
    }
  }

  /**
   * 扫描 ~/.remember-me/ 下所有 .backups 目录
   * 收集所有备份并按原文件路径分组
   */
  private scanBackups(): void {
    const storage = getStorage();
    const basePath = storage.getBasePath();
    const groups = new Map<string, BackupGroup>();

    try {
      this.scanDirectory(basePath, basePath, groups);
    } catch (error) {
      getLogger().error('[RememberMe] 扫描备份失败', error);
    }

    // 对每个分组内的备份按时间倒序排列
    this.backupGroups = Array.from(groups.values()).map((g) => ({
      ...g,
      backups: g.backups.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    }));

    // 按显示名称排序分组
    this.backupGroups.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * 递归扫描目录，查找 .backups 子目录
   * @param dir 当前扫描目录
   * @param basePath 存储根路径（用于计算相对路径）
   * @param groups 备份分组映射
   */
  private scanDirectory(dir: string, basePath: string, groups: Map<string, BackupGroup>): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === '.backups') {
          // 解析 .backups 目录中的备份文件
          this.parseBackupDir(fullPath, basePath, groups);
        } else {
          // 递归扫描子目录
          this.scanDirectory(fullPath, basePath, groups);
        }
      }
    }
  }

  /**
   * 解析单个 .backups 目录中的备份文件
   * @param backupDir .backups 目录绝对路径
   * @param basePath 存储根路径
   * @param groups 备份分组映射
   */
  private parseBackupDir(backupDir: string, basePath: string, groups: Map<string, BackupGroup>): void {
    const parentDir = path.dirname(backupDir);

    try {
      const files = fs.readdirSync(backupDir);

      for (const file of files) {
        // 备份文件名格式: {原文件名}.{ISO时间戳替换冒号和点}
        // 例如: context.json.2026-07-09T12-30-00-000Z
        const match = file.match(/^(.+\.json)\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)$/);
        if (!match) {
          continue;
        }

        const originalFileName = match[1];
        const timestampStr = match[2].replace(/-/g, (m, offset) => {
          // 只替换时间部分的 - 为 : 和 .
          if (offset === 4 || offset === 7) {
            return '-'; // 日期部分保持 -
          }
          if (offset === 13 || offset === 16) {
            return ':'; // 时分秒部分恢复 :
          }
          if (offset === 19) {
            return '.'; // 毫秒部分恢复 .
          }
          return '-';
        });

        const backupPath = path.join(backupDir, file);
        const originalPath = path.join(parentDir, originalFileName);
        const displayName = path.relative(basePath, originalPath);
        const stats = fs.statSync(backupPath);

        const item: BackupItem = {
          fileName: file,
          backupPath,
          originalPath,
          timestamp: timestampStr,
          size: stats.size,
        };

        if (!groups.has(originalPath)) {
          groups.set(originalPath, {
            originalPath,
            displayName,
            backups: [],
          });
        }

        groups.get(originalPath)!.backups.push(item);
      }
    } catch (error) {
      getLogger().error(`[RememberMe] 解析备份目录失败: ${backupDir}`, error);
    }
  }

  /**
   * 生成 Webview 的 HTML 内容
   * @param webview VS Code Webview 实例
   * @returns 完整 HTML 字符串
   */
  protected getHtml(webview: vscode.Webview): string {
    const contentHtml = this.renderHeader() + this.renderMainContent();
    const styleCss = this.getCustomStyles();
    return this.getBaseHtml(webview, contentHtml, styleCss);
  }

  /**
   * 渲染顶部标题栏
   */
  private renderHeader(): string {
    return `
      <div class="vc-header">
        <h2>🗂️ 记忆版本控制</h2>
        <p>查看备份历史、预览内容并回滚到任意版本</p>
        <div class="vc-actions">
          <button class="btn btn-primary" onclick="refreshBackups()">🔄 刷新</button>
        </div>
      </div>
      <script>
        function refreshBackups() {
          postMessage('refresh');
        }
        function selectBackup(backupPath) {
          postMessage('previewBackup', { backupPath });
        }
        function requestRollback(backupPath, originalPath) {
          postMessage('rollback', { backupPath, originalPath });
        }
        function requestDelete(backupPath) {
          postMessage('deleteBackup', { backupPath });
        }
        function toggleGroup(groupId) {
          const el = document.getElementById('group-' + groupId);
          if (el) {
            el.classList.toggle('collapsed');
            const toggle = el.previousElementSibling.querySelector('.group-toggle');
            if (toggle) {
              toggle.textContent = el.classList.contains('collapsed') ? '▶' : '▼';
            }
          }
        }
      </script>
    `;
  }

  /**
   * 渲染主内容区域（左侧备份列表 + 右侧预览面板）
   */
  private renderMainContent(): string {
    if (this.backupGroups.length === 0) {
      return this.renderEmptyState();
    }

    return `
      <div class="vc-main">
        <div class="vc-sidebar">
          ${this.backupGroups.map((g, idx) => this.renderBackupGroup(g, idx)).join('')}
        </div>
        <div class="vc-preview">
          ${this.renderPreviewPanel()}
        </div>
      </div>
    `;
  }

  /**
   * 渲染空状态
   */
  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>尚无备份记录</p>
        <p style="font-size: 0.9rem;">记忆文件在修改时会自动创建备份，备份将出现在这里</p>
      </div>
    `;
  }

  /**
   * 渲染单个文件备份分组（手风琴卡片）
   * @param group 备份分组
   * @param index 分组索引（用于生成唯一 ID）
   */
  private renderBackupGroup(group: BackupGroup, index: number): string {
    const groupId = `grp-${index}`;
    const backupCount = group.backups.length;

    return `
      <div class="vc-group">
        <div class="vc-group-header" onclick="toggleGroup('${groupId}')">
          <span class="group-toggle">▼</span>
          <span class="vc-group-name" title="${this.escapeHtml(group.originalPath)}">${this.escapeHtml(
            group.displayName
          )}</span>
          <span class="badge badge-info">${backupCount}</span>
        </div>
        <div class="vc-group-content" id="group-${groupId}">
          <div class="timeline">
            ${group.backups.map((b, bidx) => this.renderTimelineItem(b, bidx, group.backups.length)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染时间轴上的单个备份项
   * @param item 备份项
   * @param index 在组内的索引
   * @param total 组内备份总数
   */
  private renderTimelineItem(item: BackupItem, index: number, total: number): string {
    const isSelected = this.selectedBackupPath === item.backupPath;
    const status = this.getBackupStatus(index, total);
    const statusClass =
      status === 'recent' ? 'badge-success' : status === 'old' ? 'badge-warning' : 'badge-error';
    const statusLabel = status === 'recent' ? '最近' : status === 'old' ? '较早' : '即将清理';
    const sizeStr = this.formatFileSize(item.size);
    const dateStr = this.formatDateTime(item.timestamp);

    return `
      <div class="timeline-item ${isSelected ? 'selected' : ''}" onclick="selectBackup('${this.escapeJsString(
        item.backupPath
      )}')">
        <div class="timeline-dot ${status}"></div>
        <div class="timeline-content">
          <div class="timeline-meta">
            <span class="badge ${statusClass}">${statusLabel}</span>
            <span class="timeline-size">${sizeStr}</span>
          </div>
          <div class="timeline-time">${dateStr}</div>
          ${isSelected ? this.renderBackupActions(item) : ''}
        </div>
      </div>
    `;
  }

  /**
   * 渲染备份操作按钮（回滚、删除）
   * @param item 备份项
   */
  private renderBackupActions(item: BackupItem): string {
    return `
      <div class="timeline-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); requestRollback('${this.escapeJsString(
          item.backupPath
        )}', '${this.escapeJsString(item.originalPath)}')">
          ↩️ 回滚到此版本
        </button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); requestDelete('${this.escapeJsString(
          item.backupPath
        )}')">
          🗑️ 删除此备份
        </button>
      </div>
    `;
  }

  /**
   * 渲染右侧预览面板
   */
  private renderPreviewPanel(): string {
    if (!this.previewItem) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <p>选择一个备份查看内容</p>
          <p style="font-size: 0.9rem;">点击左侧时间轴中的备份项即可预览 JSON 内容</p>
        </div>
      `;
    }

    const highlightedJson = this.highlightJson(this.previewContent);

    return `
      <div class="preview-panel animate-in">
        <div class="preview-header">
          <h4>📄 ${this.escapeHtml(this.previewItem.fileName)}</h4>
          <div class="preview-meta">
            <span>原文件: ${this.escapeHtml(this.previewItem.displayName || this.previewItem.originalPath)}</span>
            <span>备份时间: ${this.formatDateTime(this.previewItem.timestamp)}</span>
            <span>大小: ${this.formatFileSize(this.previewItem.size)}</span>
          </div>
        </div>
        <div class="preview-actions-bar">
          <button class="btn btn-primary btn-sm" onclick="requestRollback('${this.escapeJsString(
            this.previewItem.backupPath
          )}', '${this.escapeJsString(this.previewItem.originalPath)}')">
            ↩️ 回滚到此版本
          </button>
          <button class="btn btn-secondary btn-sm" onclick="requestDelete('${this.escapeJsString(
            this.previewItem.backupPath
          )}')">
            🗑️ 删除此备份
          </button>
        </div>
        <pre class="json-preview"><code>${highlightedJson}</code></pre>
      </div>
    `;
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
      case 'loadBackups':
        this.refresh();
        break;
      case 'previewBackup':
        void this.handlePreviewBackup((msg.backupPath as string) || '');
        break;
      case 'rollback':
        void this.handleRollback(
          (msg.backupPath as string) || '',
          (msg.originalPath as string) || ''
        );
        break;
      case 'deleteBackup':
        void this.handleDeleteBackup((msg.backupPath as string) || '');
        break;
      case 'refresh':
        this.refresh();
        break;
    }
  }

  /**
   * 处理预览备份请求
   * @param backupPath 备份文件路径
   */
  private async handlePreviewBackup(backupPath: string): Promise<void> {
    if (!backupPath || !this.isPathSafe(backupPath)) {
      return;
    }

    this.selectedBackupPath = backupPath;

    // 查找对应的备份项
    for (const group of this.backupGroups) {
      const item = group.backups.find((b) => b.backupPath === backupPath);
      if (item) {
        this.previewItem = { ...item, displayName: group.displayName };
        break;
      }
    }

    try {
      this.previewContent = fs.readFileSync(backupPath, 'utf-8');
    } catch (error) {
      this.previewContent = '{ "error": "无法读取备份文件" }';
      getLogger().error(`[RememberMe] 读取备份失败: ${backupPath}`, error);
    }

    // 仅刷新预览区域
    if (this.panel) {
      this.panel.webview.html = this.getHtml(this.panel.webview);
    }
  }

  /**
   * 处理回滚请求
   * @param backupPath 备份文件路径
   * @param originalPath 原文件路径
   */
  private async handleRollback(backupPath: string, originalPath: string): Promise<void> {
    if (!backupPath || !originalPath) {
      void vscode.window.showErrorMessage('❌ 回滚参数缺失');
      return;
    }

    if (!this.isPathSafe(backupPath) || !this.isPathSafe(originalPath)) {
      void vscode.window.showErrorMessage('❌ 路径安全检查失败');
      return;
    }

    if (!fs.existsSync(backupPath)) {
      void vscode.window.showErrorMessage('❌ 备份文件不存在');
      return;
    }

    // 二次确认
    const confirm = await vscode.window.showWarningMessage(
      `确定要回滚到该版本吗？\n原文件: ${path.basename(originalPath)}`,
      { modal: true },
      '确认回滚',
      '取消'
    );

    if (confirm !== '确认回滚') {
      return;
    }

    try {
      // 回滚前自动为当前文件创建新备份
      if (fs.existsSync(originalPath)) {
        const storage = getStorage();
        const relativePath = path.relative(storage.getBasePath(), originalPath);
        const segments = relativePath.split(path.sep).filter((s) => s.length > 0);
        const success = storage.backup(...segments);
        if (!success) {
          getLogger().warn(`[RememberMe] 回滚前自动备份失败: ${originalPath}`);
        }
      }

      // 执行回滚：将备份复制回原文件
      fs.copyFileSync(backupPath, originalPath);

      void vscode.window.showInformationMessage('✅ 已成功回滚到所选版本');
      this.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`❌ 回滚失败: ${message}`);
      getLogger().error(`[RememberMe] 回滚失败: ${backupPath} -> ${originalPath}`, error);
    }
  }

  /**
   * 处理删除备份请求
   * @param backupPath 备份文件路径
   */
  private async handleDeleteBackup(backupPath: string): Promise<void> {
    if (!backupPath || !this.isPathSafe(backupPath)) {
      void vscode.window.showErrorMessage('❌ 路径安全检查失败');
      return;
    }

    if (!fs.existsSync(backupPath)) {
      void vscode.window.showErrorMessage('❌ 备份文件不存在');
      return;
    }

    // 二次确认
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除此备份吗？\n${path.basename(backupPath)}`,
      { modal: true },
      '删除',
      '取消'
    );

    if (confirm !== '删除') {
      return;
    }

    try {
      fs.unlinkSync(backupPath);

      // 清除选中状态（如果被删除的是当前选中的）
      if (this.selectedBackupPath === backupPath) {
        this.selectedBackupPath = null;
        this.previewItem = null;
        this.previewContent = '';
      }

      void vscode.window.showInformationMessage('✅ 备份已删除');
      this.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`❌ 删除失败: ${message}`);
      getLogger().error(`[RememberMe] 删除备份失败: ${backupPath}`, error);
    }
  }

  /**
   * 路径安全检查：确保路径在 ~/.remember-me/ 目录内
   * @param checkPath 待检查路径
   * @returns 是否安全
   */
  protected isPathSafe(checkPath: string): boolean {
    const storage = getStorage();
    const basePath = storage.getBasePath();

    const resolvedBase = path.resolve(basePath);
    const resolvedCheck = path.resolve(checkPath);

    // 确保路径以 basePath 开头
    const relative = path.relative(resolvedBase, resolvedCheck);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      getLogger().warn(`[RememberMe] 路径安全检查失败: ${checkPath}`);
      return false;
    }

    return true;
  }

  /**
   * 获取备份状态（用于时间轴颜色标记）
   * @param index 备份在组内的索引（0 为最新）
   * @param total 组内备份总数
   * @returns 状态标识
   */
  protected getBackupStatus(index: number, total: number): 'recent' | 'old' | 'cleanup' {
    if (index < 5) {
      return 'recent';
    }
    if (total > 15 && index >= 15) {
      return 'cleanup';
    }
    return 'old';
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 人类可读的大小字符串
   */
  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 格式化日期时间（中文）
   * @param dateStr ISO 日期字符串
   * @returns 格式化后的中文时间字符串
   */
  protected formatDateTime(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * 对 JSON 字符串进行简单的 CSS 语法高亮
   * @param json JSON 字符串
   * @returns 带 HTML 标签的高亮字符串
   */
  protected highlightJson(json: string): string {
    let escaped = this.escapeHtml(json);

    // 键名高亮（双引号包围的字符串后跟冒号）
    escaped = escaped.replace(
      /(&quot;[^&]*?&quot;)(\s*:\s*)/g,
      '<span class="json-key">$1</span>$2'
    );

    // 字符串值高亮
    escaped = escaped.replace(
      /(:\s*)(&quot;(?:[^&]|&[^q]|&q[^u]|&qu[^o]|&quo[^t]|&quot[^;])*?&quot;)/g,
      '$1<span class="json-string">$2</span>'
    );

    // 数字高亮（冒号后或空格后的数字）
    escaped = escaped.replace(/(:\s*|\s)(-?\d+\.?\d*)/g, '$1<span class="json-number">$2</span>');

    // 布尔值和 null 高亮（冒号后或空格后的布尔值）
    escaped = escaped.replace(
      /(:\s*|\s)(true|false|null)/g,
      '$1<span class="json-boolean">$2</span>'
    );
    escaped = escaped.replace(/(\s)(-?\d+\.?\d*)/g, '$1<span class="json-number">$2</span>');

    // 布尔值和 null 高亮
    escaped = escaped.replace(
      /(\s)(true|false|null)/g,
      '$1<span class="json-boolean">$2</span>'
    );

    return escaped;
  }

  /**
   * HTML 转义
   * @param text 原始文本
   * @returns 转义后的文本
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
   * JavaScript 字符串转义（用于 HTML 属性）
   * @param text 原始文本
   * @returns 转义后的文本
   */
  private escapeJsString(text: string): string {
    if (!text) {
      return '';
    }
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  /**
   * 生成自定义样式
   * @returns CSS 字符串
   */
  private getCustomStyles(): string {
    return `
      .container {
        max-width: 100%;
        margin: 0;
        padding: var(--spacing-md);
      }
      .vc-header {
        margin-bottom: var(--spacing-lg);
        padding-bottom: var(--spacing-md);
        border-bottom: 1px solid var(--border);
      }
      .vc-header h2 {
        margin-bottom: var(--spacing-xs);
      }
      .vc-header p {
        margin-bottom: var(--spacing-md);
        color: var(--fg-secondary);
      }
      .vc-actions {
        display: flex;
        gap: var(--spacing-sm);
      }
      .vc-main {
        display: flex;
        gap: var(--spacing-lg);
        min-height: 500px;
      }
      .vc-sidebar {
        flex: 0 0 380px;
        max-height: 700px;
        overflow-y: auto;
        border-right: 1px solid var(--border);
        padding-right: var(--spacing-md);
      }
      .vc-preview {
        flex: 1;
        min-width: 0;
      }
      .vc-group {
        margin-bottom: var(--spacing-sm);
      }
      .vc-group-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
      }
      .vc-group-header:hover {
        background: var(--bg-primary);
        border-color: var(--accent);
      }
      .group-toggle {
        font-size: 0.8rem;
        transition: transform 0.2s;
        width: 16px;
        text-align: center;
      }
      .vc-group-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9rem;
      }
      .vc-group-content {
        padding: var(--spacing-sm) 0 var(--spacing-sm) var(--spacing-lg);
      }
      .vc-group-content.collapsed {
        display: none;
      }
      .timeline {
        position: relative;
        padding-left: 12px;
      }
      .timeline::before {
        content: '';
        position: absolute;
        left: 4px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: var(--border);
        border-radius: 1px;
      }
      .timeline-item {
        position: relative;
        padding: var(--spacing-sm) var(--spacing-md);
        margin-bottom: var(--spacing-sm);
        background: var(--bg-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        cursor: pointer;
        transition: all 0.2s;
      }
      .timeline-item:hover {
        border-color: var(--accent);
        background: var(--bg-secondary);
      }
      .timeline-item.selected {
        border-color: var(--accent);
        background: rgba(14, 99, 156, 0.1);
      }
      .timeline-dot {
        position: absolute;
        left: -14px;
        top: 14px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid var(--bg-primary);
        z-index: 1;
      }
      .timeline-dot.recent {
        background: var(--success);
      }
      .timeline-dot.old {
        background: var(--warning);
      }
      .timeline-dot.cleanup {
        background: var(--error);
      }
      .timeline-content {
        margin-left: var(--spacing-xs);
      }
      .timeline-meta {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        margin-bottom: var(--spacing-xs);
      }
      .timeline-size {
        font-size: 0.8rem;
        color: var(--fg-secondary);
      }
      .timeline-time {
        font-size: 0.85rem;
        color: var(--fg-primary);
        font-weight: 500;
      }
      .timeline-actions {
        display: flex;
        gap: var(--spacing-xs);
        margin-top: var(--spacing-sm);
      }
      .btn-sm {
        padding: 4px 10px;
        font-size: 0.8rem;
      }
      .preview-panel {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: var(--spacing-lg);
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .preview-header {
        margin-bottom: var(--spacing-md);
        padding-bottom: var(--spacing-md);
        border-bottom: 1px solid var(--border);
      }
      .preview-header h4 {
        margin-bottom: var(--spacing-xs);
        word-break: break-all;
      }
      .preview-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm);
        font-size: 0.85rem;
        color: var(--fg-secondary);
      }
      .preview-actions-bar {
        display: flex;
        gap: var(--spacing-sm);
        margin-bottom: var(--spacing-md);
      }
      .json-preview {
        flex: 1;
        overflow: auto;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: var(--spacing-md);
        margin: 0;
        font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', monospace);
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--fg-primary);
      }
      .json-preview code {
        font-family: inherit;
      }
      .json-key {
        color: #9cdcfe;
      }
      .json-string {
        color: #ce9178;
      }
      .json-number {
        color: #b5cea8;
      }
      .json-boolean {
        color: #569cd6;
      }
      @media (max-width: 800px) {
        .vc-main {
          flex-direction: column;
        }
        .vc-sidebar {
          flex: 1;
          border-right: none;
          border-bottom: 1px solid var(--border);
          padding-right: 0;
          padding-bottom: var(--spacing-md);
          max-height: 400px;
        }
      }
    `;
  }
}
