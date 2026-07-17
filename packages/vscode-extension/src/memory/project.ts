/**
 * Remember Me - 项目上下文管理模块
 * 管理多项目上下文（~/.remember-me/projects/<name>/context.json）
 */

import type { ProjectContext, Decision, TermDefinition } from '../types';
import { getLogger } from '../utils/logger';
import { JsonStorage, getStorage } from './storage';

const CONTEXT_FILENAME = 'context.json';
const CONVERSATIONS_DIR = 'conversations';

export class ProjectManager {
  private storage: JsonStorage;
  private currentProjectName: string | null = null;

  constructor(storage?: JsonStorage) {
    this.storage = storage || getStorage();
  }

  // ==================== 项目 CRUD ====================

  /**
   * 创建新项目
   */
  create(name: string, targetUsers: string, coreFeatures: string): ProjectContext | null {
    const safeName = this.sanitizeDirName(name);
    if (!safeName) {
      getLogger().error('[RememberMe] 项目名称无效');
      return null;
    }

    // 检查是否已存在
    if (this.exists(safeName)) {
      getLogger().warn(`[RememberMe] 项目 "${name}" 已存在`);
      return this.read(safeName);
    }

    const now = new Date().toISOString();
    const project: ProjectContext = {
      id: this.generateId(),
      name,
      createdAt: now,
      updatedAt: now,
      targetUsers,
      coreFeatures,
      decisions: [],
      terminology: [],
      competitors: [],
    };

    const success = this.storage.write(project, 'projects', safeName, CONTEXT_FILENAME);
    if (success) {
      // 确保对话目录存在
      this.storage.write([], 'projects', safeName, CONVERSATIONS_DIR, '.gitkeep');
    }
    return success ? project : null;
  }

  /**
   * 读取项目上下文
   */
  read(name: string): ProjectContext | null {
    const safeName = this.sanitizeDirName(name);
    return this.storage.read<ProjectContext>('projects', safeName, CONTEXT_FILENAME);
  }

  /**
   * 更新项目上下文（局部更新）
   */
  update(name: string, updates: Partial<Omit<ProjectContext, 'id' | 'createdAt'>>): ProjectContext | null {
    const safeName = this.sanitizeDirName(name);
    const existing = this.read(name);
    if (!existing) {
      getLogger().warn(`[RememberMe] 更新失败：项目 "${name}" 不存在`);
      return null;
    }

    // 备份
    this.storage.backup('projects', safeName, CONTEXT_FILENAME);

    const updated: ProjectContext = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const success = this.storage.write(updated, 'projects', safeName, CONTEXT_FILENAME);
    return success ? updated : null;
  }

  /**
   * 删除项目（含所有对话历史）
   */
  delete(name: string): boolean {
    const safeName = this.sanitizeDirName(name);
    const existing = this.read(name);
    if (!existing) {
      return false;
    }

    // 先备份
    this.storage.backup('projects', safeName, CONTEXT_FILENAME);

    // 删除项目目录下所有文件
    const files = this.storage.listDir('projects', safeName);
    for (const file of files) {
      this.storage.delete('projects', safeName, file);
    }

    if (this.currentProjectName === name) {
      this.currentProjectName = null;
    }

    return true;
  }

  /**
   * 检查项目是否存在
   */
  exists(name: string): boolean {
    const safeName = this.sanitizeDirName(name);
    return this.storage.exists('projects', safeName, CONTEXT_FILENAME);
  }

  /**
   * 列出所有项目
   */
  list(): Array<{ name: string; context: ProjectContext }> {
    const projectNames = this.storage.listDir('projects');
    const projects: Array<{ name: string; context: ProjectContext }> = [];

    for (const name of projectNames) {
      const context = this.storage.read<ProjectContext>('projects', name, CONTEXT_FILENAME);
      if (context) {
        projects.push({ name: context.name, context });
      }
    }

    // 按更新时间倒序，二级排序按创建时间倒序，三级排序按名称正序
    projects.sort((a, b) => {
      const timeDiff = new Date(b.context.updatedAt).getTime() - new Date(a.context.updatedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      const createdDiff = new Date(b.context.createdAt).getTime() - new Date(a.context.createdAt).getTime();
      if (createdDiff !== 0) return createdDiff;
      return a.context.name.localeCompare(b.context.name);
    });
    return projects;
  }

  // ==================== 当前项目 ====================

  /**
   * 设置当前活跃项目
   */
  setCurrent(name: string): boolean {
    if (!this.exists(name)) {
      getLogger().warn(`[RememberMe] 设置当前项目失败："${name}" 不存在`);
      return false;
    }
    this.currentProjectName = name;
    return true;
  }

  /**
   * 获取当前活跃项目
   */
  getCurrent(): ProjectContext | null {
    if (!this.currentProjectName) {
      return null;
    }
    return this.read(this.currentProjectName);
  }

  /**
   * 获取当前项目名
   */
  getCurrentName(): string | null {
    return this.currentProjectName;
  }

  /**
   * 清除当前项目
   */
  clearCurrent(): void {
    this.currentProjectName = null;
  }

  // ==================== 决策管理 ====================

  /**
   * 添加决策
   */
  addDecision(projectName: string, title: string, description: string, status: Decision['status'] = '已确定'): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const decision: Decision = {
      id: this.generateId(),
      title,
      description,
      createdAt: new Date().toISOString(),
      status,
    };

    const decisions = [...project.decisions, decision];
    return this.update(projectName, { decisions });
  }

  /**
   * 更新决策状态
   */
  updateDecisionStatus(projectName: string, decisionId: string, status: Decision['status']): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const decisions = project.decisions.map(d =>
      d.id === decisionId ? { ...d, status } : d
    );

    return this.update(projectName, { decisions });
  }

  /**
   * 删除决策
   */
  removeDecision(projectName: string, decisionId: string): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const decisions = project.decisions.filter(d => d.id !== decisionId);
    return this.update(projectName, { decisions });
  }

  // ==================== 术语管理 ====================

  /**
   * 添加或更新术语定义
   */
  setTerminology(projectName: string, term: string, definition: string): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const existingIndex = project.terminology.findIndex(t => t.term === term);
    let terminology: TermDefinition[];

    if (existingIndex >= 0) {
      terminology = [...project.terminology];
      terminology[existingIndex] = { term, definition };
    } else {
      terminology = [...project.terminology, { term, definition }];
    }

    return this.update(projectName, { terminology });
  }

  /**
   * 删除术语
   */
  removeTerminology(projectName: string, term: string): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const terminology = project.terminology.filter(t => t.term !== term);
    return this.update(projectName, { terminology });
  }

  /**
   * 查找术语定义
   */
  findTerm(projectName: string, term: string): TermDefinition | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }
    return project.terminology.find(t => t.term === term) || null;
  }

  // ==================== 竞品管理 ====================

  /**
   * 添加竞品
   */
  addCompetitor(projectName: string, competitor: string): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    if (project.competitors.includes(competitor)) {
      return project;
    }

    const competitors = [...project.competitors, competitor];
    return this.update(projectName, { competitors });
  }

  /**
   * 移除竞品
   */
  removeCompetitor(projectName: string, competitor: string): ProjectContext | null {
    const project = this.read(projectName);
    if (!project) {
      return null;
    }

    const competitors = project.competitors.filter(c => c !== competitor);
    return this.update(projectName, { competitors });
  }

  // ==================== 记忆注入 Prompt ====================

  /**
   * 生成当前项目的记忆注入 Prompt 段落
   */
  buildMemoryPrompt(projectName?: string): string {
    const name = projectName || this.currentProjectName;
    if (!name) {
      return '';
    }

    const project = this.read(name);
    if (!project) {
      return '';
    }

    const lines: string[] = [];
    lines.push(`【当前项目】${project.name}`);
    lines.push(`- 目标用户：${project.targetUsers}`);
    lines.push(`- 核心功能：${project.coreFeatures}`);

    if (project.decisions.length > 0) {
      lines.push('- 已确定决策：');
      project.decisions
        .filter(d => d.status === '已确定')
        .forEach(d => {
          lines.push(`  • ${d.title}：${d.description}`);
        });
    }

    if (project.terminology.length > 0) {
      lines.push('- 术语定义：');
      project.terminology.forEach(t => {
        lines.push(`  • ${t.term} = ${t.definition}`);
      });
    }

    return lines.join('\n');
  }

  // ==================== 工具方法 ====================

  private sanitizeDirName(name: string): string {
    // 将项目名称转为安全的目录名：小写，替换特殊字符
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// 单例导出
let projectManagerInstance: ProjectManager | null = null;

export function getProjectManager(storage?: JsonStorage): ProjectManager {
  if (!projectManagerInstance) {
    projectManagerInstance = new ProjectManager(storage);
  }
  return projectManagerInstance;
}
