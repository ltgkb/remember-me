/**
 * Remember Me - 风格一致性检查器
 * 根据用户画像的 StyleInfo 检查 AI 生成内容的一致性（PRD §2.3.3 风格一致性检查）
 */

import type { Profile } from '../types';

/**
 * 风格检查结果接口
 */
export interface StyleCheckResult {
  passed: boolean; // 是否通过检查
  category: 'structure' | 'language' | 'detail' | 'habit' | 'tone';
  message: string; // 检查结果描述
  severity: 'warning' | 'error' | 'info';
  suggestion?: string; // 建议的修复内容
  autoFixable: boolean; // 是否可自动修复
}

/**
 * 风格检查选项
 */
export interface StyleCheckOptions {
  documentType?: string; // 'PRD' | '商业计划书' | '论文' | '调研' | '活动' | '设计' | '技术' | '汇报'
  autoFix?: boolean; // 是否自动修复
}

/**
 * 风格检查器类
 * 根据用户画像对 AI 生成内容进行多维风格检查
 */
export class StyleChecker {
  private profile?: Profile;

  constructor(profile?: Profile) {
    this.profile = profile;
  }

  /**
   * 对内容进行完整风格检查
   */
  check(content: string, options?: StyleCheckOptions): StyleCheckResult[] {
    const results: StyleCheckResult[] = [];
    const docType = options?.documentType;

    if (!this.profile) {
      results.push({
        passed: true,
        category: 'structure',
        message: '未加载用户画像，跳过风格检查',
        severity: 'info',
        autoFixable: false,
      });
      return results;
    }

    const structure = this.checkStructure(content, docType);
    if (structure) {
      results.push(structure);
    }

    const language = this.checkLanguage(content);
    if (language) {
      results.push(language);
    }

    const detail = this.checkDetailLevel(content);
    if (detail) {
      results.push(detail);
    }

    const habits = this.checkHabits(content, docType);
    results.push(...habits);

    const tone = this.checkTone(content);
    if (tone) {
      results.push(tone);
    }

    return results;
  }

  /**
   * 检查 PRD 文档风格
   */
  checkPRD(content: string): StyleCheckResult[] {
    return this.check(content, { documentType: 'PRD' });
  }

  /**
   * 检查商业计划书风格
   */
  checkBusinessPlan(content: string): StyleCheckResult[] {
    return this.check(content, { documentType: '商业计划书' });
  }

  /**
   * 检查论文风格
   */
  checkThesis(content: string): StyleCheckResult[] {
    return this.check(content, { documentType: '论文' });
  }

  /**
   * 检查汇报文档风格
   */
  checkReport(content: string): StyleCheckResult[] {
    return this.check(content, { documentType: '汇报' });
  }

  /**
   * 自动修复（仅处理简单修复场景）
   */
  autoFix(content: string, results: StyleCheckResult[]): string {
    if (!this.profile) {
      return content;
    }

    let fixed = content;
    for (const result of results) {
      if (!result.passed && result.autoFixable && result.suggestion) {
        // 简单修复：为缺少章节的 PRD 添加标准章节标题
        if (result.category === 'structure' && result.suggestion.includes('##')) {
          fixed = result.suggestion + '\n' + fixed;
        }
      }
    }
    return fixed;
  }

  /**
   * 生成修复 Prompt（用于调用 AI 补全）
   */
  buildFixPrompt(content: string, results: StyleCheckResult[]): string {
    if (!this.profile) {
      return '请修复以下内容的风格问题。';
    }

    const failed = results.filter((r) => !r.passed);
    if (failed.length === 0) {
      return '内容风格检查已通过，无需修复。';
    }

    const lines: string[] = [];
    lines.push(
      '你是 Remember Me 的 AI 风格修复助手。请根据以下用户画像偏好修复内容：'
    );
    lines.push('');
    lines.push('【用户画像】');
    lines.push(
      `- 文档结构：${this.profile.style.documentStructure}`
    );
    lines.push(`- 详细程度：${this.profile.style.detailLevel}`);
    lines.push(`- 语言：${this.profile.style.language}`);
    lines.push(`- 语气：${this.profile.style.tone}`);
    lines.push(
      `- 特殊习惯：${this.profile.style.specialHabits.join('、') || '无'}`
    );
    lines.push('');
    lines.push('【需要修复的问题】');
    failed.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.category}] ${r.message}`);
      if (r.suggestion) {
        lines.push(`   建议：${r.suggestion}`);
      }
    });
    lines.push('');
    lines.push('【原始内容】');
    lines.push(content);
    lines.push('');
    lines.push(
      '请修复以上所有风格问题，保持内容核心含义不变，严格符合用户画像偏好。'
    );

    return lines.join('\n');
  }

  // ==================== 私有检查方法 ====================

  /**
   * 检查文档结构是否符合用户偏好
   */
  private checkStructure(
    content: string,
    docType?: string
  ): StyleCheckResult | null {
    if (!this.profile) {
      return null;
    }

    const habits = this.profile.style.specialHabits;
    const structure = this.profile.style.documentStructure;

    // PRD 场景检查：是否包含必要章节
    if (
      docType === 'PRD' ||
      (!docType && habits.includes('验收标准'))
    ) {
      const hasBackground = /背景|背景介绍|项目背景/.test(content);
      const hasFeature = /功能需求|功能|需求/.test(content);
      const hasAcceptance = /验收标准|Given|When|Then|验收条件/.test(content);

      if (!hasBackground || !hasFeature || !hasAcceptance) {
        const missing: string[] = [];
        if (!hasBackground) {
          missing.push('背景');
        }
        if (!hasFeature) {
          missing.push('功能需求');
        }
        if (!hasAcceptance) {
          missing.push('验收标准');
        }

        return {
          passed: false,
          category: 'structure',
          message: `PRD 缺少必要章节：${missing.join('、')}`,
          severity: 'error',
          suggestion: '## 背景\n\n## 功能需求\n\n## 验收标准\n\n',
          autoFixable: true,
        };
      }
    }

    // 检查文档结构顺序是否符合偏好
    if (structure === '先背景后功能') {
      const bgIndex = content.search(/背景|背景介绍/);
      const featureIndex = content.search(/功能|需求/);
      if (
        bgIndex !== -1 &&
        featureIndex !== -1 &&
        featureIndex < bgIndex
      ) {
        return {
          passed: false,
          category: 'structure',
          message: '文档结构不符合"先背景后功能"的偏好',
          severity: 'warning',
          suggestion: '请调整章节顺序，先写背景再写功能',
          autoFixable: false,
        };
      }
    }

    return null;
  }

  /**
   * 检查内容语言是否与用户偏好一致
   */
  private checkLanguage(content: string): StyleCheckResult | null {
    if (!this.profile) {
      return null;
    }

    const lang = this.profile.style.language;
    const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = content.length;
    if (totalChars === 0) {
      return null;
    }

    const ratio = chineseChars / totalChars;

    if (lang === '中文' && ratio < 0.3) {
      return {
        passed: false,
        category: 'language',
        message: '内容语言不符合用户偏好的中文',
        severity: 'warning',
        suggestion: '请使用中文撰写内容',
        autoFixable: false,
      };
    }

    if (lang === '英文' && ratio > 0.3) {
      return {
        passed: false,
        category: 'language',
        message: '内容语言不符合用户偏好的英文',
        severity: 'warning',
        suggestion: '请使用英文撰写内容',
        autoFixable: false,
      };
    }

    if (lang === '双语') {
      return {
        passed: true,
        category: 'language',
        message: '双语内容检查通过',
        severity: 'info',
        autoFixable: false,
      };
    }

    return null;
  }

  /**
   * 检查内容详细程度是否符合用户偏好
   */
  private checkDetailLevel(content: string): StyleCheckResult | null {
    if (!this.profile) {
      return null;
    }

    const level = this.profile.style.detailLevel;
    const charCount = content.length;

    if (level === '简洁（1页）' && charCount >= 500) {
      return {
        passed: false,
        category: 'detail',
        message: `内容长度为 ${charCount} 字，超出"简洁"偏好（< 500 字）`,
        severity: 'warning',
        suggestion: '请精简内容至 500 字以内',
        autoFixable: false,
      };
    }

    if (level === '标准（3-5页）' && (charCount < 500 || charCount > 3000)) {
      return {
        passed: false,
        category: 'detail',
        message: `内容长度为 ${charCount} 字，不符合"标准"偏好（500-3000 字）`,
        severity: 'warning',
        suggestion: '请调整内容至 500-3000 字',
        autoFixable: false,
      };
    }

    if (level === '详尽（10页以上）' && charCount <= 3000) {
      return {
        passed: false,
        category: 'detail',
        message: `内容长度为 ${charCount} 字，未达到"详尽"偏好（> 3000 字）`,
        severity: 'warning',
        suggestion: '请扩充内容至 3000 字以上',
        autoFixable: false,
      };
    }

    return null;
  }

  /**
   * 检查特殊习惯是否体现在内容中
   */
  private checkHabits(
    content: string,
    _docType?: string
  ): StyleCheckResult[] {
    if (!this.profile) {
      return [];
    }

    const results: StyleCheckResult[] = [];
    const habits = this.profile.style.specialHabits;

    for (const habit of habits) {
      switch (habit) {
        case 'MoSCoW优先级': {
          if (
            !/(Must|Should|Could|Won't|必须有|应该有|可以有|不会有)/i.test(
              content
            )
          ) {
            results.push({
              passed: false,
              category: 'habit',
              message: '未包含 MoSCoW 优先级标记',
              severity: 'warning',
              suggestion:
                "请使用 Must/Should/Could/Won't 标记优先级",
              autoFixable: false,
            });
          }
          break;
        }
        case '用户故事': {
          if (
            !/作为.*?我(想|想要|需要|希望).*?以便|作为.*?我(想|想要|需要|希望)/.test(
              content
            )
          ) {
            results.push({
              passed: false,
              category: 'habit',
              message: '未包含用户故事格式',
              severity: 'warning',
              suggestion: '请使用"作为...我想要...以便..."格式',
              autoFixable: false,
            });
          }
          break;
        }
        case '竞品对比': {
          if (!/竞品|对比|vs|versus|表格|优势|劣势/.test(content)) {
            results.push({
              passed: false,
              category: 'habit',
              message: '未包含竞品对比内容',
              severity: 'warning',
              suggestion: '请添加竞品对比表格或分析',
              autoFixable: false,
            });
          }
          break;
        }
        case '验收标准': {
          if (
            !/Given|When|Then|验收条件|Given-When-Then/.test(
              content
            )
          ) {
            results.push({
              passed: false,
              category: 'habit',
              message: '未包含验收标准（Given-When-Then）',
              severity: 'warning',
              suggestion: '请使用 Given-When-Then 格式定义验收标准',
              autoFixable: false,
            });
          }
          break;
        }
        case '财务预测': {
          if (
            !/\d+.*(万|亿|元|美元|收入|成本|利润|ROI|NPV|IRR)|财务|预测|营收/.test(
              content
            )
          ) {
            results.push({
              passed: false,
              category: 'habit',
              message: '未包含财务预测数据',
              severity: 'warning',
              suggestion: '请添加财务预测表格或数据',
              autoFixable: false,
            });
          }
          break;
        }
      }
    }

    return results;
  }

  /**
   * 检查语气是否符合用户偏好
   */
  private checkTone(content: string): StyleCheckResult | null {
    if (!this.profile) {
      return null;
    }

    const tone = this.profile.style.tone;
    const casualPattern = /嗯|吧|呢|哦|哈|嘿嘿|哈哈|~|啦|呀|吗|嘛|咋/;
    const casualCount = (content.match(casualPattern) || []).length;

    if (tone === '正式' && casualCount > 0) {
      return {
        passed: false,
        category: 'tone',
        message: `内容包含 ${casualCount} 处口语化表达，不符合正式语气偏好`,
        severity: 'warning',
        suggestion: '请删除"嗯、吧、呢、哦"等口语化词汇，使用更正式的表达',
        autoFixable: false,
      };
    }

    if (tone === '学术' && casualCount > 0) {
      return {
        passed: false,
        category: 'tone',
        message: `内容包含 ${casualCount} 处口语化表达，不符合学术语气偏好`,
        severity: 'warning',
        suggestion: '请使用学术化表达，避免口语化词汇',
        autoFixable: false,
      };
    }

    return null;
  }
}
