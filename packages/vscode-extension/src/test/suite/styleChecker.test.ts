/**
 * Remember Me - StyleChecker 单元测试
 * 验证风格一致性检查、自动修复和 Prompt 构建（PRD §2.3.3 风格一致性检查）
 */

import * as assert from 'assert';
import { StyleChecker } from '../../utils/styleChecker';
import type { Profile } from '../../types';

describe('StyleChecker', () => {
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
      specialHabits: ['MoSCoW优先级', '用户故事', '验收标准'],
      responseStyle: '先框架再细节',
    },
  };

  describe('无画像检查', () => {
    it('无画像时应返回 info 级别提示', () => {
      const checker = new StyleChecker();
      const results = checker.check('任意内容');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].passed, true);
      assert.strictEqual(results[0].severity, 'info');
      assert.ok(results[0].message.includes('未加载'));
    });
  });

  describe('结构检查', () => {
    it('PRD 包含必要章节时应通过', () => {
      const checker = new StyleChecker(sampleProfile);
      const content =
        '## 背景\n本项目旨在...\n\n## 功能需求\n1. 登录\n\n## 验收标准\nGiven 用户打开页面\n';
      const results = checker.checkPRD(content);
      const structureResult = results.find((r) => r.category === 'structure');
      assert.ok(!structureResult || structureResult.passed);
    });

    it('PRD 缺少必要章节时应报错', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '只有一些随机内容，没有背景也没有功能需求。';
      const results = checker.checkPRD(content);
      const structureResult = results.find((r) => r.category === 'structure');
      assert.ok(structureResult);
      assert.strictEqual(structureResult!.passed, false);
      assert.strictEqual(structureResult!.severity, 'error');
      assert.ok(structureResult!.message.includes('缺少'));
    });

    it('文档顺序不符合偏好时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '## 功能\n...\n\n## 背景\n...';
      // 使用非 PRD 文档类型，避免触发 PRD 结构检查
      const results = checker.check(content, { documentType: '汇报' });
      const structureResult = results.find((r) => r.category === 'structure');
      assert.ok(structureResult);
      assert.strictEqual(structureResult!.passed, false);
      assert.ok(structureResult!.message.includes('先背景后功能'));
    });
  });

  describe('语言检查', () => {
    it('中文偏好但内容英文过多时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = 'This is a purely English content without enough Chinese characters in it.';
      const results = checker.check(content);
      const langResult = results.find((r) => r.category === 'language');
      assert.ok(langResult);
      assert.strictEqual(langResult!.passed, false);
      assert.ok(langResult!.message.includes('中文'));
    });

    it('中文内容符合偏好时应通过', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '这是一份完全使用中文撰写的内容，符合用户的语言偏好。';
      const results = checker.check(content);
      const langResult = results.find((r) => r.category === 'language');
      // 中文比例足够高，不应报错
      assert.ok(!langResult || langResult.passed);
    });
  });

  describe('详细程度检查', () => {
    it('标准偏好下内容过短时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '太短了。';
      const results = checker.check(content);
      const detailResult = results.find((r) => r.category === 'detail');
      assert.ok(detailResult);
      assert.strictEqual(detailResult!.passed, false);
      assert.ok(detailResult!.message.includes('标准'));
    });

    it('标准偏好下内容过长时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '内容'.repeat(2000); // 4000 字
      const results = checker.check(content);
      const detailResult = results.find((r) => r.category === 'detail');
      assert.ok(detailResult);
      assert.strictEqual(detailResult!.passed, false);
      assert.ok(detailResult!.message.includes('3000'));
    });
  });

  describe('特殊习惯检查', () => {
    it('缺少 MoSCoW 优先级时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '这是一个普通内容，没有任何优先级标记。';
      const results = checker.check(content);
      const habitResult = results.find((r) => r.message.includes('MoSCoW'));
      assert.ok(habitResult);
      assert.strictEqual(habitResult!.passed, false);
    });

    it('包含 MoSCoW 时应通过', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = 'Must have login, Should have SSO.';
      const results = checker.check(content);
      const habitResult = results.find((r) => r.message.includes('MoSCoW'));
      assert.ok(!habitResult);
    });

    it('缺少用户故事时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '普通内容，没有用户故事格式。';
      const results = checker.check(content);
      const habitResult = results.find((r) => r.message.includes('用户故事'));
      assert.ok(habitResult);
      assert.strictEqual(habitResult!.passed, false);
    });

    it('包含用户故事时应通过', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '作为用户，我想要登录功能，以便访问系统。';
      const results = checker.check(content);
      const habitResult = results.find((r) => r.message.includes('用户故事'));
      assert.ok(!habitResult);
    });

    it('缺少验收标准时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '普通内容，没有验收标准。';
      const results = checker.check(content);
      const habitResult = results.find((r) => r.message.includes('验收标准'));
      // 注意：PRD 结构检查也会检查验收标准，这里可能有多个结果
      assert.ok(habitResult);
    });
  });

  describe('语气检查', () => {
    it('正式语气包含口语化词汇时应警告', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '这个功能还不错吧，用户应该会用吧？哈哈。';
      const results = checker.check(content);
      const toneResult = results.find((r) => r.category === 'tone');
      assert.ok(toneResult);
      assert.strictEqual(toneResult!.passed, false);
      assert.ok(toneResult!.message.includes('口语化'));
    });

    it('正式语气无口语化词汇时应通过', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '本功能旨在提升用户体验，经过充分论证后实施。';
      const results = checker.check(content);
      const toneResult = results.find((r) => r.category === 'tone');
      assert.ok(!toneResult || toneResult.passed);
    });
  });

  describe('自动修复', () => {
    it('autoFix 应为缺少章节的 PRD 添加标题', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '缺少章节的内容。';
      const results = checker.checkPRD(content);
      const fixed = checker.autoFix(content, results);
      assert.ok(fixed.includes('## 背景'));
      assert.ok(fixed.includes('## 功能需求'));
      assert.ok(fixed.includes('## 验收标准'));
    });

    it('autoFix 对不可修复问题应返回原内容', () => {
      const checker = new StyleChecker(sampleProfile);
      const content = '这是一个正常内容。';
      // 构造一个不可修复的结果
      const manualResult = {
        passed: false,
        category: 'tone' as const,
        message: '语气不对',
        severity: 'warning' as const,
        autoFixable: false,
      };
      const fixed = checker.autoFix(content, [manualResult]);
      assert.strictEqual(fixed, content);
    });
  });

  describe('修复 Prompt', () => {
    it('buildFixPrompt 无失败时应返回无需修复提示', () => {
      const checker = new StyleChecker(sampleProfile);
      const prompt = checker.buildFixPrompt('内容', [
        { passed: true, category: 'language', message: '通过', severity: 'info', autoFixable: false },
      ]);
      assert.ok(prompt.includes('无需修复'));
    });

    it('buildFixPrompt 应包含用户画像和失败项', () => {
      const checker = new StyleChecker(sampleProfile);
      const results = checker.checkPRD('缺少内容');
      const prompt = checker.buildFixPrompt('缺少内容', results);
      assert.ok(prompt.includes('【用户画像】'));
      assert.ok(prompt.includes('【需要修复的问题】'));
      assert.ok(prompt.includes('【原始内容】'));
      assert.ok(prompt.includes('Remember Me'));
    });

    it('buildFixPrompt 无画像时应返回通用提示', () => {
      const checker = new StyleChecker();
      const prompt = checker.buildFixPrompt('内容', []);
      assert.ok(prompt.includes('请修复'));
    });
  });

  describe('便捷方法', () => {
    it('checkBusinessPlan 应使用商业计划书文档类型', () => {
      const checker = new StyleChecker(sampleProfile);
      const results = checker.checkBusinessPlan('内容');
      // 至少返回结构检查结果（PRD 检查不触发，因为不是 PRD）
      assert.ok(Array.isArray(results));
    });

    it('checkThesis 应使用论文文档类型', () => {
      const checker = new StyleChecker(sampleProfile);
      const results = checker.checkThesis('内容');
      assert.ok(Array.isArray(results));
    });

    it('checkReport 应使用汇报文档类型', () => {
      const checker = new StyleChecker(sampleProfile);
      const results = checker.checkReport('内容');
      assert.ok(Array.isArray(results));
    });
  });
});
