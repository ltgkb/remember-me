/**
 * Remember Me - InfoExtractor 单元测试
 * 验证关键信息自动提取模块的文本提取、对话提取、置信度计算和 Insight 生成功能
 */

import * as assert from 'assert';
import { InfoExtractor, ExtractedInfo } from '../../memory/extractor';
import type { Conversation, ChatMessage } from '../../types';

describe('InfoExtractor', () => {
  let extractor: InfoExtractor;

  beforeEach(() => {
    extractor = new InfoExtractor();
  });

  // ==================== 文本提取：决策 ====================
  describe('文本提取 - 决策', () => {
    it('应提取 "我们决定" 类决策，置信度为 0.9', () => {
      const text = '经过讨论，我们决定采用微服务架构。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'decision');
      assert.strictEqual(results[0].confidence, 0.9);
      assert.ok(results[0].content.includes('我们决定采用微服务架构'));
      assert.strictEqual(results[0].parsedValue?.title, '采用微服务架构');
    });

    it('应提取 "选定" 类决策，置信度为 0.9', () => {
      const text = '最终选定 React 作为前端框架。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'decision');
      assert.strictEqual(results[0].confidence, 0.9);
      assert.strictEqual(results[0].parsedValue?.title, 'React 作为前端框架');
    });

    it('应提取 "考虑用" 类间接决策，置信度为 0.5', () => {
      const text = '我们考虑用 Go 语言开发。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'decision');
      assert.strictEqual(results[0].confidence, 0.5);
    });
  });

  // ==================== 文本提取：术语定义 ====================
  describe('文本提取 - 术语定义', () => {
    it('应提取 "XXX 是指" 类术语定义，置信度为 0.85', () => {
      const text = 'SSR 是指服务端渲染。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'terminology');
      assert.strictEqual(results[0].confidence, 0.85);
      assert.strictEqual(results[0].parsedValue?.title, 'SSR');
      assert.strictEqual(results[0].parsedValue?.description, '服务端渲染');
    });

    it('应提取 "我们称 XXX 为" 类术语定义', () => {
      const text = '我们称这个模块为网关层。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'terminology');
      assert.strictEqual(results[0].parsedValue?.title, '这个模块');
      assert.strictEqual(results[0].parsedValue?.description, '网关层');
    });
  });

  // ==================== 文本提取：竞品提及 ====================
  describe('文本提取 - 竞品提及', () => {
    it('应提取 "竞品有" 类提及，置信度为 0.8', () => {
      const text = '竞品包括 Notion、Obsidian 和 Roam Research。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'competitor');
      assert.strictEqual(results[0].confidence, 0.8);
      assert.ok(results[0].parsedValue?.title?.includes('Notion'));
    });
  });

  // ==================== 文本提取：关键修改 ====================
  describe('文本提取 - 关键修改', () => {
    it('应提取 "修改为" 类修改，置信度为 0.9', () => {
      const text = '将数据库修改为 PostgreSQL。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'modification');
      assert.strictEqual(results[0].confidence, 0.9);
      assert.strictEqual(results[0].parsedValue?.title, 'PostgreSQL');
    });

    it('应提取 "不再使用" 类修改，置信度为 0.8', () => {
      const text = '我们不再使用 MongoDB 了。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'modification');
      assert.strictEqual(results[0].confidence, 0.8);
    });
  });

  // ==================== 文本提取：新发现 ====================
  describe('文本提取 - 新发现', () => {
    it('应提取 "发现" 类发现，置信度为 0.9', () => {
      const text = '测试过程中发现内存泄漏问题。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'discovery');
      assert.strictEqual(results[0].confidence, 0.9);
      assert.ok(results[0].content.includes('发现内存泄漏问题'));
    });

    it('应提取 "原来" 类发现，置信度为 0.7', () => {
      const text = '原来性能瓶颈在数据库连接池。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].type, 'discovery');
      assert.strictEqual(results[0].confidence, 0.7);
    });
  });

  // ==================== 对话提取 ====================
  describe('从对话提取', () => {
    it('应从 Conversation 对象的多条消息中提取信息', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '我们决定使用 Vue 3。', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: 'SSR 是指服务端渲染。', timestamp: '2024-01-01T10:01:00Z' },
        { role: 'user', content: '发现接口响应变慢了。', timestamp: '2024-01-01T10:02:00Z' },
      ];

      const conversation: Conversation = {
        id: 'conv_test',
        title: '技术讨论',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:02:00Z',
        messages,
        keyDecisions: [],
        insights: [],
        tags: [],
      };

      const results = extractor.extractFromConversation(conversation);

      assert.strictEqual(results.length, 3);
      assert.ok(results.some((r) => r.type === 'decision'));
      assert.ok(results.some((r) => r.type === 'terminology'));
      assert.ok(results.some((r) => r.type === 'discovery'));
    });

    it('空消息对话应返回空数组', () => {
      const conversation: Conversation = {
        id: 'conv_empty',
        title: '空对话',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z',
        messages: [],
        keyDecisions: [],
        insights: [],
        tags: [],
      };

      const results = extractor.extractFromConversation(conversation);
      assert.deepStrictEqual(results, []);
    });
  });

  // ==================== 置信度与排序 ====================
  describe('置信度与排序', () => {
    it('应按置信度从高到低排序', () => {
      const text = '我们决定用 A。考虑用 B。';
      const results = extractor.extractFromText(text);

      assert.strictEqual(results.length, 2);
      assert.ok(results[0].confidence >= results[1].confidence, '第一个结果置信度应 >= 第二个');
      assert.strictEqual(results[0].type, 'decision');
      assert.strictEqual(results[0].confidence, 0.9);
      assert.strictEqual(results[1].confidence, 0.5);
    });
  });

  // ==================== 边界情况 ====================
  describe('边界情况', () => {
    it('空文本应返回空数组', () => {
      assert.deepStrictEqual(extractor.extractFromText(''), []);
      assert.deepStrictEqual(extractor.extractFromText('   '), []);
    });

    it('无匹配内容的文本应返回空数组', () => {
      const text = '今天天气不错，适合出去散步。';
      assert.deepStrictEqual(extractor.extractFromText(text), []);
    });
  });

  // ==================== Insight 生成 ====================
  describe('生成 Insights', () => {
    it('应将提取结果正确转换为 Insight 对象', () => {
      const extracted: ExtractedInfo[] = [
        {
          type: 'decision',
          content: '我们决定采用 React。',
          confidence: 0.9,
          parsedValue: { title: '采用 React', description: '' },
        },
        {
          type: 'discovery',
          content: '发现性能瓶颈。',
          confidence: 0.9,
          parsedValue: { title: '性能瓶颈' },
        },
        {
          type: 'modification',
          content: '修改为 Vue。',
          confidence: 0.9,
          parsedValue: { title: 'Vue' },
        },
      ];

      const insights = extractor.generateInsights(extracted);

      assert.strictEqual(insights.length, 3);

      // 决策 -> 决策
      const decisionInsight = insights.find((i) => i.category === '决策');
      assert.ok(decisionInsight);
      assert.ok(decisionInsight!.id.startsWith('decision_'));
      assert.ok(decisionInsight!.content.includes('React'));

      // 发现 -> 发现
      const discoveryInsight = insights.find((i) => i.category === '发现');
      assert.ok(discoveryInsight);
      assert.ok(discoveryInsight!.id.startsWith('discovery_'));

      // 修改 -> 修改
      const modificationInsight = insights.find((i) => i.category === '修改');
      assert.ok(modificationInsight);
      assert.ok(modificationInsight!.id.startsWith('mod_'));
      assert.ok(modificationInsight!.content.includes('Vue'));
    });

    it('空提取结果应返回空数组', () => {
      assert.deepStrictEqual(extractor.generateInsights([]), []);
    });

    it('Insight 内容应优先使用 parsedValue.title 和 description', () => {
      const extracted: ExtractedInfo[] = [
        {
          type: 'terminology',
          content: 'SSR 是指服务端渲染。',
          confidence: 0.85,
          parsedValue: { title: 'SSR', description: '服务端渲染' },
        },
      ];

      const insights = extractor.generateInsights(extracted);
      assert.strictEqual(insights.length, 1);
      assert.strictEqual(insights[0].content, 'SSR：服务端渲染');
      assert.strictEqual(insights[0].category, '发现');
    });
  });

  // ==================== 去重 ====================
  describe('去重', () => {
    it('对话中重复内容应只保留一次', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '我们决定使用 Vue 3。', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant', content: '我们决定使用 Vue 3。', timestamp: '2024-01-01T10:01:00Z' },
      ];

      const conversation: Conversation = {
        id: 'conv_dup',
        title: '重复测试',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:01:00Z',
        messages,
        keyDecisions: [],
        insights: [],
        tags: [],
      };

      const results = extractor.extractFromConversation(conversation);
      assert.strictEqual(results.length, 1);
    });
  });
});
