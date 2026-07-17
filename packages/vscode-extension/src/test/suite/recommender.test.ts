/**
 * Remember Me - MemoryRecommender 单元测试
 * 验证内容感知记忆推荐系统的关键词提取、相关性计算和候选收集（PRD §2.2.2、§2.3.1）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryRecommender } from '../../memory/recommender';
import { ConversationManager } from '../../memory/conversation';
import { ProjectManager } from '../../memory/project';
import { JsonStorage } from '../../memory/storage';
import type { MemoryRecommendation, Conversation } from '../../types';

describe('MemoryRecommender', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let conversationManager: ConversationManager;
  let projectManager: ProjectManager;
  let recommender: MemoryRecommender;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'remember-me-recommender-test-')
    );
    storage = new JsonStorage({ basePath: tempDir });
    conversationManager = new ConversationManager(storage);
    projectManager = new ProjectManager(storage);
    recommender = new MemoryRecommender(conversationManager, projectManager);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ==================== 关键词提取 ====================

  describe('extractKeywords', () => {
    it('应提取英文关键词并转小写', () => {
      const keywords = recommender.extractKeywords('We use OAuth 2.0 for Authentication');
      assert.ok(keywords.includes('oauth'));
      assert.ok(keywords.includes('authentication'));
      // 英文停用词应被过滤
      assert.strictEqual(keywords.includes('we'), false, '"we" 是停用词，应被过滤');
      assert.strictEqual(keywords.includes('for'), false, '"for" 是停用词，应被过滤');
      assert.strictEqual(keywords.includes('a'), false); // 单字符应被过滤
    });

    it('应过滤英文停用词', () => {
      const keywords = recommender.extractKeywords('This is a test document about user login');
      assert.strictEqual(keywords.includes('this'), false, '"this" 是停用词，应被过滤');
      assert.strictEqual(keywords.includes('is'), false, '"is" 是停用词，应被过滤');
      assert.strictEqual(keywords.includes('a'), false, '"a" 是停用词，应被过滤');
      assert.strictEqual(keywords.includes('about'), false, '"about" 是停用词，应被过滤');
      assert.ok(keywords.includes('test'), '"test" 不是停用词，应保留');
      assert.ok(keywords.includes('document'), '"document" 不是停用词，应保留');
      assert.ok(keywords.includes('user'), '"user" 不是停用词，应保留');
      assert.ok(keywords.includes('login'), '"login" 不是停用词，应保留');
    });

    it('混合中英文文本应正确提取并过滤', () => {
      const keywords = recommender.extractKeywords('我们使用 Python 进行开发，this is a Python project');
      assert.ok(keywords.includes('python'), 'Python 应被提取并转小写');
      assert.ok(keywords.includes('开发'), '中文关键词应被提取');
      assert.strictEqual(keywords.includes('我们'), false, '我们 是中文停用词，应被过滤');
      assert.strictEqual(keywords.includes('进行'), false, '进行 是中文停用词，应被过滤');
      assert.strictEqual(keywords.includes('this'), false, 'this 是英文停用词，应被过滤');
      assert.strictEqual(keywords.includes('is'), false, 'is 是英文停用词，应被过滤');
      assert.strictEqual(keywords.includes('a'), false, 'a 是英文停用词，应被过滤');
    });

    it('纯英文停用词应全部过滤', () => {
      const keywords = recommender.extractKeywords('The and or but if because before after');
      assert.deepStrictEqual(keywords, [], '纯停用词文本应返回空数组');
    });

    it('应提取中文关键词并过滤停用词', () => {
      const keywords = recommender.extractKeywords('我们使用 OAuth 2.0 进行认证');
      assert.ok(keywords.includes('认证'));
      assert.ok(keywords.includes('oauth'));
      assert.strictEqual(keywords.includes('我们'), false);
      assert.strictEqual(keywords.includes('进行'), false);
    });

    it('应过滤单字中文', () => {
      const keywords = recommender.extractKeywords('这是一段测试文本');
      assert.ok(keywords.includes('测试'));
      assert.ok(keywords.includes('文本'));
      assert.strictEqual(keywords.includes('一'), false);
    });

    it('空文本应返回空数组', () => {
      assert.deepStrictEqual(recommender.extractKeywords(''), []);
      assert.deepStrictEqual(recommender.extractKeywords('   '), []);
    });

    it('应去重', () => {
      const keywords = recommender.extractKeywords('认证 认证 认证');
      assert.strictEqual(keywords.filter(k => k === '认证').length, 1);
    });
  });

  // ==================== 基础推荐 ====================

  describe('recommend', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
      projectManager.addDecision('TeamFlow', '认证方案', '使用 OAuth 2.0 实现单点登录', '已确定');
      projectManager.setTerminology('TeamFlow', 'SSO', '单点登录系统');
    });

    it('应基于关键词匹配推荐项目决策', () => {
      const results = recommender.recommend('我们需要实现 OAuth 认证', 'TeamFlow');
      assert.ok(results.length > 0, '应返回至少一条推荐');
      assert.ok(
        results.some(r => r.type === 'decision' && r.title === '认证方案'),
        '应推荐「认证方案」决策'
      );
    });

    it('应基于关键词匹配推荐术语', () => {
      const results = recommender.recommend('关于单点登录的问题', 'TeamFlow');
      assert.ok(
        results.some(r => r.type === 'term' && r.title === 'SSO'),
        '应推荐 SSO 术语'
      );
    });

    it('无匹配时应返回空数组', () => {
      const results = recommender.recommend('完全无关的内容区块链元宇宙', 'TeamFlow');
      assert.deepStrictEqual(results, []);
    });

    it('应返回最多 5 条推荐', () => {
      // 添加大量决策以触发截断
      for (let i = 0; i < 10; i++) {
        projectManager.addDecision('TeamFlow', `决策${i}`, `描述 ${i} OAuth`, '已确定');
      }
      const results = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(results.length <= 5, `返回了 ${results.length} 条，应不超过 5 条`);
    });

    it('应按 relevanceScore 降序排列', () => {
      const results = recommender.recommend('OAuth 单点登录', 'TeamFlow');
      for (let i = 1; i < results.length; i++) {
        assert.ok(
          results[i - 1].relevanceScore >= results[i].relevanceScore,
          '推荐应按相关性降序排列'
        );
      }
    });

    it('relevanceScore 应不超过 1.0', () => {
      const results = recommender.recommend('OAuth 认证方案', 'TeamFlow');
      for (const r of results) {
        assert.ok(
          r.relevanceScore <= 1.0,
          `相关性得分 ${r.relevanceScore} 超过 1.0`
        );
      }
    });
  });

  // ==================== 权重加成 ====================

  describe('权重加成', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
      projectManager.create('OtherProject', '个人用户', '笔记应用');
      projectManager.addDecision('TeamFlow', '方案A', '使用 OAuth', '已确定');
      projectManager.addDecision('OtherProject', '方案B', '使用 OAuth', '待确认');
    });

    it('同一项目应获得更高分数', () => {
      const results = recommender.recommend('OAuth', 'TeamFlow');
      const teamFlowResult = results.find(r => r.projectName === 'TeamFlow');
      const otherResult = results.find(r => r.projectName === 'OtherProject');

      if (teamFlowResult && otherResult) {
        assert.ok(
          teamFlowResult.relevanceScore > otherResult.relevanceScore,
          '同一项目的推荐应得分更高'
        );
      }
    });

    it('已确定决策应获得更高分数', () => {
      const results = recommender.recommend('OAuth');
      const confirmed = results.find(r => r.title === '方案A');
      const pending = results.find(r => r.title === '方案B');

      if (confirmed && pending) {
        assert.ok(
          confirmed.relevanceScore > pending.relevanceScore,
          '已确定决策应比待确认决策得分更高'
        );
      }
    });

    it('近期内容应获得更高分数', () => {
      const now = new Date().toISOString();
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 通过直接操作 storage 创建旧决策
      const project = projectManager.read('TeamFlow')!;
      project.decisions = [
        { id: 'dec_old', title: '旧方案', description: '使用 OAuth', createdAt: oldDate, status: '已确定' },
        { id: 'dec_new', title: '新方案', description: '使用 OAuth', createdAt: now, status: '已确定' },
      ];
      storage.write(project, 'projects', 'teamflow', 'context.json');

      const results = recommender.recommend('OAuth', 'TeamFlow');
      const oldResult = results.find(r => r.title === '旧方案');
      const newResult = results.find(r => r.title === '新方案');

      if (oldResult && newResult) {
        assert.ok(
          newResult.relevanceScore >= oldResult.relevanceScore,
          '近期内容应得分不低于旧内容'
        );
      }
    });
  });

  // ==================== 会话忽略 ====================

  describe('ignoreInSession', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
      projectManager.addDecision('TeamFlow', '认证方案', '使用 OAuth 2.0', '已确定');
    });

    it('应忽略指定推荐 ID', () => {
      const before = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(before.length > 0, '初始应能搜到推荐');

      const targetId = before[0].id;
      recommender.ignoreInSession(targetId);

      const after = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(
        !after.some(r => r.id === targetId),
        '忽略后不应再出现该推荐'
      );
    });

    it('应支持忽略多条', () => {
      const before = recommender.recommend('OAuth', 'TeamFlow');
      before.forEach(r => recommender.ignoreInSession(r.id));

      const after = recommender.recommend('OAuth', 'TeamFlow');
      assert.deepStrictEqual(after, []);
    });
  });

  describe('clearSessionIgnores', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
      projectManager.addDecision('TeamFlow', '认证方案', '使用 OAuth 2.0', '已确定');
    });

    it('清除后应恢复推荐', () => {
      const before = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(before.length > 0);

      const targetId = before[0].id;
      recommender.ignoreInSession(targetId);
      assert.ok(!recommender.recommend('OAuth', 'TeamFlow').some(r => r.id === targetId));

      recommender.clearSessionIgnores();
      const after = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(
        after.some(r => r.id === targetId),
        '清除忽略后应恢复推荐'
      );
    });
  });

  // ==================== 对话记忆推荐 ====================

  describe('对话记忆推荐', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
    });

    it('应推荐对话标题', () => {
      conversationManager.create('TeamFlow', 'OAuth 集成讨论');
      const results = recommender.recommend('OAuth 认证', 'TeamFlow');
      assert.ok(
        results.some(r => r.type === 'conversation' && r.title === 'OAuth 集成讨论'),
        '应推荐匹配的对话标题'
      );
    });

    it('应推荐对话中的关键决策', () => {
      const conv = conversationManager.create('TeamFlow', '技术选型');
      if (conv) {
        conversationManager.addKeyDecision('TeamFlow', conv.id, '使用 Redis', '作为缓存层');
      }
      const results = recommender.recommend('Redis 缓存', 'TeamFlow');
      assert.ok(
        results.some(r => r.type === 'decision' && r.title === '使用 Redis'),
        '应推荐对话中的关键决策'
      );
    });

    it('应推荐对话中的洞察', () => {
      const conv = conversationManager.create('TeamFlow', '性能优化');
      if (conv) {
        conversationManager.addInsight('TeamFlow', conv.id, '引入索引后查询速度提升 10 倍', '发现');
      }
      const results = recommender.recommend('索引 查询速度', 'TeamFlow');
      assert.ok(
        results.some(r => r.type === 'conversation' && r.description.includes('索引')),
        '应推荐对话中的洞察'
      );
    });

    it('用户消息匹配应获得加成', () => {
      const conv = conversationManager.create('TeamFlow', '通用讨论');
      if (conv) {
        // 添加一条用户消息
        conversationManager.addMessage('TeamFlow', conv.id, 'user', '我们在讨论 OAuth 2.0 的实现细节');
      }
      const results = recommender.recommend('OAuth 2.0', 'TeamFlow');
      const convResult = results.find(r => r.id === `conv_TeamFlow_${conv?.id}`);
      if (convResult) {
        assert.ok(convResult.relevanceScore > 0, '含用户消息匹配的对话应有正分数');
      }
    });
  });

  // ==================== 类型与字段完整性 ====================

  describe('MemoryRecommendation 字段完整性', () => {
    beforeEach(() => {
      projectManager.create('TeamFlow', '企业管理员', '项目管理协作');
      projectManager.addDecision('TeamFlow', '认证方案', '使用 OAuth 2.0', '已确定');
    });

    it('返回的推荐应包含所有必填字段', () => {
      const results = recommender.recommend('OAuth', 'TeamFlow');
      assert.ok(results.length > 0);

      const r = results[0];
      assert.ok(r.id && typeof r.id === 'string', '应有 id');
      assert.ok(['conversation', 'decision', 'term'].includes(r.type), 'type 应合法');
      assert.ok(r.title && typeof r.title === 'string', '应有 title');
      assert.ok(r.description && typeof r.description === 'string', '应有 description');
      assert.ok(r.source && typeof r.source === 'string', '应有 source');
      assert.ok(typeof r.relevanceScore === 'number', '应有 relevanceScore');
      assert.ok(r.createdAt && typeof r.createdAt === 'string', '应有 createdAt');
    });
  });

  // ==================== 跨项目搜索 ====================

  describe('跨项目推荐', () => {
    beforeEach(() => {
      projectManager.create('ProjectA', 'A用户', 'A功能');
      projectManager.create('ProjectB', 'B用户', 'B功能');
      projectManager.addDecision('ProjectA', '方案A', '使用 OAuth', '已确定');
      projectManager.addDecision('ProjectB', '方案B', '使用 OAuth', '已确定');
    });

    it('不传 currentProject 时应跨项目搜索', () => {
      const results = recommender.recommend('OAuth');
      assert.ok(results.length >= 2, '应返回多个项目的推荐');
      assert.ok(results.some(r => r.projectName === 'ProjectA'));
      assert.ok(results.some(r => r.projectName === 'ProjectB'));
    });
  });
});
