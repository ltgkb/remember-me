/**
 * Remember Me - PromptBuilder 单元测试
 * 验证记忆注入 Prompt 的构建格式和内容完整性（PRD §2.2.1 自动基础记忆 / §10.1 Prompt 模板）
 */

import * as assert from 'assert';
import { PromptBuilder } from '../../utils/promptBuilder';
import type { Profile, ProjectContext } from '../../types';

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  const sampleProfile: Profile = {
    id: 'profile-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    identity: {
      role: '产品经理',
      experience: '3-5年',
      industry: 'SaaS',
      background: '技术',
    },
    style: {
      documentStructure: '先背景后功能',
      detailLevel: '标准（3-5页）',
      language: '中文',
      tone: '正式',
      specialHabits: ['MoSCoW优先级', '用户旅程图'],
      responseStyle: '先框架再细节',
    },
  };

  const sampleProject: ProjectContext = {
    id: 'proj-1',
    name: 'TeamFlow',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    targetUsers: '企业管理员',
    coreFeatures: '项目管理、团队协作',
    decisions: [
      {
        id: 'd1',
        title: '认证方式',
        description: 'OAuth 2.0 + SSO',
        createdAt: '2026-01-01T00:00:00Z',
        status: '已确定',
      },
    ],
    terminology: [{ term: '用户', definition: '企业管理员' }],
    competitors: ['Slack', '飞书'],
  };

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  describe('build', () => {
    it('应构建包含身份和风格的完整 Prompt', () => {
      const prompt = builder.build(sampleProfile);
      assert.ok(prompt.includes('你是用户的 AI 协作助手'));
      assert.ok(prompt.includes('【身份】'));
      assert.ok(prompt.includes('角色：产品经理'));
      assert.ok(prompt.includes('经验：3-5年'));
      assert.ok(prompt.includes('【做事风格】'));
      assert.ok(prompt.includes('文档结构：先背景后功能'));
      assert.ok(prompt.includes('特殊习惯：MoSCoW优先级、用户旅程图'));
    });

    it('无特殊习惯时应显示"无"', () => {
      const profileNoHabits: Profile = {
        ...sampleProfile,
        style: { ...sampleProfile.style, specialHabits: [] },
      };
      const prompt = builder.build(profileNoHabits);
      assert.ok(prompt.includes('特殊习惯：无'));
    });

    it('有项目时应包含项目上下文', () => {
      const prompt = builder.build(sampleProfile, sampleProject);
      assert.ok(prompt.includes('【当前项目】TeamFlow'));
      assert.ok(prompt.includes('目标用户：企业管理员'));
      assert.ok(prompt.includes('核心功能：项目管理、团队协作'));
    });

    it('有竞品时应显示竞品列表', () => {
      const prompt = builder.build(sampleProfile, sampleProject);
      assert.ok(prompt.includes('主要竞品：Slack、飞书'));
    });

    it('有决策时应显示决策列表', () => {
      const prompt = builder.build(sampleProfile, sampleProject);
      assert.ok(prompt.includes('已确定决策：'));
      assert.ok(prompt.includes('认证方式：OAuth 2.0 + SSO'));
    });

    it('有术语时应显示术语定义', () => {
      const prompt = builder.build(sampleProfile, sampleProject);
      assert.ok(prompt.includes('术语定义：'));
      assert.ok(prompt.includes('用户 = 企业管理员'));
    });

    it('结尾应包含协作指令', () => {
      const prompt = builder.build(sampleProfile);
      assert.ok(prompt.includes('请基于以上信息协助用户'));
    });
  });

  describe('buildMemoryPromptObject', () => {
    it('应返回结构化的 MemoryPrompt 对象', () => {
      const obj = builder.buildMemoryPromptObject(
        sampleProfile,
        sampleProject
      );
      assert.strictEqual(obj.identity, '产品经理 | 3-5年 | SaaS');
      assert.ok(obj.style.includes('标准（3-5页）'));
      assert.strictEqual(obj.project, 'TeamFlow（企业管理员）');
    });

    it('无项目时应显示"未选择项目"', () => {
      const obj = builder.buildMemoryPromptObject(sampleProfile);
      assert.strictEqual(obj.project, '未选择项目');
    });
  });

  describe('buildStatusSummary', () => {
    it('应构建状态栏摘要', () => {
      const summary = builder.buildStatusSummary(
        sampleProfile,
        sampleProject
      );
      assert.ok(summary.includes('产品经理'));
      assert.ok(summary.includes('TeamFlow'));
      assert.ok(summary.includes('MoSCoW优先级'));
    });

    it('无项目时应只包含角色', () => {
      const summary = builder.buildStatusSummary(sampleProfile);
      assert.ok(summary.includes('产品经理'));
      assert.ok(!summary.includes('项目：'));
    });
  });
});
