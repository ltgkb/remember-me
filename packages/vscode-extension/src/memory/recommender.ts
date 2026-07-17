/**
 * Remember Me - 智能推荐记忆模块（内容感知）
 * Phase 3 核心差异化特性：基于关键词匹配的离线记忆推荐系统
 * 零 AI 依赖，完全离线可用
 */

import type {
  MemoryRecommendation,
  RecommendationType,
  Conversation,
  Decision,
  ProjectContext,
} from '../types';
import { ConversationManager, getConversationManager } from './conversation';
import { ProjectManager, getProjectManager } from './project';
import { getLogger } from '../utils/logger';

/**
 * 中文停用词列表（PRD §2.2.2 内置）
 * 用于关键词提取时过滤无意义词汇
 */
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '这个', '那个', '我们', '你们', '他们', '它',
  '一个', '可以', '需要', '进行', '使用', '通过', '根据', '关于', '对于', '如果', '那么',
  '因为', '所以', '但是', '然而', '并且', '以及', '或者', '例如', '比如', '包括', '涉及',
  '基于', '采用', '实现', '完成', '开始', '结束', '继续', '下一步', '首先', '其次', '最后',
  '总之', '此外', '另外', '同时', '目前', '现在', '今天', '明天', '昨天', '上周', '下周',
  '之前', '之后', '已经', '正在', '将要', '应该', '必须', '可能', '能够', '不能', '不要',
  '没有', '有', '做', '来', '去', '到', '从', '上', '下', '中', '内', '外', '前', '后',
  '左', '右', '里', '间', '边', '面', '头', '尾', '部', '项', '个', '种', '类', '份',
  '次', '回', '遍', '顿', '阵', '番', '些', '点', '等', '等等', '之类', '似的', '一样',
  '一般', '通常', '常常', '经常', '往往', '一直', '总是', '有时', '偶尔', '忽然', '突然',
  '逐渐', '渐渐', '慢慢', '快', '慢', '早', '晚', '先', '后', '新', '旧', '好', '坏',
  '大', '小', '高', '低', '长', '短', '多', '少', '轻', '重', '深', '浅', '强', '弱',
  '冷', '热', '干', '湿', '明', '暗', '清', '浊', '正', '反', '真', '假', '对', '错',
  '是非', '有无', '开关', '进出', '起止', '生死', '成败', '得失', '输赢', '增减', '升降',
  '加减', '乘除', '分合', '聚散', '集离', '连断', '接', '合', '统', '独', '共', '私',
  '公', '全', '局', '整', '零', '完', '缺', '满', '空', '实', '虚', '浓', '淡', '厚',
  '薄', '宽', '窄', '粗', '细', '圆', '方', '平', '斜', '直', '曲', '硬', '软', '韧',
  '脆', '松', '紧', '稀', '密', '疏', '盈', '亏', '足', '欠', '超', '过', '不及', '达',
  '至', '及', '够', '溢', '微', '略', '稍', '较', '比', '更', '最', '极', '甚', '太',
  '很', '非常', '特别', '十分', '相当', '比较', '稍微', '略微', '有点儿', '有些', '一些',
  '一点', '几乎', '差不多', '大概', '大约', '约', '左右', '上下', '远近',
]);

/**
 * 英文停用词列表（C1 迭代新增）
 * 用于关键词提取时过滤无意义英文词汇
 */
const ENGLISH_STOP_WORDS = new Set([
  // 基础冠词/代词
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'mine', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'we', 'us', 'our', 'they', 'them', 'their',
  // 常用动词/助动词
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  // 常见介词/连词
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up',
  'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'and', 'or', 'but', 'so', 'if', 'because', 'until', 'while',
  // 常见副词/限定词
  'not', 'no', 'nor', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
]);
interface Candidate {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  source: string;
  projectName: string;
  createdAt: string;
  /** 用于关键词匹配的原始文本 */
  matchText: string;
  /** 是否为用户消息内容匹配 */
  hasUserMessageMatch: boolean;
  /** 决策状态（仅 decision 类型有效） */
  decisionStatus?: Decision['status'];
}

/** 相关性得分上限 */
const MAX_RELEVANCE_SCORE = 1.0;

/**
 * 记忆推荐器
 * 基于关键词重叠度计算内容相关性，支持多维度权重加成
 */
export class MemoryRecommender {
  private conversationManager: ConversationManager;
  private projectManager: ProjectManager;
  private sessionIgnoreSet: Set<string>;

  constructor(
    conversationManager?: ConversationManager,
    projectManager?: ProjectManager
  ) {
    this.conversationManager = conversationManager || getConversationManager();
    this.projectManager = projectManager || getProjectManager();
    this.sessionIgnoreSet = new Set();
  }

  /**
   * 基于当前对话内容，从历史记忆中推荐相关条目
   * @param currentContent - 当前对话内容
   * @param currentProject - 当前项目名称（可选）
   * @returns 按 relevanceScore 排序的前 5 条推荐
   */
  recommend(currentContent: string, currentProject?: string): MemoryRecommendation[] {
    try {
      const contentKeywords = this.extractKeywords(currentContent);
      if (contentKeywords.length === 0) {
        return [];
      }

      const candidates = this.collectCandidates(currentProject);
      const scoredRecommendations: MemoryRecommendation[] = [];

      for (const candidate of candidates) {
        if (this.sessionIgnoreSet.has(candidate.id)) {
          continue;
        }

        const score = this.calculateRelevance(candidate, contentKeywords, currentProject);
        if (score > 0) {
          scoredRecommendations.push({
            id: candidate.id,
            type: candidate.type,
            title: candidate.title,
            description: candidate.description,
            source: candidate.source,
            relevanceScore: Math.min(score, MAX_RELEVANCE_SCORE),
            projectName: candidate.projectName,
            createdAt: candidate.createdAt,
          });
        }
      }

      // 按 relevanceScore 降序，取前 5
      return scoredRecommendations
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5);
    } catch (error) {
      getLogger().error('[RememberMe] 记忆推荐计算失败', error);
      return [];
    }
  }

  /**
   * 当前会话内忽略某条推荐
   * @param recommendationId - 要忽略的记忆 ID
   */
  ignoreInSession(recommendationId: string): void {
    this.sessionIgnoreSet.add(recommendationId);
  }

  /**
   * 清除会话忽略列表
   */
  clearSessionIgnores(): void {
    this.sessionIgnoreSet.clear();
  }

  // ==================== 关键词提取 ====================

  /**
   * 从文本中提取关键词
   * 按空格/标点/中文字符切分，过滤停用词和过短 token
   * @param text - 输入文本
   * @returns 去重后的关键词数组
   */
  extractKeywords(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const keywords: string[] = [];

    // 先按空格/标点切分
    const segments = text.split(/[\s,.;:!?，。；：！？、'"()[\]{}]+/);

    for (const segment of segments) {
      if (!segment) {
        continue;
      }

      // 分离连续中文字符和连续英文/数字
      const parts = segment.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9._-]+/g) || [];

      for (const part of parts) {
        if (/^[\u4e00-\u9fa5]+$/.test(part)) {
          // 纯中文：按 2-gram ~ 4-gram 提取
          const maxN = Math.min(4, part.length);
          for (let len = 2; len <= maxN; len++) {
            for (let i = 0; i <= part.length - len; i++) {
              const ngram = part.slice(i, i + len);
              if (!STOP_WORDS.has(ngram)) {
                keywords.push(ngram);
              }
            }
          }
        } else if (/^[a-zA-Z0-9._-]+$/.test(part)) {
          // 英文/数字：转小写，长度 >= 2，同时检查中英文停用词
          const lower = part.toLowerCase();
          if (lower.length >= 2 && !STOP_WORDS.has(lower) && !ENGLISH_STOP_WORDS.has(lower)) {
            keywords.push(lower);
          }
        }
      }
    }

    // 去重并保持顺序
    return [...new Set(keywords)];
  }
  // ==================== 候选收集 ====================

  /**
   * 收集所有历史记忆作为候选
   * 来源：项目决策、项目术语、所有对话的标题/关键决策/洞察
   * @param currentProject - 当前项目名（用于权重计算，不影响候选范围）
   * @returns 候选记忆列表
   */
  private collectCandidates(currentProject?: string): Candidate[] {
    const candidates: Candidate[] = [];

    // 1. 收集项目上下文中的决策和术语
    const projects = this.projectManager.list();
    for (const { name: projectName, context } of projects) {
      // 项目决策
      for (const decision of context.decisions) {
        candidates.push({
          id: `proj_decision_${projectName}_${decision.id}`,
          type: 'decision',
          title: decision.title,
          description: decision.description,
          source: decision.title,
          projectName,
          createdAt: decision.createdAt,
          matchText: `${decision.title} ${decision.description}`,
          hasUserMessageMatch: false,
          decisionStatus: decision.status,
        });
      }

      // 项目术语
      for (const term of context.terminology) {
        candidates.push({
          id: `proj_term_${projectName}_${term.term}`,
          type: 'term',
          title: term.term,
          description: term.definition,
          source: term.term,
          projectName,
          createdAt: context.updatedAt,
          matchText: `${term.term} ${term.definition}`,
          hasUserMessageMatch: false,
        });
      }
    }

    // 2. 收集所有对话及其中的决策和洞察
    const allProjectNames = projects.map(p => p.name);
    // 补充 currentProject（如果尚未在列表中）
    if (currentProject && !allProjectNames.includes(currentProject)) {
      allProjectNames.push(currentProject);
    }

    for (const projectName of allProjectNames) {
      const conversations = this.conversationManager.list(projectName);
      for (const { conversation } of conversations) {
        // 对话标题
        candidates.push({
          id: `conv_${projectName}_${conversation.id}`,
          type: 'conversation',
          title: conversation.title,
          description: this.buildConversationDescription(conversation),
          source: conversation.title,
          projectName,
          createdAt: conversation.updatedAt,
          matchText: `${conversation.title} ${conversation.tags.join(' ')}`,
          hasUserMessageMatch: false,
        });

        // 对话中的关键决策
        for (const decision of conversation.keyDecisions) {
          candidates.push({
            id: `conv_decision_${projectName}_${conversation.id}_${decision.id}`,
            type: 'decision',
            title: decision.title,
            description: decision.description,
            source: `${conversation.title} - ${decision.title}`,
            projectName,
            createdAt: decision.createdAt,
            matchText: `${decision.title} ${decision.description}`,
            hasUserMessageMatch: false,
            decisionStatus: decision.status,
          });
        }

        // 对话中的洞察
        for (const insight of conversation.insights) {
          candidates.push({
            id: `conv_insight_${projectName}_${conversation.id}_${insight.id}`,
            type: 'conversation',
            title: insight.content.slice(0, 50),
            description: insight.content,
            source: conversation.title,
            projectName,
            createdAt: insight.createdAt,
            matchText: insight.content,
            hasUserMessageMatch: false,
          });
        }

        // 用户消息内容匹配标记
        const userMessages = conversation.messages.filter(m => m.role === 'user');
        const userText = userMessages.map(m => m.content).join(' ');
        if (userText.length > 0) {
          // 为对话标题候选增加用户消息匹配标记
          const convCandidate = candidates.find(
            c => c.id === `conv_${projectName}_${conversation.id}`
          );
          if (convCandidate) {
            convCandidate.hasUserMessageMatch = true;
            convCandidate.matchText += ` ${userText}`;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * 构建对话描述文本
   */
  private buildConversationDescription(conversation: Conversation): string {
    const parts: string[] = [];
    if (conversation.keyDecisions.length > 0) {
      parts.push(`决策：${conversation.keyDecisions.map(d => d.title).join('、')}`);
    }
    if (conversation.insights.length > 0) {
      parts.push(`洞察：${conversation.insights.map(i => i.content).join('、')}`);
    }
    if (conversation.tags.length > 0) {
      parts.push(`标签：${conversation.tags.join('、')}`);
    }
    return parts.join(' | ') || '无摘要';
  }

  // ==================== 相关性计算 ====================

  /**
   * 计算候选记忆与当前内容的相关性得分
   * @param candidate - 候选记忆
   * @param contentKeywords - 当前内容的关键词列表
   * @param currentProject - 当前项目名称
   * @returns 相关性得分（0-1，已 clip）
   */
  private calculateRelevance(
    candidate: Candidate,
    contentKeywords: string[],
    currentProject?: string
  ): number {
    const candidateKeywords = this.extractKeywords(candidate.matchText);
    if (candidateKeywords.length === 0) {
      return 0;
    }

    // 计算重叠关键词
    const overlap = contentKeywords.filter(k => candidateKeywords.includes(k));
    if (overlap.length === 0) {
      return 0;
    }

    // 基础分数：重叠关键词数 / 总关键词数（Dice 系数变体）
    const totalKeywords = contentKeywords.length + candidateKeywords.length;
    let score = totalKeywords > 0 ? (2 * overlap.length) / totalKeywords : 0;

    // 同一项目加成 +0.2
    if (currentProject && candidate.projectName === currentProject) {
      score += 0.2;
    }

    // 近期（7天内）加成 +0.15
    const daysSince = this.daysSince(candidate.createdAt);
    if (daysSince !== null && daysSince <= 7) {
      score += 0.15;
    }

    // 已确定决策加成 +0.1
    if (candidate.type === 'decision' && candidate.decisionStatus === '已确定') {
      score += 0.1;
    }

    // 用户消息内容匹配加成 +0.1
    if (candidate.hasUserMessageMatch) {
      score += 0.1;
    }

    return Math.min(score, MAX_RELEVANCE_SCORE);
  }

  /**
   * 计算距今天数
   * @param isoDate - ISO 8601 日期字符串
   * @returns 天数（无法解析时返回 null）
   */
  private daysSince(isoDate: string): number | null {
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
        return null;
      }
      const now = Date.now();
      const diffMs = now - date.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }
}

// ==================== 单例导出 ====================

let recommenderInstance: MemoryRecommender | null = null;

/**
 * 获取 MemoryRecommender 单例实例
 * @param conversationManager - 可选的对话管理器实例
 * @param projectManager - 可选的项目管理器实例
 * @returns MemoryRecommender 实例
 */
export function getMemoryRecommender(
  conversationManager?: ConversationManager,
  projectManager?: ProjectManager
): MemoryRecommender {
  if (!recommenderInstance) {
    recommenderInstance = new MemoryRecommender(conversationManager, projectManager);
  }
  return recommenderInstance;
}
