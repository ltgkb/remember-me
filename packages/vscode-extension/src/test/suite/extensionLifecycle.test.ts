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
});
