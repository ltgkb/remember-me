/**
 * Remember Me - 关键信息自动提取模块
 * 基于正则规则引擎对对话内容进行结构化提取，无需 AI 依赖，保证本地离线可用
 */

import type { Conversation, Insight } from '../types';

/**
 * 提取到的信息类型
 */
export type ExtractedInfoType = 'decision' | 'terminology' | 'competitor' | 'modification' | 'discovery';

/**
 * 提取结果的数据结构
 */
export interface ExtractedInfo {
  /** 提取信息的类型 */
  type: ExtractedInfoType;
  /** 原始提取文本 */
  content: string;
  /** 0-1 之间的置信度 */
  confidence: number;
  /** 结构化解析结果（可选） */
  parsedValue?: {
    /** 决策标题 / 术语名 / 竞品名 */
    title?: string;
    /** 描述 / 定义 */
    description?: string;
  };
}

/**
 * 匹配规则定义
 */
interface ExtractionRule {
  /** 匹配类型 */
  type: ExtractedInfoType;
  /** 正则表达式 */
  pattern: RegExp;
  /** 置信度 */
  confidence: number;
  /** 是否可提取结构化字段 */
  hasParsedValue?: boolean;
  /** 解析 title 的组索引 */
  titleGroup?: number;
  /** 解析 description 的组索引 */
  descGroup?: number;
}

/**
 * 关键信息提取器
 * 通过正则规则引擎从对话或文本中提取结构化信息
 */
export class InfoExtractor {
  /**
   * 提取规则列表，按优先级排序
   * 每个规则包含正则模式、置信度和可选的结构化解析配置
   */
  private readonly rules: ExtractionRule[] = [
    // ==================== 决策（Decision）====================
    {
      type: 'decision',
      pattern: /(?:我们决定|已经决定|最终决定|团队决定|决定)(?:了|要)?\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.9,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'decision',
      pattern: /(?:确定使用|确定采用|确定选择|选定|选用)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.9,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'decision',
      pattern: /(?:考虑用|考虑采用|考虑选择|倾向于|倾向用)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.5,
      hasParsedValue: true,
      titleGroup: 1,
    },

    // ==================== 术语定义（Terminology）====================
    {
      type: 'terminology',
      pattern: /(.{1,20}?)(?:\s*是指\s*|\s*定义为\s*|\s*的意思是\s*|\s*表示\s*)(.{2,100}?)(?:[。；]|\n|$)/,
      confidence: 0.85,
      hasParsedValue: true,
      titleGroup: 1,
      descGroup: 2,
    },
    {
      type: 'terminology',
      pattern: /(?:我们称|我们把|我们将|叫|称为)\s*(.{1,20}?)\s*(?:为|叫做)\s*(.{2,100}?)(?:[。；]|\n|$)/,
      confidence: 0.85,
      hasParsedValue: true,
      titleGroup: 1,
      descGroup: 2,
    },
    {
      type: 'terminology',
      pattern: /(.{1,20}?)(?:\s*[:：]\s*是一种|是一种|属于)(.{2,100}?)(?:[。；]|\n|$)/,
      confidence: 0.7,
      hasParsedValue: true,
      titleGroup: 1,
      descGroup: 2,
    },

    // ==================== 竞品提及（Competitor）====================
    {
      type: 'competitor',
      pattern: /(?:竞品有|竞品包括|竞品是|竞争对手包括|竞争对手有|类似产品有|竞品为|竞品方面|竞品分析|竞品对比|与)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.8,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'competitor',
      pattern: /(?:相比|对比|相较于|相对于)\s*(.+?)(?:[，,]|\s)(?:我们|还是|更|则|的|来说|而言|...)/,
      confidence: 0.6,
      hasParsedValue: true,
      titleGroup: 1,
    },

    // ==================== 关键修改（Modification）====================
    {
      type: 'modification',
      pattern: /(?:修改为|调整为|改为|改成|变更|更新为|切换为|替换为|替换掉|改成用|改回|更新至|改成|调整成|调整到)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.9,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'modification',
      pattern: /(?:不再使用|不再采用|放弃|去掉|移除|删除|取消|废弃|停用|禁用)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.8,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'modification',
      pattern: /(?:优化|改进|重构|升级|降级|替换|调整|改动|改一下|改改)\s*[:：]?\s*(.+?)(?:[。；]|\n|$)/,
      confidence: 0.6,
      hasParsedValue: true,
      titleGroup: 1,
    },

    // ==================== 新发现（Discovery）====================
    {
      type: 'discovery',
      pattern: /(?:发现|注意到|意识到|察觉到|观察到|认识到|领悟到|了解到|察觉到|感知到|感觉到|体会到|领悟到|察觉到|警觉到|警觉到|察觉到|察觉)\s*(?:了|到|，|,|\s)?\s*(.{2,200}?)(?:[。；]|\n|$)/,
      confidence: 0.9,
      hasParsedValue: true,
      titleGroup: 1,
    },
    {
      type: 'discovery',
      pattern: /(?:原来|其实|事实上|实际上|没想到|出乎意料|令人惊讶|值得注意的是|有意思的是|关键点是|核心问题是|根本原因是|问题出在|根源是|症结在于)\s*(.{2,200}?)(?:[。；]|\n|$)/,
      confidence: 0.7,
      hasParsedValue: true,
      titleGroup: 1,
    },
  ];

  /**
   * 从完整对话中提取所有关键信息
   * 遍历对话中所有消息，合并提取结果
   *
   * @param conversation - 对话对象
   * @returns 提取到的信息列表，按置信度降序排列
   */
  extractFromConversation(conversation: Conversation): ExtractedInfo[] {
    if (!conversation.messages || conversation.messages.length === 0) {
      return [];
    }

    const allResults: ExtractedInfo[] = [];

    for (const message of conversation.messages) {
      const results = this.extractFromText(message.content);
      allResults.push(...results);
    }

    // 去重：基于 content 和 type 组合去重
    const seen = new Set<string>();
    const deduplicated = allResults.filter((item) => {
      const key = `${item.type}::${item.content}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    // 按置信度降序排列
    return deduplicated.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 从纯文本中提取关键信息
   * 依次应用所有规则，收集匹配结果
   *
   * @param text - 输入文本
   * @returns 提取到的信息列表
   */
  extractFromText(text: string): ExtractedInfo[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const results: ExtractedInfo[] = [];

    for (const rule of this.rules) {
      // 使用全局标志，提取所有匹配
      const globalPattern = new RegExp(rule.pattern.source, 'g');
      let match: RegExpExecArray | null;

      // 重置 lastIndex
      globalPattern.lastIndex = 0;

      while ((match = globalPattern.exec(text)) !== null) {
        // 避免零宽匹配导致无限循环
        if (match.index === globalPattern.lastIndex) {
          globalPattern.lastIndex++;
          continue;
        }

        const fullMatch = match[0];
        const extractedInfo = this.buildExtractedInfo(rule, match, fullMatch, text);
        results.push(extractedInfo);
      }
    }

    // 按置信度降序排列
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 将提取结果转换为 Insight 对象
   * 用于持久化到对话的 insights 数组中
   *
   * @param extracted - 提取到的信息列表
   * @returns Insight 对象列表
   */
  generateInsights(extracted: ExtractedInfo[]): Insight[] {
    if (!extracted || extracted.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const insights: Insight[] = [];

    for (const item of extracted) {
      const category = this.mapTypeToCategory(item.type);
      const content = this.buildInsightContent(item);

      const insight: Insight = {
        id: this.generateInsightId(item.type),
        content,
        createdAt: now,
        category,
      };

      insights.push(insight);
    }

    return insights;
  }

  // ==================== 私有工具方法 ====================

  /**
   * 构建单个提取结果对象
   */
  private buildExtractedInfo(
    rule: ExtractionRule,
    match: RegExpExecArray,
    fullMatch: string,
    _sourceText: string
  ): ExtractedInfo {
    const info: ExtractedInfo = {
      type: rule.type,
      content: fullMatch.trim(),
      confidence: rule.confidence,
    };

    // 提取结构化字段
    if (rule.hasParsedValue) {
      const parsedValue: ExtractedInfo['parsedValue'] = {};

      if (rule.titleGroup !== undefined && match[rule.titleGroup]) {
        parsedValue.title = match[rule.titleGroup].trim();
      }

      if (rule.descGroup !== undefined && match[rule.descGroup]) {
        parsedValue.description = match[rule.descGroup].trim();
      }

      // 如果有 title 或 description，则赋值 parsedValue
      if (parsedValue.title || parsedValue.description) {
        info.parsedValue = parsedValue;
      }
    }

    return info;
  }

  /**
   * 将提取类型映射为 Insight 的 category
   */
  private mapTypeToCategory(type: ExtractedInfoType): Insight['category'] {
    switch (type) {
      case 'decision':
        return '决策';
      case 'modification':
        return '修改';
      case 'terminology':
      case 'competitor':
      case 'discovery':
      default:
        return '发现';
    }
  }

  /**
   * 构建 Insight 的内容文本
   */
  private buildInsightContent(item: ExtractedInfo): string {
    if (item.parsedValue?.title) {
      if (item.parsedValue.description) {
        return `${item.parsedValue.title}：${item.parsedValue.description}`;
      }
      return item.parsedValue.title;
    }
    return item.content;
  }

  /**
   * 生成 Insight 的唯一 ID
   */
  private generateInsightId(type: ExtractedInfoType): string {
    const prefix = {
      decision: 'decision',
      terminology: 'term',
      competitor: 'competitor',
      modification: 'mod',
      discovery: 'discovery',
    }[type];
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

/**
 * 默认提取器实例（单例）
 */
let defaultExtractor: InfoExtractor | null = null;

/**
 * 获取默认提取器实例
 */
export function getInfoExtractor(): InfoExtractor {
  if (!defaultExtractor) {
    defaultExtractor = new InfoExtractor();
  }
  return defaultExtractor;
}
