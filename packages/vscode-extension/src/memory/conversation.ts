/**
 * Remember Me - 对话历史管理模块
 * 管理项目下的对话历史（~/.remember-me/projects/<name>/conversations/*.json）
 */

import type { Conversation, ChatMessage, Decision, Insight } from '../types';
import { getInfoExtractor } from './extractor';
import { getLogger } from '../utils/logger';
import { JsonStorage, getStorage } from './storage';

const CONVERSATIONS_DIR = 'conversations';

export interface ConversationSearchOptions {
  keyword?: string;
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  tags?: string[];
}

export interface SearchResult {
  projectName: string;
  conversation: Conversation;
  matchedIn: Array<'title' | 'message' | 'insight' | 'decision' | 'tag'>;
}

export class ConversationManager {
  private storage: JsonStorage;

  constructor(storage?: JsonStorage) {
    this.storage = storage || getStorage();
  }

  // ==================== 对话 CRUD ====================

  /**
   * 创建新对话
   */
  create(
    projectName: string,
    title: string,
    options?: { tags?: string[]; initialMessages?: ChatMessage[] }
  ): Conversation | null {
    const safeName = this.sanitizeDirName(projectName);
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id: this.generateId(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: options?.initialMessages || [],
      keyDecisions: [],
      insights: [],
      tags: options?.tags || [],
    };

    const filename = this.buildFilename(title);
    const success = this.storage.write(conversation, 'projects', safeName, CONVERSATIONS_DIR, filename);
    return success ? conversation : null;
  }

  /**
   * 读取对话
   */
  read(projectName: string, conversationId: string): Conversation | null {
    const safeName = this.sanitizeDirName(projectName);
    const files = this.storage.listDir('projects', safeName, CONVERSATIONS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const data = this.storage.read<Conversation>('projects', safeName, CONVERSATIONS_DIR, file);
      if (data && data.id === conversationId) {
        return data;
      }
    }

    return null;
  }

  /**
   * 通过文件名读取对话
   */
  readByFilename(projectName: string, filename: string): Conversation | null {
    const safeName = this.sanitizeDirName(projectName);
    if (!filename.endsWith('.json')) {
      filename += '.json';
    }
    return this.storage.read<Conversation>('projects', safeName, CONVERSATIONS_DIR, filename);
  }

  /**
   * 更新对话（完整替换，自动备份）
   */
  update(projectName: string, conversationId: string, updates: Partial<Omit<Conversation, 'id' | 'createdAt'>>): Conversation | null {
    const existing = this.read(projectName, conversationId);
    if (!existing) {
      getLogger().warn(`[RememberMe] 更新失败：对话不存在`);
      return null;
    }

    const filename = this.findFilename(projectName, conversationId);
    if (!filename) {
      return null;
    }

    // 备份
    const safeName = this.sanitizeDirName(projectName);
    this.storage.backup('projects', safeName, CONVERSATIONS_DIR, filename);

    const updated: Conversation = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const success = this.storage.write(updated, 'projects', safeName, CONVERSATIONS_DIR, filename);
    return success ? updated : null;
  }

  /**
   * 删除对话
   */
  delete(projectName: string, conversationId: string): boolean {
    const filename = this.findFilename(projectName, conversationId);
    if (!filename) {
      return false;
    }

    const safeName = this.sanitizeDirName(projectName);
    return this.storage.delete('projects', safeName, CONVERSATIONS_DIR, filename);
  }

  /**
   * 列出项目下所有对话（按时间倒序）
   */
  list(projectName: string): Array<{ filename: string; conversation: Conversation }> {
    const safeName = this.sanitizeDirName(projectName);
    const files = this.storage.listDir('projects', safeName, CONVERSATIONS_DIR);
    const conversations: Array<{ filename: string; conversation: Conversation }> = [];

    for (const file of files) {
      if (!file.endsWith('.json') || file === '.gitkeep') {
        continue;
      }
      const data = this.storage.read<Conversation>('projects', safeName, CONVERSATIONS_DIR, file);
      if (data) {
        conversations.push({ filename: file, conversation: data });
      }
    }

    conversations.sort((a, b) => new Date(b.conversation.updatedAt).getTime() - new Date(a.conversation.updatedAt).getTime());
    return conversations;
  }

  // ==================== 消息操作 ====================

  /**
   * 添加消息到对话
   */
  addMessage(projectName: string, conversationId: string, role: ChatMessage['role'], content: string): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    const messages = [...conversation.messages, message];
    const updated = this.update(projectName, conversationId, { messages });

    // 自动提取关键信息并生成洞察（A3 需求）
    if (updated) {
      const extractor = getInfoExtractor();
      const extracted = extractor.extractFromConversation(updated);
      if (extracted.length > 0) {
        const insights = extractor.generateInsights(extracted);
        const mergedInsights = [...updated.insights, ...insights];
        return this.update(projectName, conversationId, { insights: mergedInsights });
      }
    }

    return updated;
  }

  /**
   * 获取对话中的用户消息列表
   */
  getUserMessages(projectName: string, conversationId: string): ChatMessage[] {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return [];
    }
    return conversation.messages.filter(m => m.role === 'user');
  }

  /**
   * 获取对话中的助手消息列表
   */
  getAssistantMessages(projectName: string, conversationId: string): ChatMessage[] {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return [];
    }
    return conversation.messages.filter(m => m.role === 'assistant');
  }

  // ==================== 关键决策管理 ====================

  /**
   * 提取并保存关键决策
   */
  addKeyDecision(
    projectName: string,
    conversationId: string,
    title: string,
    description: string,
    status: Decision['status'] = '已确定'
  ): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const decision: Decision = {
      id: `decision_${Date.now()}`,
      title,
      description,
      createdAt: new Date().toISOString(),
      status,
    };

    const keyDecisions = [...conversation.keyDecisions, decision];
    return this.update(projectName, conversationId, { keyDecisions });
  }

  /**
   * 更新决策状态
   */
  updateKeyDecisionStatus(
    projectName: string,
    conversationId: string,
    decisionId: string,
    status: Decision['status']
  ): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const keyDecisions = conversation.keyDecisions.map(d =>
      d.id === decisionId ? { ...d, status } : d
    );

    return this.update(projectName, conversationId, { keyDecisions });
  }

  // ==================== 洞察管理 ====================

  /**
   * 添加洞察
   */
  addInsight(
    projectName: string,
    conversationId: string,
    content: string,
    category: Insight['category']
  ): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const insight: Insight = {
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      createdAt: new Date().toISOString(),
      category,
    };

    const insights = [...conversation.insights, insight];
    return this.update(projectName, conversationId, { insights });
  }

  /**
   * 删除洞察
   */
  removeInsight(projectName: string, conversationId: string, insightId: string): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const insights = conversation.insights.filter(i => i.id !== insightId);
    return this.update(projectName, conversationId, { insights });
  }

  // ==================== 标签管理 ====================

  /**
   * 添加标签
   */
  addTag(projectName: string, conversationId: string, tag: string): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    if (conversation.tags.includes(tag)) {
      return conversation;
    }

    const tags = [...conversation.tags, tag];
    return this.update(projectName, conversationId, { tags });
  }

  /**
   * 移除标签
   */
  removeTag(projectName: string, conversationId: string, tag: string): Conversation | null {
    const conversation = this.read(projectName, conversationId);
    if (!conversation) {
      return null;
    }

    const tags = conversation.tags.filter(t => t !== tag);
    return this.update(projectName, conversationId, { tags });
  }

  /**
   * 按标签筛选对话
   */
  filterByTag(projectName: string, tag: string): Array<{ filename: string; conversation: Conversation }> {
    const all = this.list(projectName);
    return all.filter(item => item.conversation.tags.includes(tag));
  }

  // ==================== 搜索 ====================

  /**
   * 在单个项目中搜索对话
   */
  search(projectName: string, options: ConversationSearchOptions): SearchResult[] {
    const all = this.list(projectName);
    const results: SearchResult[] = [];

    for (const item of all) {
      const conversation = item.conversation;
      const matchedIn: SearchResult['matchedIn'] = [];

      // 关键词搜索
      if (options.keyword) {
        const kw = options.keyword.toLowerCase();

        // 标题匹配
        if (conversation.title.toLowerCase().includes(kw)) {
          matchedIn.push('title');
        }

        // 消息内容匹配
        if (conversation.messages.some(m => m.content.toLowerCase().includes(kw))) {
          matchedIn.push('message');
        }

        // 洞察匹配
        if (conversation.insights.some(i => i.content.toLowerCase().includes(kw))) {
          matchedIn.push('insight');
        }

        // 决策匹配
        if (conversation.keyDecisions.some(d =>
          d.title.toLowerCase().includes(kw) || d.description.toLowerCase().includes(kw)
        )) {
          matchedIn.push('decision');
        }
      }

      // 标签筛选
      if (options.tags && options.tags.length > 0) {
        const hasMatchingTag = options.tags.some(tag => conversation.tags.includes(tag));
        if (hasMatchingTag) {
          matchedIn.push('tag');
        }
      }

      // 日期范围筛选
      let inDateRange = true;
      if (options.startDate || options.endDate) {
        const convDate = new Date(conversation.createdAt);
        if (options.startDate && convDate < new Date(options.startDate)) {
          inDateRange = false;
        }
        if (options.endDate && convDate > new Date(options.endDate)) {
          inDateRange = false;
        }
      }

      // 判断是否匹配：有 keyword 时必须有关键词匹配，有 tags 时必须有标签匹配
      let matches = true;
      if (options.keyword && !matchedIn.some(m => m !== 'tag')) {
        matches = false;
      }
      if (options.tags && options.tags.length > 0 && !matchedIn.includes('tag')) {
        matches = false;
      }
      if (!inDateRange) {
        matches = false;
      }

      // 如果没有 keyword 和 tags，但其他条件满足，也返回
      if (!options.keyword && !options.tags && inDateRange) {
        results.push({
          projectName,
          conversation,
          matchedIn: [],
        });
        continue;
      }

      if (matches && matchedIn.length > 0) {
        results.push({
          projectName,
          conversation,
          matchedIn: [...new Set(matchedIn)],
        });
      }
    }

    return results;
  }

  /**
   * 跨项目搜索（搜索所有项目下的对话）
   */
  searchAll(options: ConversationSearchOptions): SearchResult[] {
    const projectNames = this.storage.listDir('projects');
    const allResults: SearchResult[] = [];

    for (const projectName of projectNames) {
      const results = this.search(projectName, options);
      allResults.push(...results);
    }

    // 按对话更新时间倒序
    allResults.sort((a, b) =>
      new Date(b.conversation.updatedAt).getTime() - new Date(a.conversation.updatedAt).getTime()
    );

    return allResults;
  }

  /**
   * 获取最近的 N 条对话
   */
  getRecent(projectName: string, count: number = 5): Array<{ filename: string; conversation: Conversation }> {
    const all = this.list(projectName);
    return all.slice(0, count);
  }

  // ==================== 记忆注入 ====================

  /**
   * 构建对话历史的记忆注入文本
   * 取最近 N 条对话的关键决策和洞察
   */
  buildMemoryPrompt(projectName: string, limit: number = 3): string {
    const recent = this.getRecent(projectName, limit);
    if (recent.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('【相关历史】');

    for (const item of recent) {
      const conv = item.conversation;
      lines.push(`\n${conv.title}（${conv.createdAt.split('T')[0]}）`);

      if (conv.keyDecisions.length > 0) {
        lines.push('  关键决策：');
        conv.keyDecisions.forEach(d => {
          lines.push(`    • ${d.title}：${d.description}`);
        });
      }

      if (conv.insights.length > 0) {
        lines.push('  洞察：');
        conv.insights.forEach(i => {
          lines.push(`    • [${i.category}] ${i.content}`);
        });
      }
    }

    return lines.join('\n');
  }

  // ==================== 工具方法 ====================

  private sanitizeDirName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private buildFilename(title: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    return `${dateStr}-${safeTitle}.json`;
  }

  private findFilename(projectName: string, conversationId: string): string | null {
    const safeName = this.sanitizeDirName(projectName);
    const files = this.storage.listDir('projects', safeName, CONVERSATIONS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const data = this.storage.read<Conversation>('projects', safeName, CONVERSATIONS_DIR, file);
      if (data && data.id === conversationId) {
        return file;
      }
    }

    return null;
  }

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// 单例导出
let conversationManagerInstance: ConversationManager | null = null;

export function getConversationManager(storage?: JsonStorage): ConversationManager {
  if (!conversationManagerInstance) {
    conversationManagerInstance = new ConversationManager(storage);
  }
  return conversationManagerInstance;
}
