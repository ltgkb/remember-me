/**
 * Remember Me - 状态栏管理器
 * 负责状态栏项的创建、更新和交互
 */

import * as vscode from 'vscode';
import type { Profile, ProjectContext, MemoryRecommendation } from '../types';
import { getLogger } from '../utils/logger';
import { getRoleLabel, isValidProfile } from '../utils/profileGuard';

export interface StatusBarState {
  profile: Profile | null;
  currentProject: ProjectContext | null;
  isMemoryActive: boolean;
  searchMode: 'keyword' | 'semantic' | 'hybrid';
  semanticLoading?: boolean;
}

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private context: vscode.ExtensionContext;
  private state: StatusBarState;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = {
      profile: null,
      currentProject: null,
      isMemoryActive: false,
      searchMode: 'keyword',
      semanticLoading: false,
    };

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'rememberMe.showQuickMenu';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  /**
   * 更新状态栏状态
   */
  updateState(newState: Partial<StatusBarState>): void {
    this.state = { ...this.state, ...newState };
    this.updateDisplay();
  }

  /**
   * 设置用户画像
   */
  setProfile(profile: Profile | null): void {
    if (!isValidProfile(profile)) {
      getLogger().warn('[RememberMe] 收到不完整或非法的画像数据，状态栏显示为未激活');
      this.state.profile = null;
      this.state.isMemoryActive = false;
    } else {
      this.state.profile = profile;
      this.state.isMemoryActive = true;
    }
    this.updateDisplay();
  }

  /**
   * 设置当前项目
   */
  setCurrentProject(project: ProjectContext | null): void {
    this.state.currentProject = project;
    this.updateDisplay();
  }

  /**
   * 更新搜索模式并刷新状态栏
   */
  updateSearchMode(mode: 'keyword' | 'semantic' | 'hybrid'): void {
    this.state.searchMode = mode;
    this.updateDisplay();
  }

  /**
   * 更新状态栏显示
   */
  private updateDisplay(): void {
    const { profile, currentProject, isMemoryActive, searchMode } = this.state;

    if (!isMemoryActive || !profile) {
      this.statusBarItem.text = '$(circle-outline) Remember Me';
      this.statusBarItem.tooltip = '点击配置 Remember Me';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const role = getRoleLabel(profile);
    const projectName = currentProject?.name || '未选择项目';
    const modeIcon = searchMode === 'semantic' ? '🧠' : searchMode === 'hybrid' ? '🔍🧠' : '🔍';

    if (this.state.semanticLoading) {
      this.statusBarItem.text = `$(brain) ${modeIcon} ${role} | ${projectName}`;
      this.statusBarItem.tooltip = '🧠 语义模型预热中…';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    this.statusBarItem.text = `$(brain) ${modeIcon} ${role} | ${projectName}`;
    this.statusBarItem.tooltip = this.buildTooltip();
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  }

  /**
   * 构建状态栏 tooltip
   */
  private buildTooltip(): string {
    const { profile, currentProject, searchMode } = this.state;
    if (!profile) {
      return 'Remember Me 未激活\n点击进行配置';
    }

    const modeLabel = searchMode === 'semantic' ? '🧠 语义搜索' : searchMode === 'hybrid' ? '🔍🧠 混合搜索' : '🔍 关键词搜索';
    const lines: string[] = ['🧠 Remember Me 已激活'];
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`身份：${getRoleLabel(profile)}`);
    if (isValidProfile(profile)) {
      lines.push(`经验：${profile.identity.experience}`);
      lines.push(`领域：${profile.identity.industry}`);
    }

    if (currentProject) {
      lines.push(`项目：${currentProject.name}`);
      if (currentProject.targetUsers) {
        lines.push(`目标用户：${currentProject.targetUsers}`);
      }
    } else {
      lines.push('项目：未选择');
    }
    lines.push(`搜索模式：${modeLabel}`);

    lines.push('');
    lines.push('点击打开菜单');

    return lines.join('\n');
  }

  /**
   * 显示记忆激活提示（信息消息）
   */
  showMemoryActivation(profile: Profile, project: ProjectContext | null): void {
    if (!isValidProfile(profile)) {
      void vscode.window.showWarningMessage('画像数据不完整，请重新完成设置向导');
      return;
    }
    const role = profile.identity.role;
    const projectName = project?.name || '未选择项目';
    const style = profile.style;

    let styleText = '';
    if (style.detailLevel) {
      styleText += ` | ${style.detailLevel}`;
    }
    if (style.specialHabits && style.specialHabits.length > 0) {
      styleText += ` | ${style.specialHabits.join(' + ')}`;
    }

    const message = `🧠 Remember Me 已激活：${role} | 项目：${projectName}${styleText}`;
    vscode.window.showInformationMessage(message, '编辑记忆', '切换项目').then(selection => {
      if (selection === '编辑记忆') {
        void vscode.commands.executeCommand('rememberMe.openMemoryEditor');
      } else if (selection === '切换项目') {
        void vscode.commands.executeCommand('rememberMe.switchProject');
      }
    }, err => getLogger().error('[RememberMe] 显示记忆激活提示失败', err));
  }

  /**
   * 显示新信息检测提示
   */
  showNewInfoDetected(info: string): void {
    vscode.window.showInformationMessage(
      `💡 检测到新信息：你提到了"${info}"\n是否要更新项目上下文？`,
      '更新',
      '忽略',
      '标记为待确认'
    ).then(selection => {
      if (selection === '更新') {
        void vscode.commands.executeCommand('rememberMe.updateProjectContext', info);
      } else if (selection === '标记为待确认') {
        void vscode.commands.executeCommand('rememberMe.markAsPending', info);
      }
    }, err => getLogger().error('[RememberMe] 显示新信息检测提示失败', err));
  }

  /**
   * 显示风格一致性提醒
   */
  showStyleConsistencyWarning(message: string): void {
    vscode.window.showWarningMessage(
      `⚠️ 风格检查：${message}`,
      '自动补充',
      '手动编辑',
      '忽略本次'
    ).then(selection => {
      if (selection === '自动补充') {
        void vscode.commands.executeCommand('rememberMe.autoFixStyle');
      } else if (selection === '手动编辑') {
        void vscode.commands.executeCommand('rememberMe.openMemoryEditor');
      }
    }, err => getLogger().error('[RememberMe] 显示风格一致性提醒失败', err));
  }

  /**
   * 显示相关记忆推荐
   */
  showRelatedMemory(memoryTitle: string, memoryId: string): void {
    vscode.window.showInformationMessage(
      `💡 相关记忆：${memoryTitle}`,
      '查看',
      '忽略'
    ).then(selection => {
      if (selection === '查看') {
        void vscode.commands.executeCommand('rememberMe.openMemoryEditor');
      }
    }, err => getLogger().error('[RememberMe] 显示相关记忆推荐失败', err));
  }

  /**
   * 显示智能记忆推荐（内容感知）
   * 在状态栏弹出信息消息，提供「查看」和「忽略」操作
   * @param recommendation - 记忆推荐条目
   */
  showMemoryRecommendation(recommendation: MemoryRecommendation): void {
    const message = `💡 相关记忆：${recommendation.title}`;
    vscode.window.showInformationMessage(message, '查看', '忽略').then(selection => {
      if (selection === '查看') {
        void vscode.commands.executeCommand('rememberMe.openMemoryEditor', recommendation.id);
      } else if (selection === '忽略') {
        void vscode.commands.executeCommand('rememberMe.ignoreRecommendation', recommendation.id);
      }
    }, err => getLogger().error('[RememberMe] 显示智能记忆推荐失败', err));
  }

  /**
   * 显示快捷操作菜单
   */
  async showQuickMenu(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(edit) 编辑记忆',
        description: '打开记忆编辑器',
        detail: '修改个人画像、项目上下文和偏好设置',
      },
      {
        label: '$(folder) 切换项目',
        description: '选择或创建项目',
        detail: '切换当前工作项目上下文',
      },
      {
        label: '$(refresh) 刷新记忆',
        description: '重新加载记忆数据',
        detail: '从存储文件重新读取记忆',
      },
      {
        label: '$(gear) 打开设置向导',
        description: '重新运行首次设置',
        detail: '修改个人画像和偏好设置',
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(search) 搜索记忆',
        description: this.state.searchMode === 'hybrid'
          ? '混合搜索（当前）'
          : this.state.searchMode === 'semantic'
            ? '语义搜索（当前）'
            : '关键词搜索（当前）',
        detail: this.state.searchMode === 'hybrid'
          ? '关键词 + 语义向量双重检索'
          : this.state.searchMode === 'semantic'
            ? '用自然语言描述你想找的记忆'
            : '查找相关的历史对话和决策',
      },
      {
        label: '$(symbol-enum) 切换搜索模式',
        description: `当前：${this.state.searchMode === 'hybrid' ? '🔍🧠 混合' : this.state.searchMode === 'semantic' ? '🧠 语义' : '🔍 关键词'}`,
        detail: '在关键词搜索、语义搜索与混合搜索之间切换',
      },
      {
        label: '$(database) 构建语义索引',
        description: '将本地记忆灌入向量索引',
        detail: '首次启用语义搜索或记忆大批量变更后执行',
      },
      {
        label: '$(history) 查看对话历史',
        description: '浏览过往对话记录',
        detail: '查看当前项目的历史对话',
      },
      {
        label: '$(versions) 记忆版本控制',
        description: '查看备份历史并回滚',
        detail: '管理记忆数据的历史版本',
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(info) 关于 Remember Me',
        description: '版本信息和帮助',
        detail: '查看插件信息和文档',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择操作',
      title: '🧠 Remember Me 菜单',
    });

    if (!selected) {
      return;
    }

    switch (true) {
      case selected.label.includes('编辑记忆'):
        await vscode.commands.executeCommand('rememberMe.openMemoryEditor');
        break;
      case selected.label.includes('切换项目'):
        await vscode.commands.executeCommand('rememberMe.switchProject');
        break;
      case selected.label.includes('刷新记忆'):
        await vscode.commands.executeCommand('rememberMe.refreshMemory');
        break;
      case selected.label.includes('设置向导'):
        await vscode.commands.executeCommand('rememberMe.openOnboarding');
        break;
      case selected.label.includes('搜索记忆'):
        await vscode.commands.executeCommand('rememberMe.searchMemory');
        break;
      case selected.label.includes('切换搜索模式'):
        await vscode.commands.executeCommand('rememberMe.toggleSearchMode');
        break;
      case selected.label.includes('构建语义索引'):
        await vscode.commands.executeCommand('rememberMe.buildSemanticIndex');
        break;
      case selected.label.includes('对话历史'):
        await vscode.commands.executeCommand('rememberMe.viewConversationHistory');
        break;
      case selected.label.includes('版本控制'):
        await vscode.commands.executeCommand('rememberMe.openVersionControl');
        break;
      case selected.label.includes('关于'):
        await vscode.commands.executeCommand('rememberMe.showAbout');
        break;
    }
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
