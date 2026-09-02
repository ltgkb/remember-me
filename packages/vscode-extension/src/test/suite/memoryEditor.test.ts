/**
 * Remember Me - MemoryEditorWebview regression tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { MemoryEditorWebview } from '../../ui/webview/memoryEditor';

class TestableMemoryEditorWebview extends MemoryEditorWebview {
  public testGetHtml(webview: vscode.Webview): string {
    return this.getHtml(webview);
  }

  public testHandleMessage(message: unknown): void {
    this.handleMessage(message);
  }

  public attachWebview(webview: vscode.Webview): void {
    this.panel = { webview } as vscode.WebviewPanel;
  }
}

describe('MemoryEditorWebview', () => {
  let editor: TestableMemoryEditorWebview;
  let webview: vscode.Webview;

  beforeEach(() => {
    const context = new (vscode as any).ExtensionContext() as vscode.ExtensionContext;
    editor = new TestableMemoryEditorWebview(context);
    webview = { html: '', cspSource: 'vscode-webview:' } as vscode.Webview;
    editor.attachWebview(webview);
  });

  it('搜索消息应重建结果页面并显示空结果状态', () => {
    editor.testHandleMessage({ command: 'search', query: 'manual-csp-test' });

    assert.ok(webview.html.includes('manual-csp-test'));
    assert.ok(webview.html.includes('未找到匹配的记忆'));
  });

  it('生成的页面应使用 CSP nonce 且不包含内联事件处理器', () => {
    const html = editor.testGetHtml(webview);

    assert.strictEqual(/<script(?![^>]*\bnonce=)/.test(html), false);
    assert.strictEqual(/\son(?:click|change|input|submit|keydown|keyup)\s*=/i.test(html), false);
  });
});
