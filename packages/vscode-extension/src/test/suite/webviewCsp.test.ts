/**
 * Webview CSP regression tests.
 * Inline DOM event attributes are blocked by the nonce-only script policy and
 * must not be reintroduced into any Webview template.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Webview CSP compatibility', () => {
  const webviewDir = path.resolve(__dirname, '../../../src/ui/webview');
  const sourceFiles = fs
    .readdirSync(webviewDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(webviewDir, file));

  it('所有 Webview 模板都不应包含内联 DOM 事件处理器', () => {
    const inlineHandler = /\son(?:click|change|input|submit|keydown|keyup)\s*=/i;
    const offenders = sourceFiles.filter((file) => inlineHandler.test(fs.readFileSync(file, 'utf8')));

    assert.deepStrictEqual(
      offenders.map((file) => path.basename(file)),
      [],
      'nonce-only CSP 会阻止内联事件处理器'
    );
  });

  it('Webview 的 script-src 不应放宽为 unsafe-inline', () => {
    const offenders = sourceFiles.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /script-src[^;]*unsafe-inline/i.test(source);
    });

    assert.deepStrictEqual(
      offenders.map((file) => path.basename(file)),
      [],
      '脚本必须继续使用 nonce，不得启用 unsafe-inline'
    );
  });
});
