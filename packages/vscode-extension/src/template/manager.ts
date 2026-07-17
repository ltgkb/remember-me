/**
 * Remember Me - 模板管理器
 * 管理内置模板和用户自定义模板（~/.remember-me/templates/）
 */

import type {
  DocumentTemplate,
  TemplateSection,
  TemplateApplication,
  TemplateFilter,
  TemplateCategory,
  TemplateExportMeta,
  TemplateValidationResult,
} from './types';
import { JsonStorage, getStorage } from '../memory/storage';
import * as fs from 'fs';
import { getProfileManager } from '../memory/profile';
import { getProjectManager } from '../memory/project';
import { getLogger } from '../utils/logger';
import { isValidProfile } from '../utils/profileGuard';
import { BUILT_IN_TEMPLATES } from './built-in';

const TEMPLATES_DIR = 'templates';
const USER_TEMPLATES_DIR = 'user-templates';

export class TemplateManager {
  private storage: JsonStorage;

  constructor(storage?: JsonStorage) {
    this.storage = storage || getStorage();
    this.ensureBuiltInTemplates();
  }

  // ==================== 内置模板初始化 ====================

  /**
   * 确保所有内置模板已写入存储
   * 首次加载时自动初始化
   */
  private ensureBuiltInTemplates(): void {
    for (const template of BUILT_IN_TEMPLATES) {
      const exists = this.storage.exists(TEMPLATES_DIR, `${template.id}.json`);
      if (!exists) {
        this.storage.write(template, TEMPLATES_DIR, `${template.id}.json`);
      }
    }
  }

  // ==================== 基础 CRUD ====================

  /**
   * 读取模板（支持内置和用户自定义）
   */
  read(templateId: string): DocumentTemplate | null {
    // 先查用户自定义
    const userTemplate = this.storage.read<DocumentTemplate>(
      USER_TEMPLATES_DIR,
      `${templateId}.json`
    );
    if (userTemplate) {
      return userTemplate;
    }

    // 再查内置模板
    return this.storage.read<DocumentTemplate>(
      TEMPLATES_DIR,
      `${templateId}.json`
    );
  }

  /**
   * 创建用户自定义模板
   */
  create(template: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'> & { id: string }): DocumentTemplate | null {
    const now = new Date().toISOString();
    const fullTemplate: DocumentTemplate = {
      ...template,
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
    };

    const success = this.storage.write(
      fullTemplate,
      USER_TEMPLATES_DIR,
      `${template.id}.json`
    );
    return success ? fullTemplate : null;
  }

  /**
   * 更新用户自定义模板（内置模板不可修改）
   */
  update(templateId: string, updates: Partial<DocumentTemplate>): DocumentTemplate | null {
    const existing = this.read(templateId);
    if (!existing) {
      getLogger().warn(`[RememberMe] 更新失败：模板 "${templateId}" 不存在`);
      return null;
    }

    if (existing.isBuiltIn) {
      getLogger().warn(`[RememberMe] 内置模板不可直接修改，请创建副本`);
      // 自动创建副本
      return this.createCopy(templateId, `${templateId}-copy`);
    }

    const updated: DocumentTemplate = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      isBuiltIn: false,
    };

    const success = this.storage.write(
      updated,
      USER_TEMPLATES_DIR,
      `${templateId}.json`
    );
    return success ? updated : null;
  }

  /**
   * 删除模板（仅用户自定义）
   */
  delete(templateId: string): boolean {
    const existing = this.read(templateId);
    if (!existing) {
      return false;
    }
    if (existing.isBuiltIn) {
      getLogger().warn(`[RememberMe] 内置模板不可删除`);
      return false;
    }
    return this.storage.delete(USER_TEMPLATES_DIR, `${templateId}.json`);
  }

  /**
   * 基于现有模板创建副本
   */
  createCopy(sourceId: string, newId: string, newName?: string): DocumentTemplate | null {
    const source = this.read(sourceId);
    if (!source) {
      getLogger().warn(`[RememberMe] 复制失败：源模板 "${sourceId}" 不存在`);
      return null;
    }

    const now = new Date().toISOString();
    const copy: DocumentTemplate = {
      ...source,
      id: newId,
      name: newName || `${source.name}（副本）`,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    const success = this.storage.write(copy, USER_TEMPLATES_DIR, `${newId}.json`);
    return success ? copy : null;
  }

  // ==================== 列表与搜索 ====================

  /**
   * 列出所有可用模板（内置 + 用户自定义）
   */
  listAll(): DocumentTemplate[] {
    const templates: DocumentTemplate[] = [];

    // 内置模板
    const builtInFiles = this.storage.listDir(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
    for (const file of builtInFiles) {
      const data = this.storage.read<DocumentTemplate>(TEMPLATES_DIR, file);
      if (data) {
        templates.push(data);
      }
    }

    // 用户自定义模板（同名时覆盖内置）
    const userFiles = this.storage.listDir(USER_TEMPLATES_DIR).filter(f => f.endsWith('.json'));
    const userIds = new Set<string>();
    for (const file of userFiles) {
      const data = this.storage.read<DocumentTemplate>(USER_TEMPLATES_DIR, file);
      if (data) {
        userIds.add(data.id);
        // 替换同名内置模板
        const existingIndex = templates.findIndex(t => t.id === data.id);
        if (existingIndex >= 0) {
          templates[existingIndex] = data;
        } else {
          templates.push(data);
        }
      }
    }

    // 按名称排序
    templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return templates;
  }

  /**
   * 按分类列出模板
   */
  listByCategory(category: TemplateCategory): DocumentTemplate[] {
    return this.listAll().filter(t => t.category === category);
  }

  /**
   * 筛选模板
   */
  filter(options: TemplateFilter): DocumentTemplate[] {
    let results = this.listAll();

    if (options.category) {
      results = results.filter(t => t.category === options.category);
    }

    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      results = results.filter(
        t =>
          t.name.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw) ||
          t.tags.some(tag => tag.toLowerCase().includes(kw))
      );
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(t =>
        options.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (options.difficulty) {
      results = results.filter(t => t.meta.difficulty === options.difficulty);
    }

    return results;
  }

  /**
   * 搜索模板名称（用于 QuickPick）
   */
  searchByName(keyword: string): Array<{ id: string; name: string; description: string; category: string }> {
    const templates = this.listAll();
    const kw = keyword.toLowerCase();

    return templates
      .filter(
        t =>
          t.name.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw)
      )
      .map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: this.getCategoryLabel(t.category),
      }));
  }

  // ==================== 模板应用（核心功能）====================

  /**
   * 应用模板，生成完整的 AI Prompt
   * 注入模板结构要求 + 用户记忆 + 项目上下文
   */
  apply(templateId: string): TemplateApplication | null {
    const template = this.read(templateId);
    if (!template) {
      getLogger().warn(`[RememberMe] 应用模板失败：模板 "${templateId}" 不存在`);
      return null;
    }

    const profileManager = getProfileManager();
    const projectManager = getProjectManager();

    const profile = profileManager.read();
    const project = projectManager.getCurrent();

    // 构建模板化 Prompt
    const promptLines: string[] = [];

    // 1. 角色设定 + 模板场景声明
    promptLines.push('你是用户的 AI 协作助手。');
    promptLines.push(`本次任务：使用「${template.name}」模板协助用户撰写文档。`);
    promptLines.push('');

    // 2. 用户画像与风格（根据模板记忆配置调整优先级）
    if (isValidProfile(profile)) {
      const { identity, style } = profile;

      // 按模板优先级决定注入哪些记忆
      const priority = template.memoryConfig.priority;

      if (priority.includes('profile')) {
        promptLines.push('【用户身份】');
        promptLines.push(`- 角色：${identity.role}`);
        promptLines.push(`- 经验：${identity.experience}`);
        promptLines.push(`- 领域：${identity.industry}`);
        promptLines.push('');
      }

      if (priority.includes('style')) {
        promptLines.push('【文档风格要求】');
        promptLines.push(`- 详细程度：${style.detailLevel}`);
        promptLines.push(`- 语言：${style.language}`);
        promptLines.push(`- 语气：${style.tone}`);
        promptLines.push(`- 文档结构偏好：${style.documentStructure}`);
        promptLines.push(`- 回复风格：${style.responseStyle}`);

        // 注入模板要求的特殊习惯
        const requiredHabits = template.memoryConfig.requiredStyleHabits;
        const matchedHabits = style.specialHabits.filter(h =>
          requiredHabits.some(rh => h.includes(rh) || rh.includes(h))
        );
        if (matchedHabits.length > 0) {
          promptLines.push(`- 特殊习惯（本场景重点）：${matchedHabits.join('、')}`);
        }
        promptLines.push('');
      }
    }

    // 3. 项目上下文
    if (project && template.memoryConfig.priority.includes('project')) {
      promptLines.push('【项目背景】');
      promptLines.push(`- 项目名称：${project.name}`);
      promptLines.push(`- 目标用户：${project.targetUsers}`);
      promptLines.push(`- 核心功能：${project.coreFeatures}`);

      // 注入模板关心的项目上下文键
      for (const key of template.memoryConfig.projectContextKeys) {
        if (key === 'decisions' && project.decisions.length > 0) {
          const activeDecisions = project.decisions.filter(d => d.status === '已确定');
          if (activeDecisions.length > 0) {
            promptLines.push('- 已确定决策：');
            activeDecisions.forEach(d => {
              promptLines.push(`  • ${d.title}：${d.description}`);
            });
          }
        }
        if (key === 'terminology' && project.terminology.length > 0) {
          promptLines.push('- 术语定义：');
          project.terminology.forEach(t => {
            promptLines.push(`  • ${t.term} = ${t.definition}`);
          });
        }
        if (key === 'competitors' && project.competitors.length > 0) {
          promptLines.push(`- 主要竞品：${project.competitors.join('、')}`);
        }
      }
      promptLines.push('');
    }

    // 4. 模板结构要求
    promptLines.push(`【${template.name} 结构要求】`);
    promptLines.push(template.structure.preamble);
    promptLines.push('');

    // 5. 章节列表
    promptLines.push('请严格按照以下章节结构输出：');
    promptLines.push('');

    for (const section of template.structure.sections) {
      const marker = section.required ? '【必填】' : '【可选】';
      promptLines.push(`### ${section.title} ${marker}`);
      promptLines.push(`说明：${section.description}`);
      promptLines.push(`要求：${section.prompt}`);

      if (section.checklist && section.checklist.length > 0) {
        promptLines.push('检查项：');
        section.checklist.forEach(item => {
          promptLines.push(`  □ ${item}`);
        });
      }
      promptLines.push('');
    }

    if (template.structure.appendix) {
      promptLines.push(template.structure.appendix);
      promptLines.push('');
    }

    // 6. 结尾指令
    promptLines.push('【输出要求】');
    promptLines.push('- 使用 Markdown 格式输出');
    promptLines.push('- 必填章节必须完整覆盖');
    promptLines.push('- 根据用户输入的具体内容，灵活调整各章节的详略程度');
    if (profile?.style.language === '双语') {
      promptLines.push('- 关键术语请同时提供中英文');
    }

    const generatedPrompt = promptLines.join('\n');

    return {
      templateId: template.id,
      templateName: template.name,
      generatedPrompt,
      documentStructure: template.structure.sections.map(s => `${s.title}${s.required ? '' : '（可选）'}`).join(' → '),
      requiredSections: template.structure.sections.filter(s => s.required).map(s => s.title),
      optionalSections: template.structure.sections.filter(s => !s.required).map(s => s.title),
    };
  }

  /**
   * 仅获取模板的文档结构（用于预览，不生成完整 Prompt）
   */
  getStructure(templateId: string): { preamble: string; sections: TemplateSection[]; appendix?: string } | null {
    const template = this.read(templateId);
    if (!template) {
      return null;
    }
    return template.structure;
  }

  // ==================== 模板统计 ====================

  /**
   * 获取模板使用统计（预留接口，后续可接入埋点）
   */
  getStats(): { total: number; builtIn: number; user: number; byCategory: Record<string, number> } {
    const all = this.listAll();
    const builtIn = all.filter(t => t.isBuiltIn).length;
    const byCategory: Record<string, number> = {};

    for (const t of all) {
      const label = this.getCategoryLabel(t.category);
      byCategory[label] = (byCategory[label] || 0) + 1;
    }

    return {
      total: all.length,
      builtIn,
      user: all.length - builtIn,
      byCategory,
    };
  }

  // ==================== 模板导入导出 ====================

  /**
   * 验证模板数据是否有效
   */
  validateTemplate(data: unknown): string[] {
    const errors: string[] = [];

    if (typeof data !== 'object' || data === null) {
      return ['数据必须是对象'];
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.id !== 'string') {
      errors.push('缺少必需字段：id（string）');
    }
    if (typeof obj.name !== 'string') {
      errors.push('缺少必需字段：name（string）');
    }
    if (typeof obj.description !== 'string') {
      errors.push('缺少必需字段：description（string）');
    }

    const validCategories: TemplateCategory[] = ['prd', 'business', 'academic', 'research', 'activity', 'design', 'tech', 'report'];
    if (!validCategories.includes(obj.category as TemplateCategory)) {
      errors.push('缺少必需字段或类型错误：category（有效 TemplateCategory）');
    }

    if (typeof obj.meta !== 'object' || obj.meta === null) {
      errors.push('缺少必需字段：meta（object）');
    } else {
      const meta = obj.meta as Record<string, unknown>;
      if (typeof meta.difficulty !== 'string') {
        errors.push('缺少必需字段：meta.difficulty（string）');
      }
      if (typeof meta.typicalLength !== 'string') {
        errors.push('缺少必需字段：meta.typicalLength（string）');
      }
    }

    if (typeof obj.structure !== 'object' || obj.structure === null) {
      errors.push('缺少必需字段：structure（object），需包含 sections 数组');
    } else {
      const structure = obj.structure as Record<string, unknown>;
      if (!Array.isArray(structure.sections)) {
        errors.push('缺少必需字段：sections（array）');
      }
    }

    return errors;
  }

  /**
   * 从文件导入模板
   */
  importFromFile(filePath: string): TemplateValidationResult {
    let data: unknown;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, errors: [`读取或解析 JSON 失败：${message}`] };
    }

    const errors = this.validateTemplate(data);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    const template = data as DocumentTemplate;

    // 检查 ID 冲突
    const allTemplates = this.listAll();
    const existingIds = new Set(allTemplates.map(t => t.id));
    let finalId = template.id;

    if (existingIds.has(finalId)) {
      const timestamp = Date.now();
      finalId = `${finalId}-imported-${timestamp}`;
    }

    const now = new Date().toISOString();
    const toSave: DocumentTemplate = {
      ...template,
      id: finalId,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    const success = this.storage.write(toSave, USER_TEMPLATES_DIR, `${finalId}.json`);
    if (!success) {
      return { success: false, errors: ['保存模板失败'] };
    }

    getLogger().info(`[RememberMe] 模板导入成功：${finalId}（源文件：${filePath}）`);
    return { success: true, template: toSave };
  }

  /**
   * 导出模板到文件
   */
  exportToFile(templateId: string, filePath: string): boolean {
    const template = this.read(templateId);
    if (!template) {
      return false;
    }

    const exportMeta: TemplateExportMeta = {
      exportedAt: new Date().toISOString(),
      exportedBy: 'remember-me-v0.1.0',
    };

    const data = {
      ...template,
      exportMeta,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      getLogger().error(`[RememberMe] 模板导出失败：${templateId} → ${filePath}`, error);
      return false;
    }
  }

  // ==================== 工具方法 ====================

  private getCategoryLabel(category: TemplateCategory): string {
    const labels: Record<TemplateCategory, string> = {
      prd: '产品文档',
      business: '商业计划',
      academic: '学术论文',
      research: '调研报告',
      activity: '活动策划',
      design: '设计文档',
      tech: '技术方案',
      report: '汇报材料',
    };
    return labels[category] || category;
  }
}

// 单例导出
let templateManagerInstance: TemplateManager | null = null;

export function getTemplateManager(storage?: JsonStorage): TemplateManager {
  if (!templateManagerInstance) {
    templateManagerInstance = new TemplateManager(storage);
  }
  return templateManagerInstance;
}
