/**
 * Remember Me - 模板系统类型定义
 * 支持多场景写作模板（PRD、商业计划书、论文等）
 */

// ==================== 模板结构 ====================

export type TemplateCategory =
  | 'prd'
  | 'business'
  | 'academic'
  | 'research'
  | 'activity'
  | 'design'
  | 'tech'
  | 'report';

/**
 * 模板章节定义
 */
export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  required: boolean;
  prompt: string;              // AI 生成该章节时的引导提示词
  memoryFocus: string[];       // 该章节需要重点关注的记忆维度
  checklist?: string[];        // 该章节的验收检查项（可选）
}

/**
 * 模板元信息
 */
export interface TemplateMeta {
  targetAudience: string;      // 目标受众描述
  typicalLength: string;       // 典型篇幅
  language: string;            // 默认语言
  difficulty: '入门' | '标准' | '高级'; // 难度等级
}

/**
 * 记忆配置：该模板场景下哪些记忆维度最重要
 */
export interface TemplateMemoryConfig {
  priority: Array<'profile' | 'project' | 'style' | 'history'>;
  requiredStyleHabits: string[];   // 必须包含的风格习惯提示
  projectContextKeys: string[];    // 需要特别注入的项目上下文键
}

/**
 * 文档模板（核心数据结构）
 */
export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  version: string;
  createdAt: string;
  updatedAt: string;
  meta: TemplateMeta;
  structure: {
    preamble: string;            // 文档开头引导语
    sections: TemplateSection[];
    appendix?: string;           // 文档结尾引导语
  };
  memoryConfig: TemplateMemoryConfig;
  tags: string[];                // 搜索标签
  isBuiltIn: boolean;            // 是否为内置模板
}

/**
 * 用户自定义模板（继承内置或完全新建）
 */
export interface UserTemplate extends DocumentTemplate {
  basedOn?: string;              // 基于哪个内置模板
  customSections?: TemplateSection[]; // 自定义覆盖章节
}

// ==================== 模板应用结果 ====================

/**
 * 模板应用后的结构化输出
 */
export interface TemplateApplication {
  templateId: string;
  templateName: string;
  generatedPrompt: string;       // 注入给 AI 的完整 Prompt
  documentStructure: string;     // 文档结构概述（用于显示）
  requiredSections: string[];    // 必填章节列表
  optionalSections: string[];    // 可选章节列表
}

/**
 * 模板筛选选项
 */
export interface TemplateFilter {
  category?: TemplateCategory;
  keyword?: string;
  tags?: string[];
  difficulty?: TemplateMeta['difficulty'];
}

// ==================== 模板导入导出 ====================

export interface TemplateExportMeta {
  exportedAt: string;      // ISO 时间戳
  exportedBy: string;      // 导出者标记（如 "remember-me-v0.1.0"）
}

export type TemplateValidationResult =
  | { success: true; template: DocumentTemplate }
  | { success: false; errors: string[] };
