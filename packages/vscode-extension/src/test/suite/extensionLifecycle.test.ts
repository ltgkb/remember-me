/**
 * Remember Me - extension lifecycle regression tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Extension lifecycle wiring', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../src/extension.ts'),
    'utf8'
  );

  it('TreeDataProvider 注册结果应交给 ExtensionContext 统一释放', () => {
    assert.match(
      source,
      /context\.subscriptions\.push\(\s*vscode\.window\.registerTreeDataProvider\(/,
      'registerTreeDataProvider 返回的 Disposable 必须加入 context.subscriptions'
    );
  });

  it('文档保存监听器应由单一生命周期包装器释放', () => {
    assert.doesNotMatch(
      source,
      /context\.subscriptions\.push\(docSaveDisposable\)/,
      '每次对话都追加监听器会让 subscriptions 无界增长'
    );
    assert.match(
      source,
      /context\.subscriptions\.push\(\{\s*dispose:\s*\(\)\s*=>\s*\{\s*docSaveDisposable\?\.dispose\(\);\s*docSaveDisposable\s*=\s*undefined;/,
      '应只注册一个始终释放当前监听器的生命周期包装器'
    );
  });
});
