/**
 * Remember Me - ConversationHistoryWebview 单元测试
 * 验证对话历史 Webview 的初始化、筛选、HTML 生成和消息处理
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  ConversationHistoryWebview,
  ConversationFilterOptions,
} from '../../ui/webview/conversationHistory';
import type { Conversation } from '../../types';

// 扩展 vscode mock，补充测试所需的方法
const win = vscode.window as any;
const ws = vscode.workspace as any;
if (!win.showSaveDialog) {
  win.showSaveDialog = () => Promise.resolve(undefined);
}
if (!ws.fs) {
  ws.fs = { writeFile: () => Promise.resolve() };
}

/**
 * 测试子类：暴露受保护方法以便测试
 */
class TestableConversationHistoryWebview extends ConversationHistoryWebview {
  public testGetHtml(webview: vscode.Webview): string {
    return this.getHtml(webview);
  }

  public testHandleMessage(message: unknown): void {
    return this.handleMessage(message);
  }

  public testFormatDate(dateStr: string): string {
    return this.formatDate(dateStr);
  }

  public testFormatDateTime(dateStr: string): string {
    return this.formatDateTime(dateStr);
  }

  public testTruncateMessage(content: string, maxLength: number): string {
    return this.truncateMessage(content, maxLength);
  }

  public testGenerateMarkdown(conv: Conversation): string {
    return this.generateMarkdown(conv);
  }

  public getFilter(): ConversationFilterOptions {
    return this.currentFilter;
  }

  public getSelectedId(): string | null {
    return this.selectedConversationId;
  }

  public getSelectedProject(): string | null {
    return this.selectedProjectName;
  }

  public getSelectedData(): Conversation | null {
    return this.selectedConversationData;
  }
}

describe('ConversationHistoryWebview', () => {
  let webview: TestableConversationHistoryWebview;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = new (vscode as any).ExtensionContext() as vscode.ExtensionContext;
    webview = new TestableConversationHistoryWebview(mockContext);
  });

  describe('构造函数', () => {
    it('应正确初始化并保存初始筛选选项', () => {
      const filter = { projectName: '测试项目', keyword: '测试' };
      const wv = new TestableConversationHistoryWebview(mockContext, filter);
      assert.deepStrictEqual(wv.getCurrentFilter(), filter);
    });

    it('无初始筛选时应使用空对象', () => {
      assert.deepStrictEqual(webview.getCurrentFilter(), {});
    });
  });

  describe('筛选选项', () => {
    it('setFilter 应更新当前筛选条件', () => {
      webview.setFilter({ projectName: '项目A' });
      assert.strictEqual(webview.getCurrentFilter().projectName, '项目A');
    });

    it('setFilter 应合并而非替换筛选条件', () => {
      webview.setFilter({ projectName: '项目A' });
      webview.setFilter({ keyword: '测试' });
      const filter = webview.getCurrentFilter();
      assert.strictEqual(filter.projectName, '项目A');
      assert.strictEqual(filter.keyword, '测试');
    });

    it('getCurrentFilter 应返回副本而非引用', () => {
      const filter1 = webview.getCurrentFilter();
      filter1.projectName = '修改';
      const filter2 = webview.getCurrentFilter();
      assert.strictEqual(filter2.projectName, undefined);
    });
  });

  describe('HTML 生成', () => {
    it('getHtml 应包含搜索框和筛选器', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('searchInput'));
      assert.ok(html.includes('projectFilter'));
      assert.ok(html.includes('tagFilter'));
    });

    it('getHtml 应包含对话列表和详情面板', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('history-sidebar'));
      assert.ok(html.includes('history-detail'));
      assert.ok(html.includes('history-main'));
    });

    it('未选择对话时详情面板应显示空状态提示', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('选择一个对话查看详情'));
    });
  });

  describe('消息处理', () => {
    it('selectConversation 消息应设置选中对话', () => {
      webview.testHandleMessage({
        command: 'selectConversation',
        projectName: '项目A',
        conversationId: 'conv_123',
      });
      assert.strictEqual(webview.getSelectedProject(), '项目A');
      assert.strictEqual(webview.getSelectedId(), 'conv_123');
    });

    it('searchConversations 消息应更新关键词筛选', () => {
      webview.testHandleMessage({
        command: 'searchConversations',
        keyword: '测试',
      });
      assert.strictEqual(webview.getCurrentFilter().keyword, '测试');
    });

    it('filterByProject 消息应更新项目筛选', () => {
      webview.testHandleMessage({
        command: 'filterByProject',
        projectName: '项目B',
      });
      assert.strictEqual(webview.getCurrentFilter().projectName, '项目B');
    });

    it('filterByDateRange 消息应更新日期范围筛选', () => {
      webview.testHandleMessage({
        command: 'filterByDateRange',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      const filter = webview.getCurrentFilter();
      assert.strictEqual(filter.startDate, '2024-01-01');
      assert.strictEqual(filter.endDate, '2024-12-31');
    });

    it('filterByTags 消息应更新标签筛选', () => {
      webview.testHandleMessage({
        command: 'filterByTags',
        tags: ['重要', '已决策'],
      });
      assert.deepStrictEqual(webview.getCurrentFilter().tags, ['重要', '已决策']);
    });

    it('clearFilters 消息应清除所有筛选', () => {
      webview.setFilter({ projectName: '项目A', keyword: '测试', tags: ['标签'] });
      webview.testHandleMessage({ command: 'clearFilters' });
      assert.deepStrictEqual(webview.getCurrentFilter(), {});
    });

    it('无效消息应被忽略', () => {
      webview.setFilter({ projectName: '项目A' });
      webview.testHandleMessage(null);
      webview.testHandleMessage('string');
      webview.testHandleMessage(123);
      assert.strictEqual(webview.getCurrentFilter().projectName, '项目A');
    });
  });

  describe('数据格式化', () => {
    it('formatDate 应正确格式化 ISO 日期字符串', () => {
      const result = webview.testFormatDate('2024-06-15T10:30:00Z');
      assert.ok(result.includes('2024'));
      assert.ok(result.includes('6') || result.includes('06'));
    });

    it('formatDateTime 应包含日期和时间信息', () => {
      const result = webview.testFormatDateTime('2024-06-15T10:30:00Z');
      assert.ok(result.includes('2024'));
      // 检查是否包含冒号，表示有时间部分
      assert.ok(result.includes(':'));
    });

    it('truncateMessage 应正确截断超长消息', () => {
      const longMessage = 'a'.repeat(3000);
      const result = webview.testTruncateMessage(longMessage, 100);
      assert.strictEqual(result.length, 103);
      assert.ok(result.endsWith('...'));
    });

    it('truncateMessage 不应截断短消息', () => {
      const shortMessage = '短消息';
      const result = webview.testTruncateMessage(shortMessage, 100);
      assert.strictEqual(result, shortMessage);
    });
  });

  describe('Markdown 导出', () => {
    it('generateMarkdown 应生成正确的 Markdown 格式', () => {
      const conv: Conversation = {
        id: 'conv_1',
        title: '测试对话',
        createdAt: '2024-06-15T10:00:00Z',
        updatedAt: '2024-06-15T11:00:00Z',
        messages: [
          { role: 'user', content: '你好', timestamp: '2024-06-15T10:00:00Z' },
          { role: 'assistant', content: '你好！', timestamp: '2024-06-15T10:01:00Z' },
        ],
        keyDecisions: [
          {
            id: 'dec_1',
            title: '决策A',
            description: '描述A',
            createdAt: '2024-06-15T10:30:00Z',
            status: '已确定',
          },
        ],
        insights: [
          {
            id: 'ins_1',
            content: '洞察内容',
            createdAt: '2024-06-15T10:45:00Z',
            category: '发现',
          },
        ],
        tags: ['标签1', '标签2'],
      };
      const markdown = webview.testGenerateMarkdown(conv);
      assert.ok(markdown.includes('# 测试对话'));
      assert.ok(markdown.includes('## 消息流'));
      assert.ok(markdown.includes('## 关键决策'));
      assert.ok(markdown.includes('## 洞察'));
      assert.ok(markdown.includes('标签1'));
      assert.ok(markdown.includes('用户'));
      assert.ok(markdown.includes('助手'));
      assert.ok(markdown.includes('决策A'));
      assert.ok(markdown.includes('洞察内容'));
    });
  });
});
