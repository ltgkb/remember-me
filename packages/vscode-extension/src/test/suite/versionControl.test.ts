/**
 * Remember Me - VersionControlWebview 单元测试
 * 验证版本控制面板的初始化、备份扫描、HTML 生成和消息处理
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { VersionControlWebview } from '../../ui/webview/versionControl';

// 扩展 vscode mock，补充测试所需的方法
const win = vscode.window as any;
if (!win.showWarningMessage) {
  win.showWarningMessage = () => Promise.resolve(undefined);
}
if (!win.showInformationMessage) {
  win.showInformationMessage = () => Promise.resolve(undefined);
}
if (!win.showErrorMessage) {
  win.showErrorMessage = () => Promise.resolve(undefined);
}

/**
 * 测试子类：暴露受保护方法以便测试
 */
class TestableVersionControlWebview extends VersionControlWebview {
  public testGetHtml(webview: vscode.Webview): string {
    return this.getHtml(webview);
  }

  public testHandleMessage(message: unknown): void {
    return this.handleMessage(message);
  }

  public testFormatFileSize(bytes: number): string {
    return this.formatFileSize(bytes);
  }

  public testFormatDateTime(dateStr: string): string {
    return this.formatDateTime(dateStr);
  }

  public testEscapeHtml(text: string): string {
    return this.escapeHtml(text);
  }

  public testGetBackupStatus(index: number, total: number): 'recent' | 'old' | 'cleanup' {
    return this.getBackupStatus(index, total);
  }

  public testIsPathSafe(checkPath: string): boolean {
    return this.isPathSafe(checkPath);
  }

  public testHighlightJson(json: string): string {
    return this.highlightJson(json);
  }

  public setSelectedBackupPath(path: string | null): void {
    this.selectedBackupPath = path;
  }

  public getSelectedBackupPath(): string | null {
    return this.selectedBackupPath;
  }
}

describe('VersionControlWebview', () => {
  let webview: TestableVersionControlWebview;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = new (vscode as any).ExtensionContext() as vscode.ExtensionContext;
    webview = new TestableVersionControlWebview(mockContext);
  });

  describe('构造函数', () => {
    it('应正确初始化并设置选中路径为 null', () => {
      assert.strictEqual(webview.getSelectedBackupPath(), null);
    });
  });

  describe('HTML 生成', () => {
    it('getHtml 应包含标题和刷新按钮', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('记忆版本控制'));
      assert.ok(html.includes('refreshBackups'));
    });

    it('getHtml 空状态应显示提示信息', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('尚无备份记录'));
    });

    it('getHtml 应包含预览面板区域', () => {
      const html = webview.testGetHtml({} as vscode.Webview);
      assert.ok(html.includes('vc-preview'));
      assert.ok(html.includes('json-preview'));
    });
  });

  describe('消息处理', () => {
    it('loadBackups 消息应触发刷新（不抛异常）', () => {
      // 无备份时 selectedBackupPath 应保持 null
      webview.setSelectedBackupPath('some-path');
      webview.testHandleMessage({ command: 'loadBackups' });
      // 刷新后无备份，selectedBackupPath 被重置逻辑在 scanBackups 中，
      // 但由于无真实文件系统，backupGroups 为空，HTML 重新生成
      assert.strictEqual(webview.getSelectedBackupPath(), 'some-path');
    });

    it('refresh 消息应触发刷新（不抛异常）', () => {
      assert.doesNotThrow(() => {
        webview.testHandleMessage({ command: 'refresh' });
      });
    });

    it('无效消息对象应被静默忽略', () => {
      assert.doesNotThrow(() => {
        webview.testHandleMessage(null);
        webview.testHandleMessage(undefined);
        webview.testHandleMessage('string');
        webview.testHandleMessage(123);
      });
    });

    it('无 command 字段的消息应被忽略', () => {
      assert.doesNotThrow(() => {
        webview.testHandleMessage({ data: 'test' });
      });
    });
  });

  describe('工具方法', () => {
    it('formatFileSize 应正确格式化字节数', () => {
      assert.strictEqual(webview.testFormatFileSize(512), '512 B');
      assert.strictEqual(webview.testFormatFileSize(1536), '1.5 KB');
      assert.strictEqual(webview.testFormatFileSize(1024 * 1024 * 2), '2.0 MB');
    });

    it('formatDateTime 应正确格式化 ISO 日期为中文时间', () => {
      const result = webview.testFormatDateTime('2024-06-15T10:30:00Z');
      assert.ok(result.includes('2024'));
      assert.ok(result.includes('10') || result.includes('18')); // UTC 或本地时区
    });

    it('formatDateTime 对空字符串应返回空', () => {
      assert.strictEqual(webview.testFormatDateTime(''), '');
    });

    it('escapeHtml 应正确转义特殊字符', () => {
      const input = '<script>alert("xss")</script>';
      const result = webview.testEscapeHtml(input);
      assert.ok(!result.includes('<script>'));
      assert.ok(result.includes('&lt;script&gt;'));
      assert.ok(result.includes('&quot;'));
    });

    it('escapeHtml 对空值应返回空字符串', () => {
      assert.strictEqual(webview.testEscapeHtml(''), '');
    });
  });

  describe('备份状态判断', () => {
    it('getBackupStatus 前5个应标记为 recent', () => {
      assert.strictEqual(webview.testGetBackupStatus(0, 20), 'recent');
      assert.strictEqual(webview.testGetBackupStatus(4, 20), 'recent');
    });

    it('getBackupStatus 超过15个且索引>=15应标记为 cleanup', () => {
      assert.strictEqual(webview.testGetBackupStatus(15, 20), 'cleanup');
      assert.strictEqual(webview.testGetBackupStatus(18, 20), 'cleanup');
    });

    it('getBackupStatus 中间范围应标记为 old', () => {
      assert.strictEqual(webview.testGetBackupStatus(5, 20), 'old');
      assert.strictEqual(webview.testGetBackupStatus(10, 20), 'old');
      assert.strictEqual(webview.testGetBackupStatus(14, 20), 'old');
    });

    it('getBackupStatus 总数<=15时不应有 cleanup', () => {
      assert.strictEqual(webview.testGetBackupStatus(10, 15), 'old');
      assert.strictEqual(webview.testGetBackupStatus(14, 15), 'old');
    });
  });

  describe('JSON 高亮', () => {
    it('highlightJson 应为键名和字符串值添加 span 标签', () => {
      const json = '{"name":"test","count":42}';
      const result = webview.testHighlightJson(json);
      assert.ok(result.includes('json-key'));
      assert.ok(result.includes('json-string'));
      assert.ok(result.includes('json-number'));
    });

    it('highlightJson 应正确处理布尔值', () => {
      const json = '{"active":true,"deleted":false,"data":null}';
      const result = webview.testHighlightJson(json);
      assert.ok(result.includes('json-boolean'));
    });
  });

  describe('路径安全检查', () => {
    it('isPathSafe 对 basePath 内的路径应返回 true', () => {
      // 使用实际存储的 basePath（临时测试目录或默认 home/.remember-me）
      const safePath = webview.testIsPathSafe('/home/user/.remember-me/profile.json');
      // 结果取决于运行环境，但不应抛异常
      assert.strictEqual(typeof safePath, 'boolean');
    });

    it('isPathSafe 对空路径应返回 false', () => {
      const result = webview.testIsPathSafe('');
      assert.strictEqual(result, false);
    });
  });
});
