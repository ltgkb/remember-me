/**
 * Remember Me - SearchSettings 单元测试
 * 验证搜索模式持久化与切换逻辑
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonStorage } from '../../memory/storage';
import { SearchSettingsManager } from '../../utils/searchSettings';

describe('SearchSettingsManager', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let manager: SearchSettingsManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-search-'));
    storage = new JsonStorage({ basePath: tempDir });
    manager = new SearchSettingsManager(storage);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('未初始化时默认返回 keyword 模式', () => {
    const settings = manager.read();
    assert.strictEqual(settings.mode, 'keyword');
  });

  it('setMode 应持久化搜索模式', () => {
    manager.setMode('semantic');
    // 重新构造一个 manager 模拟进程重启
    const reloaded = new SearchSettingsManager(storage);
    assert.strictEqual(reloaded.read().mode, 'semantic');
  });

  it('toggle 应在 keyword、semantic、hybrid 之间循环切换并返回新模式', () => {
    assert.strictEqual(manager.toggle(), 'semantic');
    assert.strictEqual(manager.read().mode, 'semantic');
    assert.strictEqual(manager.toggle(), 'hybrid');
    assert.strictEqual(manager.read().mode, 'hybrid');
    assert.strictEqual(manager.toggle(), 'keyword');
    assert.strictEqual(manager.read().mode, 'keyword');
  });

  it('setSemanticAvailable 应记录可用性且可被读取', () => {
    manager.setSemanticAvailable(true);
    assert.strictEqual(manager.read().semanticAvailable, true);
    manager.setSemanticAvailable(false);
    assert.strictEqual(manager.read().semanticAvailable, false);
  });

  it('setSemanticAvailable 重复设置相同值不应重复写入', () => {
    manager.setSemanticAvailable(true);
    const before = fs.statSync(path.join(tempDir, 'search-settings.json')).mtimeMs;
    // 等待时间戳精度
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        manager.setSemanticAvailable(true);
        const after = fs.statSync(path.join(tempDir, 'search-settings.json')).mtimeMs;
        assert.strictEqual(after, before, '相同值不应触发重复写入');
        resolve();
      }, 20);
    });
  });
});
