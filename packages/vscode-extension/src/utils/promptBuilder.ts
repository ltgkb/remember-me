/**
 * Remember Me - 记忆注入 Prompt 构建器
 * 严格按照 PRD 附录 10.1 的模板格式构建记忆注入 Prompt
 */

import type { Profile, ProjectContext, MemoryPrompt } from '../types';
import { isValidProfile } from './profileGuard';

export class PromptBuilder {
  /**
   * 构建完整的记忆注入 Markdown Prompt
   * @param profile - 用户画像
   * @param project - 当前项目上下文（可选）
   * @returns 格式化后的 Prompt 字符串
   */
  build(profile: Profile, project?: ProjectContext): string {
    if (!isValidProfile(profile)) {
      throw new Error('画像数据不完整，无法构建记忆 Prompt');
    }
    const sections: string[] = [];

    // ── 头部声明 ──
    sections.push(
      '你是用户的 AI 协作助手。以下是关于这位用户的背景信息，请在回复中严格遵循这些偏好：\n'
    );

    // ── 身份板块 ──
    sections.push('【身份】');
    sections.push(`- 角色：${profile.identity.role}`);
    sections.push(`- 经验：${profile.identity.experience}`);
    sections.push(`- 领域：${profile.identity.industry}`);
    sections.push(`- 专业背景：${profile.identity.background}`);
    sections.push('');

    // ── 做事风格板块 ──
    sections.push('【做事风格】');
    sections.push(`- 文档结构：${profile.style.documentStructure}`);
    sections.push(`- 详细程度：${profile.style.detailLevel}`);
    sections.push(`- 语言：${profile.style.language}`);
    sections.push(`- 语气：${profile.style.tone}`);
    sections.push(
      `- 特殊习惯：${profile.style.specialHabits.join('、') || '无'}`
    );
    sections.push(`- 回复风格：${profile.style.responseStyle}`);
    sections.push('');

    // ── 当前项目板块 ──
    if (project) {
      sections.push(`【当前项目】${project.name}`);
      sections.push(`- 目标用户：${project.targetUsers}`);
      sections.push(`- 核心功能：${project.coreFeatures}`);

      if (project.competitors.length > 0) {
        sections.push(`- 主要竞品：${project.competitors.join('、')}`);
      }

      if (project.decisions.length > 0) {
        sections.push('- 已确定决策：');
        project.decisions.forEach((d) => {
          sections.push(`  • ${d.title}：${d.description}`);
        });
      }

      if (project.terminology.length > 0) {
        sections.push('- 术语定义：');
        project.terminology.forEach((t) => {
          sections.push(`  • ${t.term} = ${t.definition}`);
        });
      }

      sections.push('');
    }

    // ── 结尾指令 ──
    sections.push(
      '请基于以上信息协助用户，确保回复符合用户的风格和项目上下文。'
    );

    return sections.join('\n');
  }

  /**
   * 构建结构化的 MemoryPrompt 对象
   * 用于状态栏提示、侧边栏摘要等场景
   */
  buildMemoryPromptObject(
    profile: Profile,
    project?: ProjectContext
  ): MemoryPrompt {
    if (!isValidProfile(profile)) {
      throw new Error('画像数据不完整，无法构建记忆 Prompt');
    }
    const specialHabits = profile.style.specialHabits.join('、') || '无';

    return {
      identity: `${profile.identity.role} | ${profile.identity.experience} | ${profile.identity.industry}`,
      style: `${profile.style.detailLevel} | ${profile.style.documentStructure} | ${profile.style.language} | 特殊习惯：${specialHabits}`,
      project: project
        ? `${project.name}（${project.targetUsers}）`
        : '未选择项目',
      history: '' // 预留：后续由 conversation 模块填充
    };
  }

  /**
   * 构建一行状态栏摘要文本
   */
  buildStatusSummary(profile: Profile, project?: ProjectContext): string {
    if (!isValidProfile(profile)) {
      return '未设置画像';
    }
    const parts: string[] = [profile.identity.role];
    if (project) {
      parts.push(`项目：${project.name}`);
    }
    if (profile.style.specialHabits.length > 0) {
      parts.push(profile.style.specialHabits[0]);
    }
    return parts.join(' | ');
  }
}
