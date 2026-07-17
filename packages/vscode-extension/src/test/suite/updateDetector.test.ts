/**
 * Remember Me - UpdateDetector 单元测试
 * 验证记忆更新检测模块的检测规则、置信度、应用更新和批量检测（A2 任务）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UpdateDetector, DetectedUpdate } from '../../memory/updateDetector';
import { ProjectManager } from '../../memory/project';
import { JsonStorage } from '../../memory/storage';
import type { ChatMessage, Conversation } from '../../types';

describe('UpdateDetector', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let projectManager: ProjectManager;
  let detector: UpdateDetector;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'remember-me-update-test-')
    );
    storage = new JsonStorage({ basePath: tempDir });
    projectManager = new ProjectManager(storage);
    // 创建测试项目
    projectManager.create('TestProject', '开发者', '项目协作');
    // 注入自定义依赖，避免单例污染
    detector = new UpdateDetector(projectManager);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ==================== 检测规则测试 ====================

  describe('检测规则', () => {
    it('detect 应识别决策类型：我们决定用...', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '我们决定用 React 作为前端框架',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'decision');
      assert.ok(results[0].rawText.includes('决定用'));
      assert.ok(results[0].suggestedTitle!.includes('React'));
      assert.ok(results[0].confidence > 0.5);
    });

    it('detect 应识别术语类型：XX 定义为...', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: '用户是指企业管理员，即拥有审批权限的系统用户。',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'terminology');
      assert.ok(results[0].suggestedTitle!.includes('用户'));
      assert.ok(results[0].suggestedDescription!.includes('企业管理员'));
      assert.ok(results[0].confidence > 0.5);
    });

    it('detect 应识别竞品类型：竞品有...', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '竞品有 Slack、Microsoft Teams 和飞书。',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'competitor');
      assert.ok(results[0].suggestedTitle!.includes('Slack'));
      assert.ok(results[0].confidence > 0.5);
    });

    it('detect 应识别功能类型：增加...功能', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '我们需要增加批量导出功能，支持 Excel 格式。',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'feature');
      assert.ok(results[0].suggestedTitle!.includes('批量导出'));
      assert.ok(results[0].confidence > 0.5);
    });

    it('detect 对无匹配文本应返回空数组', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '今天天气不错，适合出门散步。',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.deepStrictEqual(results, []);
    });

    it('detect 对空消息应返回空数组', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.deepStrictEqual(results, []);
    });

    it('detect 对仅空白字符的消息应返回空数组', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '   \n\t  ',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      assert.deepStrictEqual(results, []);
    });
  });

  // ==================== 置信度与 Top 检测 ====================

  describe('置信度与 detectTop', () => {
    it('detectTop 应返回置信度最高的结果', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '我们决定用 React 作为前端框架。同时竞品有 Slack。',
        timestamp: new Date().toISOString(),
      };
      const top = detector.detectTop(msg);
      assert.ok(top !== null);
      // 两个结果中，decision 的置信度通常更高（因为包含框架关键词）
      assert.ok(top!.confidence >= 0.5);
      // 确保返回的是所有结果中 confidence 最高的
      const all = detector.detect(msg);
      const maxConfidence = all.reduce((m, r) => Math.max(m, r.confidence), 0);
      assert.strictEqual(top!.confidence, maxConfidence);
    });

    it('detectTop 对无匹配应返回 null', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '随便聊点别的。',
        timestamp: new Date().toISOString(),
      };
      const top = detector.detectTop(msg);
      assert.strictEqual(top, null);
    });

    it('置信度应在合理范围内（0-1）', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '我们决定采用微服务架构，使用 Kubernetes 作为容器编排平台。',
        timestamp: new Date().toISOString(),
      };
      const results = detector.detect(msg);
      for (const r of results) {
        assert.ok(r.confidence >= 0 && r.confidence <= 1, `置信度 ${r.confidence} 超出 0-1 范围`);
      }
    });
  });

  // ==================== applyUpdate 测试 ====================

  describe('applyUpdate', () => {
    it('applyUpdate 对 decision 类型应调用 addDecision', async () => {
      const update: DetectedUpdate = {
        type: 'decision',
        rawText: '我们决定用 React',
        suggestedTitle: '前端框架选择',
        suggestedDescription: '采用 React 作为前端框架',
        confidence: 0.85,
      };
      const success = await detector.applyUpdate('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.strictEqual(project!.decisions.length, 1);
      assert.strictEqual(project!.decisions[0].title, '前端框架选择');
      assert.strictEqual(project!.decisions[0].status, '已确定');
    });

    it('applyUpdate 对 terminology 类型应调用 setTerminology', async () => {
      const update: DetectedUpdate = {
        type: 'terminology',
        rawText: '用户是指企业管理员',
        suggestedTitle: '用户',
        suggestedDescription: '企业管理员',
        confidence: 0.8,
      };
      const success = await detector.applyUpdate('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.strictEqual(project!.terminology.length, 1);
      assert.strictEqual(project!.terminology[0].term, '用户');
      assert.strictEqual(project!.terminology[0].definition, '企业管理员');
    });

    it('applyUpdate 对 competitor 类型应调用 addCompetitor', async () => {
      const update: DetectedUpdate = {
        type: 'competitor',
        rawText: '竞品有 Slack',
        suggestedTitle: 'Slack',
        suggestedDescription: '竞品信息',
        confidence: 0.75,
      };
      const success = await detector.applyUpdate('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.ok(project!.competitors.includes('Slack'));
    });

    it('applyUpdate 对 feature 类型应追加到 coreFeatures', async () => {
      const update: DetectedUpdate = {
        type: 'feature',
        rawText: '增加批量导出功能',
        suggestedTitle: '批量导出功能',
        suggestedDescription: '支持 Excel 格式导出',
        confidence: 0.8,
      };
      const success = await detector.applyUpdate('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.ok(project!.coreFeatures.includes('批量导出功能'));
      // 原始内容也应保留
      assert.ok(project!.coreFeatures.includes('项目协作'));
    });

    it('applyUpdate 对不存在的项目应返回 false', async () => {
      const update: DetectedUpdate = {
        type: 'decision',
        rawText: '我们决定用 Vue',
        suggestedTitle: '技术选型',
        suggestedDescription: 'Vue',
        confidence: 0.8,
      };
      const success = await detector.applyUpdate('NonExistent', update);
      assert.strictEqual(success, false);
    });
  });

  // ==================== markAsPending 测试 ====================

  describe('markAsPending', () => {
    it('markAsPending 应将决策写入 decisions 数组，status 为待确认', async () => {
      const update: DetectedUpdate = {
        type: 'decision',
        rawText: '我们决定用 Rust',
        suggestedTitle: '后端语言选择',
        suggestedDescription: '采用 Rust',
        confidence: 0.8,
      };
      const success = await detector.markAsPending('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.strictEqual(project!.decisions.length, 1);
      assert.strictEqual(project!.decisions[0].status, '待确认');
      assert.ok(project!.decisions[0].title.includes('后端语言选择'));
    });

    it('markAsPending 对术语类型应生成合适的标题和描述', async () => {
      const update: DetectedUpdate = {
        type: 'terminology',
        rawText: '用户是指企业管理员',
        suggestedTitle: '用户',
        suggestedDescription: '企业管理员',
        confidence: 0.8,
      };
      const success = await detector.markAsPending('TestProject', update);
      assert.strictEqual(success, true);
      const project = projectManager.read('TestProject');
      assert.strictEqual(project!.decisions[0].status, '待确认');
      assert.ok(project!.decisions[0].title.includes('术语'));
      assert.ok(project!.decisions[0].description.includes('定义'));
    });

    it('markAsPending 对不存在的项目应返回 false', async () => {
      const update: DetectedUpdate = {
        type: 'feature',
        rawText: '增加搜索功能',
        suggestedTitle: '搜索功能',
        confidence: 0.7,
      };
      const success = await detector.markAsPending('NonExistent', update);
      assert.strictEqual(success, false);
    });
  });

  // ==================== detectInConversation 测试 ====================

  describe('detectInConversation', () => {
    it('detectInConversation 应批量检测对话中所有消息', () => {
      const conversation: Conversation = {
        id: 'conv_test',
        title: '需求讨论',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            role: 'user',
            content: '我们决定用 React 作为前端框架。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: '用户是指企业管理员。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'user',
            content: '竞品有 Slack 和飞书。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: '好的，没问题。',
            timestamp: new Date().toISOString(),
          },
        ],
        keyDecisions: [],
        insights: [],
        tags: [],
      };
      const results = detector.detectInConversation(conversation);
      // 应检测到 3 条：decision, terminology, competitor
      assert.strictEqual(results.length, 3);
      const types = results.map((r) => r.type);
      assert.ok(types.includes('decision'));
      assert.ok(types.includes('terminology'));
      assert.ok(types.includes('competitor'));
      // 结果按置信度降序排列
      for (let i = 1; i < results.length; i++) {
        assert.ok(
          results[i - 1].confidence >= results[i].confidence,
          '结果未按置信度降序排列'
        );
      }
    });

    it('detectInConversation 对空消息列表应返回空数组', () => {
      const conversation: Conversation = {
        id: 'conv_empty',
        title: '空对话',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        keyDecisions: [],
        insights: [],
        tags: [],
      };
      const results = detector.detectInConversation(conversation);
      assert.deepStrictEqual(results, []);
    });

    it('detectInConversation 应去重相同 rawText 的检测结果', () => {
      const conversation: Conversation = {
        id: 'conv_dup',
        title: '重复测试',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            role: 'user',
            content: '我们决定用 React。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: '我们决定用 React。',
            timestamp: new Date().toISOString(),
          },
        ],
        keyDecisions: [],
        insights: [],
        tags: [],
      };
      const results = detector.detectInConversation(conversation);
      // 两条消息内容相同，应只保留一个检测结果
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'decision');
    });
  });
});
