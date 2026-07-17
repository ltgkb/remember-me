/**
 * Remember Me - 侧边栏树形数据提供器
 * 在 Activity Bar 的 Remember Me 面板中展示记忆结构
 * 已集成模板系统（Phase 3）
 */

import * as vscode from 'vscode';
import type { JsonStorage } from '../memory/storage';
import { getTemplateManager } from '../template/manager';
import { isValidProfile } from '../utils/profileGuard';
import type { Profile, ProjectContext } from '../types';

type SidebarNodeType =
  | 'root-profile'
  | 'root-projects'
  | 'root-templates'
  | 'profile-detail'
  | 'project-item'
  | 'template-item'
  | 'action-search'
  | 'action-settings';

export class RememberMeSidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** 缓存根节点，避免每次展开都重新读取磁盘 */
  private rootCache: SidebarItem[] | undefined;
  /** 缓存项目子节点 */
  private projectCache: SidebarItem[] | undefined;
  /** 缓存模板子节点 */
  private templateCache: SidebarItem[] | undefined;
  /** 缓存是否有效 */
  private cacheValid = false;

  constructor(private readonly storage: JsonStorage) {}

  /** 刷新树形视图并失效缓存 */
  refresh(): void {
    this.cacheValid = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    return this.getChildItems(element);
  }

  /** 构建根节点 */
  private getRootItems(): Promise<SidebarItem[]> {
    if (this.cacheValid && this.rootCache) {
      return Promise.resolve(this.rootCache);
    }

    const items: SidebarItem[] = [];

    // 个人画像节点
    const profile = this.storage.read<Profile>('profile.json');
    if (isValidProfile(profile)) {
      items.push(
        new SidebarItem(
          `👤 ${profile.identity.role} | ${profile.identity.industry}`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'root-profile',
          profile
        )
      );
    }

    // 项目列表节点
    const projects = this.storage.listDir('projects');
    items.push(
      new SidebarItem(
        `📁 项目 (${projects.length})`,
        projects.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        'root-projects'
      )
    );

    // 模板系统节点（Phase 3）
    const templateManager = getTemplateManager();
    const templateCount = templateManager.listAll().length;
    items.push(
      new SidebarItem(
        `📄 文档模板 (${templateCount})`,
        templateCount > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        'root-templates'
      )
    );

    // 快捷操作节点
    items.push(
      new SidebarItem(
        '🔍 搜索记忆',
        vscode.TreeItemCollapsibleState.None,
        'action-search',
        undefined,
        {
          command: 'rememberMe.searchMemory',
          title: '搜索记忆'
        }
      )
    );

    items.push(
      new SidebarItem(
        '⚙️ 打开设置',
        vscode.TreeItemCollapsibleState.None,
        'action-settings',
        undefined,
        {
          command: 'rememberMe.openSettings',
          title: '打开设置'
        }
      )
    );

    this.rootCache = items;
    this.cacheValid = true;
    return Promise.resolve(items);
  }

  /** 构建子节点 */
  private getChildItems(element: SidebarItem): Promise<SidebarItem[]> {
    if (element.nodeType === 'root-profile') {
      const profile = element.data as Profile;
      return Promise.resolve([
        new SidebarItem(
          `经验: ${profile.identity.experience}`,
          vscode.TreeItemCollapsibleState.None,
          'profile-detail'
        ),
        new SidebarItem(
          `背景: ${profile.identity.background}`,
          vscode.TreeItemCollapsibleState.None,
          'profile-detail'
        ),
        new SidebarItem(
          `风格: ${profile.style.detailLevel} | ${profile.style.tone}`,
          vscode.TreeItemCollapsibleState.None,
          'profile-detail'
        ),
        new SidebarItem(
          `语言: ${profile.style.language}`,
          vscode.TreeItemCollapsibleState.None,
          'profile-detail'
        )
      ]);
    }

    if (element.nodeType === 'root-projects') {
      if (!this.cacheValid || !this.projectCache) {
        const projects = this.storage.listDir('projects');
        this.projectCache = projects.map(name => {
          const context = this.storage.read<ProjectContext>('projects', name, 'context.json');
          return new SidebarItem(
            name,
            vscode.TreeItemCollapsibleState.None,
            'project-item',
            context,
            {
              command: 'rememberMe.switchProject',
              title: '切换项目',
              arguments: [name]
            }
          );
        });
      }
      return Promise.resolve(this.projectCache);
    }

    // 模板子节点（Phase 3）
    if (element.nodeType === 'root-templates') {
      if (!this.cacheValid || !this.templateCache) {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        this.templateCache = templates.map(t =>
          new SidebarItem(
            `${t.isBuiltIn ? '📦' : '✏️'} ${t.name}`,
            vscode.TreeItemCollapsibleState.None,
            'template-item',
            t,
            {
              command: 'rememberMe.selectTemplate',
              title: '选择模板'
            }
          )
        );
      }
      return Promise.resolve(this.templateCache);
    }

    return Promise.resolve([]);
  }
}

/**
 * 侧边栏树节点项
 */
class SidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly nodeType: SidebarNodeType,
    public readonly data?: unknown,
    public readonly cmd?: vscode.Command
  ) {
    super(label, collapsibleState);

    if (cmd) {
      this.command = cmd;
    }

    // 根据节点类型设置图标和提示
    switch (nodeType) {
      case 'root-profile':
        this.iconPath = new vscode.ThemeIcon('account');
        this.tooltip = '个人画像 - 点击展开详情';
        break;
      case 'root-projects':
        this.iconPath = new vscode.ThemeIcon('folder');
        this.tooltip = '项目列表 - 点击展开';
        break;
      case 'root-templates':
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.tooltip = '文档模板 - PRD / 商业计划书 / 论文等';
        break;
      case 'profile-detail':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
      case 'project-item':
        this.iconPath = new vscode.ThemeIcon('repo');
        if (data && typeof data === 'object' && 'targetUsers' in data) {
          this.tooltip = `目标用户: ${(data as ProjectContext).targetUsers}`;
        }
        break;
      case 'template-item':
        this.iconPath = new vscode.ThemeIcon('note');
        if (data && typeof data === 'object' && 'description' in data) {
          this.tooltip = `${(data as { description: string }).description}`;
        }
        break;
      case 'action-search':
        this.iconPath = new vscode.ThemeIcon('search');
        this.tooltip = '关键词搜索历史记忆';
        break;
      case 'action-settings':
        this.iconPath = new vscode.ThemeIcon('gear');
        this.tooltip = '打开设置向导';
        break;
    }
  }
}
