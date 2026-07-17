/**
 * Remember Me - 记忆更新检测模块
 * 监听用户与 AI 的对话内容，基于正则规则检测潜在的新信息，
 * 支持决策、术语、竞品和功能四种更新类型的自动检测与确认。
 */

import type { ChatMessage, Conversation } from '../types';
import { ProjectManager, getProjectManager } from './project';
import { ConversationManager, getConversationManager } from './conversation';
import { getLogger } from '../utils/logger';

/**
 * 检测到的更新类型
 */
export type UpdateType = 'decision' | 'terminology' | 'competitor' | 'feature';

/**
 * 检测结果数据结构
 */
export interface DetectedUpdate {
  /** 更新类型 */
  type: UpdateType;
  /** 匹配到的原始文本 */
  rawText: string;
  /** 建议的标题（用于决策）或术语名 */
  suggestedTitle?: string;
  /** 建议的描述 */
  suggestedDescription?: string;
  /** 置信度（0-1） */
  confidence: number;
}

/**
 * 检测规则定义
 */
interface DetectionRule {
  type: UpdateType;
  // 正则匹配，支持命名捕获组
  patterns: RegExp[];
  // 置信度计算函数
  confidence: (match: RegExpMatchArray, text: string) => number;
  // 提取建议标题和描述
  extract: (match: RegExpMatchArray) => {
    suggestedTitle?: string;
    suggestedDescription?: string;
  };
}

/**
 * 检测规则库
 */
const DETECTION_RULES: DetectionRule[] = [
  {
    type: 'decision',
    patterns: [
      /我们?[决定|确定|选定](?:用|采用|使用|选择)?\s*([^，。\n]+)/i,
      /确定方案\s*(?:为|是)?\s*([^，。\n]+)/i,
      /选定\s*([^，。\n]+)/i,
      /决定\s*(?:采用|使用|选择)\s*([^，。\n]+)/i,
    ],
    confidence: (match, text) => {
      let base = 0.6;
      const content = match[1] || '';
      // 内容长度适中增加置信度
      if (content.length >= 5 && content.length <= 50) { base += 0.1; }
      // 包含明确决策关键词
      if (/方案|技术|架构|框架|策略|语言|平台|工具/i.test(content)) { base += 0.15; }
      // 文本上下文较完整
      if (text.length > 20) { base += 0.05; }
      return Math.min(base, 0.95);
    },
    extract: (match) => {
      const content = match[1].trim();
      // 尝试提取"用...做..."结构中的标题和描述
      const parts = content.split(/(?:作为|用于|做|实现)/);
      if (parts.length > 1) {
        return {
          suggestedTitle: parts[0].trim().slice(0, 50),
          suggestedDescription: content.slice(0, 200),
        };
      }
      return {
        suggestedTitle: content.slice(0, 50),
        suggestedDescription: content.slice(0, 200),
      };
    },
  },
  {
    type: 'terminology',
    patterns: [
      /([^，。\n]{2,20})\s*(?:是|被|定义)(?:指|为|作|成)\s*([^，。\n]+)/i,
      /([^，。\n]{2,20})\s*(?:指|代表|意指|意味着)\s*([^，。\n]+)/i,
      /(?:用户是指|这里的|我们说的)([^，。\n]{2,20})\s*(?:指|是|代表)\s*([^，。\n]+)/i,
    ],
    confidence: (match, text) => {
      let base = 0.6;
      const term = match[1] || '';
      const definition = match[2] || '';
      // 术语名长度适中
      if (term.length >= 2 && term.length <= 15) { base += 0.1; }
      // 定义有实质内容
      if (definition.length >= 5) { base += 0.1; }
      // 不包含过多标点，更像正经定义
      if (!/[?!！？]/i.test(definition)) { base += 0.1; }
      return Math.min(base, 0.95);
    },
    extract: (match) => {
      // 尝试区分术语名和定义
      let term = match[1].trim();
      let definition = match[2].trim();
      // 如果 match[1] 包含前缀词，尝试清理
      term = term.replace(/^(?:用户是指|这里的|我们说的)/, '');
      return {
        suggestedTitle: term.slice(0, 30),
        suggestedDescription: definition.slice(0, 200),
      };
    },
  },
  {
    type: 'competitor',
    patterns: [
      /(?:竞品|竞争对手|类似产品|对手)(?:有|包括|是|如)?\s*:?\s*([^，。\n]+)/i,
      /(?:类似|竞品|对手)(?:产品|工具|平台|应用)(?:有|包括|如)?\s*:?\s*([^，。\n]+)/i,
      /(?:像|类似|对标)\s*([^，。\n]{2,20})\s*(?:这样的|一样的|这类)?/i,
    ],
    confidence: (match, text) => {
      let base = 0.6;
      const content = match[1] || '';
      if (content.length >= 2 && content.length <= 40) { base += 0.1; }
      // 竞品名通常是大写或专有名词
      if (/[A-Z]/.test(content) || /^[\u4e00-\u9fa5]{2,10}/.test(content)) { base += 0.15; }
      return Math.min(base, 0.95);
    },
    extract: (match) => {
      const content = match[1].trim();
      // 竞品可能是多个，取第一个作为标题
      const firstCompetitor = content.split(/[,，、和/]/)[0].trim();
      return {
        suggestedTitle: firstCompetitor.slice(0, 40),
        suggestedDescription: content.slice(0, 200),
      };
    },
  },
  {
    type: 'feature',
    patterns: [
      /(?:增加|新增|支持|添加|实现|开发)(?:了|有)?\s*([^，。\n]+)/i,
      /(?:需要|应该|计划|准备)(?:支持|实现|添加|开发)(?:了|有)?\s*([^，。\n]+)/i,
      /([^，。\n]+)\s*功能(?:新增|增加|支持|开发)/i,
      /(?:feature|功能点)\s*(?:为|是|包括)?\s*([^，。\n]+)/i,
    ],
    confidence: (match, text) => {
      let base = 0.55;
      const content = match[1] || '';
      if (content.length >= 3 && content.length <= 60) { base += 0.1; }
      // 包含功能描述关键词
      if (/模块|接口|页面|权限|搜索|导出|导入|通知|消息|统计|管理|编辑|删除|创建|同步|集成|导出|上传|下载|API/i.test(content)) { base += 0.15; }
      return Math.min(base, 0.9);
    },
    extract: (match) => {
      const content = match[1].trim();
      return {
        suggestedTitle: content.slice(0, 50),
        suggestedDescription: content.slice(0, 200),
      };
    },
  },
];

/**
 * 更新检测器
 * 基于正则规则检测对话中的潜在更新信息
 */
export class UpdateDetector {
  private projectManager: ProjectManager;
  private conversationManager: ConversationManager;

  constructor(
    projectManager?: ProjectManager,
    conversationManager?: ConversationManager
  ) {
    this.projectManager = projectManager || getProjectManager();
    this.conversationManager = conversationManager || getConversationManager();
  }

  /**
   * 检测单条消息中的潜在更新
   * @param message 聊天消息
   * @returns 检测到的更新列表
   */
  detect(message: ChatMessage): DetectedUpdate[] {
    const text = message.content;
    if (!text || text.trim().length === 0) {
      return [];
    }
    const results: DetectedUpdate[] = [];

    for (const rule of DETECTION_RULES) {
      for (const pattern of rule.patterns) {
        const match = text.match(pattern);
        if (match) {
          const extracted = rule.extract(match);
          const confidence = rule.confidence(match, text);
          results.push({
            type: rule.type,
            rawText: match[0],
            suggestedTitle: extracted.suggestedTitle,
            suggestedDescription: extracted.suggestedDescription,
            confidence,
          });
          // 同一规则只取第一个匹配，避免重复
          break;
        }
      }
    }

    return results;
  }

  /**
   * 检测并返回置信度最高的结果
   * @param message 聊天消息
   * @returns 置信度最高的更新，或 null
   */
  detectTop(message: ChatMessage): DetectedUpdate | null {
    const results = this.detect(message);
    if (results.length === 0) {
      return null;
    }
    return results.reduce((top, current) =>
      current.confidence > top.confidence ? current : top
    );
  }

  /**
   * 应用更新到项目
   * @param projectName 项目名称
   * @param update 检测到的更新
   * @returns 是否成功应用
   */
  async applyUpdate(
    projectName: string,
    update: DetectedUpdate
  ): Promise<boolean> {
    const project = this.projectManager.read(projectName);
    if (!project) {
      getLogger().warn(`[RememberMe] applyUpdate 失败：项目 "${projectName}" 不存在`);
      return false;
    }

    try {
      switch (update.type) {
        case 'decision': {
          const title = update.suggestedTitle || '未命名决策';
          const description = update.suggestedDescription || update.rawText;
          const result = this.projectManager.addDecision(
            projectName,
            title,
            description,
            '已确定'
          );
          return result !== null;
        }
        case 'terminology': {
          const term = update.suggestedTitle || update.rawText;
          const definition = update.suggestedDescription || '待补充定义';
          const result = this.projectManager.setTerminology(
            projectName,
            term,
            definition
          );
          return result !== null;
        }
        case 'competitor': {
          const competitor = update.suggestedTitle || update.rawText;
          const result = this.projectManager.addCompetitor(
            projectName,
            competitor
          );
          return result !== null;
        }
        case 'feature': {
          const feature = update.suggestedTitle || update.rawText;
          // 读取当前核心功能，追加新功能
          const currentFeatures = project.coreFeatures || '';
          const separator = currentFeatures.length > 0 ? '、' : '';
          const newFeatures = currentFeatures + separator + feature;
          const result = this.projectManager.update(projectName, {
            coreFeatures: newFeatures,
          });
          return result !== null;
        }
        default:
          return false;
      }
    } catch (err) {
      getLogger().error(`[RememberMe] applyUpdate 异常：${err}`);
      return false;
    }
  }

  /**
   * 标记更新为待确认状态
   * 将更新写入项目的 decisions 数组，status 为 '待确认'
   * @param projectName 项目名称
   * @param update 检测到的更新
   * @returns 是否成功标记
   */
  async markAsPending(
    projectName: string,
    update: DetectedUpdate
  ): Promise<boolean> {
    const project = this.projectManager.read(projectName);
    if (!project) {
      getLogger().warn(`[RememberMe] markAsPending 失败：项目 "${projectName}" 不存在`);
      return false;
    }

    try {
      let title: string;
      let description: string;

      switch (update.type) {
        case 'decision':
          title = update.suggestedTitle || '待确认决策';
          description = update.suggestedDescription || update.rawText;
          break;
        case 'terminology':
          title = `术语: ${update.suggestedTitle || update.rawText}`;
          description = `定义: ${update.suggestedDescription || '待补充'}`;
          break;
        case 'competitor':
          title = `竞品: ${update.suggestedTitle || update.rawText}`;
          description = `检测到竞品信息: ${update.suggestedDescription || update.rawText}`;
          break;
        case 'feature':
          title = `功能: ${update.suggestedTitle || update.rawText}`;
          description = `检测到新功能: ${update.suggestedDescription || update.rawText}`;
          break;
        default:
          title = '未分类更新';
          description = update.rawText;
      }

      const result = this.projectManager.addDecision(
        projectName,
        title,
        description,
        '待确认'
      );
      return result !== null;
    } catch (err) {
      getLogger().error(`[RememberMe] markAsPending 异常：${err}`);
      return false;
    }
  }

  /**
   * 在对话中批量检测所有消息的潜在更新
   * @param conversation 对话对象
   * @returns 所有检测到的更新列表（按置信度降序）
   */
  detectInConversation(conversation: Conversation): DetectedUpdate[] {
    if (!conversation.messages || conversation.messages.length === 0) {
      return [];
    }

    const allResults: DetectedUpdate[] = [];
    for (const message of conversation.messages) {
      const results = this.detect(message);
      allResults.push(...results);
    }

    // 去重：基于 rawText 去重
    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (seen.has(r.rawText)) {
        return false;
      }
      seen.add(r.rawText);
      return true;
    });

    // 按置信度降序排列
    uniqueResults.sort((a, b) => b.confidence - a.confidence);
    return uniqueResults;
  }
}

// 单例导出（保持与 ProjectManager / ConversationManager 一致的导出风格）
let updateDetectorInstance: UpdateDetector | null = null;

export function getUpdateDetector(
  projectManager?: ProjectManager,
  conversationManager?: ConversationManager
): UpdateDetector {
  if (!updateDetectorInstance) {
    updateDetectorInstance = new UpdateDetector(projectManager, conversationManager);
  }
  return updateDetectorInstance;
}
