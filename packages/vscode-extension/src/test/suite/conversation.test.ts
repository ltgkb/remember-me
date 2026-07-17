/**
 * Remember Me - ConversationManager 单元测试
 * 验证对话历史管理模块的 CRUD、消息、决策、洞察、标签和搜索功能（PRD §2.1.4 对话历史）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationManager } from '../../memory/conversation';
import { JsonStorage } from '../../memory/storage';
import type { ChatMessage } from '../../types';

describe('ConversationManager', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let manager: ConversationManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'remember-me-conv-test-')
    );
    storage = new JsonStorage({ basePath: tempDir });
    manager = new ConversationManager(storage);
    storage.write({}, 'projects', 'teamflow', 'context.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('对话 CRUD', () => {
    it('create 应创建新对话', () => {
      const conv = manager.create('teamflow', '登录功能讨论');
      assert.ok(conv);
      assert.strictEqual(conv!.title, '登录功能讨论');
      assert.deepStrictEqual(conv!.messages, []);
    });

    it('create 应支持初始消息和标签', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'hello',
          timestamp: new Date().toISOString(),
        },
      ];
      const conv = manager.create('teamflow', '讨论', {
        tags: ['重要'],
        initialMessages: messages,
      });
      assert.strictEqual(conv!.tags[0], '重要');
      assert.strictEqual(conv!.messages.length, 1);
    });

    it('read 应通过 ID 读取对话', () => {
      const created = manager.create('teamflow', '测试对话');
      const read = manager.read('teamflow', created!.id);
      assert.deepStrictEqual(read, created);
    });

    it('readByFilename 应通过文件名读取', () => {
      const created = manager.create('teamflow', '文件名测试');
      const filename = manager.list('teamflow')[0].filename;
      const read = manager.readByFilename('teamflow', filename);
      assert.strictEqual(read!.id, created!.id);
    });

    it('update 应更新对话内容', () => {
      const created = manager.create('teamflow', '原标题');
      const updated = manager.update('teamflow', created!.id, {
        title: '新标题',
      });
      assert.strictEqual(updated!.title, '新标题');
    });

    it('delete 应删除对话', () => {
      const created = manager.create('teamflow', '待删除');
      manager.delete('teamflow', created!.id);
      assert.strictEqual(manager.read('teamflow', created!.id), null);
    });

    it('list 应按更新时间倒序排列', () => {
      manager.create('teamflow', '对话A');
      manager.create('teamflow', '对话B');
      const list = manager.list('teamflow');
      assert.ok(
        list[0].conversation.updatedAt >= list[1].conversation.updatedAt
      );
    });
  });

  describe('消息操作', () => {
    let convId: string;

    beforeEach(() => {
      convId = manager.create('teamflow', '消息测试')!.id;
    });

    it('addMessage 应添加消息', () => {
      const updated = manager.addMessage('teamflow', convId, 'user', '你好');
      assert.strictEqual(updated!.messages.length, 1);
      assert.strictEqual(updated!.messages[0].content, '你好');
    });

    it('getUserMessages 应只返回用户消息', () => {
      manager.addMessage('teamflow', convId, 'user', '用户问题');
      manager.addMessage('teamflow', convId, 'assistant', '助手回答');
      const userMsgs = manager.getUserMessages('teamflow', convId);
      assert.strictEqual(userMsgs.length, 1);
      assert.strictEqual(userMsgs[0].role, 'user');
    });

    it('getAssistantMessages 应只返回助手消息', () => {
      manager.addMessage('teamflow', convId, 'user', '用户问题');
      manager.addMessage('teamflow', convId, 'assistant', '助手回答');
      const assistantMsgs = manager.getAssistantMessages('teamflow', convId);
      assert.strictEqual(assistantMsgs.length, 1);
      assert.strictEqual(assistantMsgs[0].role, 'assistant');
    });
  });

  describe('关键决策管理', () => {
    let convId: string;

    beforeEach(() => {
      convId = manager.create('teamflow', '决策测试')!.id;
    });

    it('addKeyDecision 应添加决策', () => {
      const updated = manager.addKeyDecision(
        'teamflow',
        convId,
        '使用 JWT',
        '认证方式确定'
      );
      assert.strictEqual(updated!.keyDecisions.length, 1);
    });

    it('updateKeyDecisionStatus 应更新状态', () => {
      manager.addKeyDecision('teamflow', convId, '方案A', '描述', '待确认');
      const decisionId = manager.read('teamflow', convId)!.keyDecisions[0].id;
      const updated = manager.updateKeyDecisionStatus(
        'teamflow',
        convId,
        decisionId,
        '已确定'
      );
      assert.strictEqual(updated!.keyDecisions[0].status, '已确定');
    });
  });

  describe('洞察管理', () => {
    let convId: string;

    beforeEach(() => {
      convId = manager.create('teamflow', '洞察测试')!.id;
    });

    it('addInsight 应添加洞察', () => {
      const updated = manager.addInsight(
        'teamflow',
        convId,
        '用户更关注安全',
        '发现'
      );
      assert.strictEqual(updated!.insights.length, 1);
      assert.strictEqual(updated!.insights[0].category, '发现');
    });

    it('removeInsight 应删除洞察', () => {
      manager.addInsight('teamflow', convId, '临时洞察', '发现');
      const insightId = manager.read('teamflow', convId)!.insights[0].id;
      const updated = manager.removeInsight('teamflow', convId, insightId);
      assert.strictEqual(updated!.insights.length, 0);
    });
  });

  describe('标签管理', () => {
    let convId: string;

    beforeEach(() => {
      convId = manager.create('teamflow', '标签测试')!.id;
    });

    it('addTag 应添加标签', () => {
      const updated = manager.addTag('teamflow', convId, '已决策');
      assert.ok(updated!.tags.includes('已决策'));
    });

    it('addTag 不应重复添加', () => {
      manager.addTag('teamflow', convId, '重要');
      const beforeCount = manager.read('teamflow', convId)!.tags.length;
      manager.addTag('teamflow', convId, '重要');
      assert.strictEqual(
        manager.read('teamflow', convId)!.tags.length,
        beforeCount
      );
    });

    it('removeTag 应移除标签', () => {
      manager.addTag('teamflow', convId, '待确认');
      const updated = manager.removeTag('teamflow', convId, '待确认');
      assert.ok(!updated!.tags.includes('待确认'));
    });

    it('filterByTag 应按标签筛选对话', () => {
      const conv1 = manager.create('teamflow', '对话1');
      manager.create('teamflow', '对话2');
      manager.addTag('teamflow', conv1!.id, '重要');
      const filtered = manager.filterByTag('teamflow', '重要');
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].conversation.id, conv1!.id);
    });
  });

  describe('搜索功能', () => {
    let convId: string;

    beforeEach(() => {
      convId = manager.create('teamflow', '权限管理设计')!.id;
      manager.addMessage(
        'teamflow',
        convId,
        'user',
        '我们需要支持 RBAC 权限模型'
      );
      manager.addKeyDecision(
        'teamflow',
        convId,
        '采用 RBAC',
        '最终选择基于角色的访问控制',
        '已确定'
      );
      manager.addInsight('teamflow', convId, '权限粒度是关键', '发现');
      manager.addTag('teamflow', convId, '已决策');
    });

    it('search 应按标题匹配', () => {
      const results = manager.search('teamflow', { keyword: '权限管理' });
      assert.ok(results.length > 0);
      assert.ok(results[0].matchedIn.includes('title'));
    });

    it('search 应按消息内容匹配', () => {
      const results = manager.search('teamflow', { keyword: 'RBAC' });
      assert.ok(results.some((r) => r.matchedIn.includes('message')));
    });

    it('search 应按决策匹配', () => {
      const results = manager.search('teamflow', {
        keyword: '访问控制',
      });
      assert.ok(results.some((r) => r.matchedIn.includes('decision')));
    });

    it('search 应按洞察匹配', () => {
      const results = manager.search('teamflow', { keyword: '粒度' });
      assert.ok(results.some((r) => r.matchedIn.includes('insight')));
    });

    it('search 应按标签筛选', () => {
      const results = manager.search('teamflow', { tags: ['已决策'] });
      assert.ok(results.length > 0);
      assert.ok(results[0].matchedIn.includes('tag'));
    });

    it('search 应按日期范围筛选', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const results = manager.search('teamflow', {
        startDate: yesterday,
        endDate: tomorrow,
      });
      assert.ok(results.length > 0);
    });

    it('searchAll 应跨项目搜索', () => {
      storage.write({}, 'projects', 'other', 'context.json');
      manager.create('other', '另一个项目对话');
      const results = manager.searchAll({ keyword: '权限' });
      assert.ok(results.length > 0);
    });
  });

  describe('最近对话', () => {
    it('getRecent 应返回最近 N 条对话', () => {
      manager.create('teamflow', '对话1');
      manager.create('teamflow', '对话2');
      manager.create('teamflow', '对话3');
      const recent = manager.getRecent('teamflow', 2);
      assert.strictEqual(recent.length, 2);
    });
  });

  describe('Prompt 构建', () => {
    it('buildMemoryPrompt 应包含最近对话的决策和洞察', () => {
      const convId = manager.create('teamflow', '架构讨论')!.id;
      manager.addKeyDecision(
        'teamflow',
        convId,
        '微服务架构',
        '决定采用微服务',
        '已确定'
      );
      manager.addInsight(
        'teamflow',
        convId,
        '服务拆分粒度要适中',
        '发现'
      );
      const prompt = manager.buildMemoryPrompt('teamflow', 1);
      assert.ok(prompt.includes('【相关历史】'));
      assert.ok(prompt.includes('微服务架构'));
      assert.ok(prompt.includes('服务拆分粒度要适中'));
    });

    it('buildMemoryPrompt 无对话时应返回空字符串', () => {
      const prompt = manager.buildMemoryPrompt('teamflow');
      assert.strictEqual(prompt, '');
    });
  });
});
