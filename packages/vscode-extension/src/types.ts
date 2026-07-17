/**
 * Remember Me - 核心类型定义
 * 所有模块共享的类型接口
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
  validateConfig(): Promise<boolean>;
}

// ==================== 用户画像 ====================

export interface Profile {
  id: string;
  createdAt: string;
  updatedAt: string;
  identity: IdentityInfo;
  style: StyleInfo;
}

export interface IdentityInfo {
  role: '产品经理' | '运营' | '设计师' | '学生' | '创业者' | '管理者' | '其他';
  experience: '新手' | '1-3年' | '3-5年' | '5年以上';
  industry: '电商' | 'SaaS' | '社交' | '金融' | '教育' | '医疗' | '其他';
  background: '技术' | '商业' | '设计' | '文科' | '其他';
}

export interface StyleInfo {
  documentStructure: '先背景后功能' | '先功能后背景' | '自由结构';
  detailLevel: '简洁（1页）' | '标准（3-5页）' | '详尽（10页以上）';
  language: '中文' | '英文' | '双语';
  tone: '正式' | '口语化' | '学术';
  specialHabits: string[];
  responseStyle: '先框架再细节' | '直接完整内容' | '逐步引导';
}

// ==================== 项目上下文 ====================

export interface ProjectContext {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  targetUsers: string;
  coreFeatures: string;
  decisions: Decision[];
  terminology: TermDefinition[];
  competitors: string[];
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  status: '已确定' | '待确认' | '已废弃';
}

export interface TermDefinition {
  term: string;
  definition: string;
}

// ==================== 对话历史 ====================

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  keyDecisions: Decision[];
  insights: Insight[];
  tags: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Insight {
  id: string;
  content: string;
  createdAt: string;
  category: '决策' | '发现' | '修改';
}

// ==================== 记忆注入模板 ====================

export interface MemoryPrompt {
  identity: string;
  style: string;
  project: string;
  history: string;
}

// ==================== 存储 ====================

export interface StorageConfig {
  basePath: string;
}

export type WriteMode = 'overwrite' | 'merge';

// ==================== 记忆推荐 ====================

export type RecommendationType = 'conversation' | 'decision' | 'term';

export interface MemoryRecommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  source: string;
  relevanceScore: number;
  projectName?: string;
  createdAt: string;
}
