/**
 * Remember Me - SearchIndex 持久化单元测试（B1）
 * 验证 save / load / clearPersisted 及与搜索功能的集成
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonStorage } from '../../memory/storage';
import {
  SearchIndex,
  getSearchIndex,
} from '../../utils/searchIndex';

describe('SearchIndex Persistence', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-search-persist-test-'));
    storage = new JsonStorage({ basePath: tempDir });
    SearchIndex.resetInstance();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    SearchIndex.resetInstance();
  });

  // ==================== save() ====================

  it('save() 成功创建索引文件', () => {
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');
    const idx = getSearchIndex();
    idx.rebuild(storage);

    const result = idx.save(tempDir);
    assert.strictEqual(result, true);

    const indexPath = path.join(tempDir, '.index', 'search-index.json');
    assert.ok(fs.existsSync(indexPath), '索引文件应存在');

    const content = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(content);
    assert.strictEqual(data.version, '1.0.0');
    assert.ok(data.updatedAt);
    assert.strictEqual(data.totalDocuments, 1);
    assert.ok(data.index);
    assert.ok(data.docFreq);
  });

  // ==================== load() ====================

  it('load() 成功恢复索引', () => {
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');
    const idx = getSearchIndex();
    idx.rebuild(storage);
    idx.save(tempDir);

    SearchIndex.resetInstance();
    const idx2 = getSearchIndex();
    const loaded = idx2.load(tempDir);

    assert.strictEqual(loaded, true);
    assert.strictEqual(idx2.isReady(), true);
    assert.strictEqual(idx2.getStats().totalDocuments, 1);

    const results = idx2.search('产品经理');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.path === 'profile.json'));
  });

  it('load() 版本不匹配时返回 false', () => {
    const indexDir = path.join(tempDir, '.index');
    fs.mkdirSync(indexDir, { recursive: true });
    const indexPath = path.join(indexDir, 'search-index.json');

    const badData = {
      version: '0.9.0',
      updatedAt: new Date().toISOString(),
      totalDocuments: 1,
      index: {},
      docFreq: {},
    };
    fs.writeFileSync(indexPath, JSON.stringify(badData, null, 2), 'utf-8');

    const idx = getSearchIndex();
    const loaded = idx.load(tempDir);
    assert.strictEqual(loaded, false);
    assert.strictEqual(idx.isReady(), false);
  });

  it('load() 索引过期时返回 false（源文件 mtime 晚于 updatedAt）', () => {
    // 1. 创建源文件
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');

    // 2. 构建并保存索引
    const idx = getSearchIndex();
    idx.rebuild(storage);
    idx.save(tempDir);

    // 3. 等待一小段时间确保 mtime 不同
    const now = Date.now();
    while (Date.now() - now < 50) { /* busy wait */ }

    // 4. 修改源文件，使其 mtime 更新
    storage.write({ identity: { role: '工程师' } }, 'profile.json');

    // 5. 尝试加载，应因 mtime 过期而失败
    SearchIndex.resetInstance();
    const idx2 = getSearchIndex();
    const loaded = idx2.load(tempDir);

    assert.strictEqual(loaded, false);
    assert.strictEqual(idx2.isReady(), false);
  });

  it('load() 文件不存在时返回 false', () => {
    const idx = getSearchIndex();
    const loaded = idx.load(tempDir);
    assert.strictEqual(loaded, false);
    assert.strictEqual(idx.isReady(), false);
  });

  // ==================== clearPersisted() ====================

  it('clearPersisted() 删除索引文件', () => {
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');
    const idx = getSearchIndex();
    idx.rebuild(storage);
    idx.save(tempDir);

    const indexPath = path.join(tempDir, '.index', 'search-index.json');
    assert.ok(fs.existsSync(indexPath));

    idx.clearPersisted(tempDir);
    assert.ok(!fs.existsSync(indexPath), '索引文件应被删除');
  });

  // ==================== 保存和加载后搜索功能正常 ====================

  it('保存和加载后搜索功能正常', () => {
    storage.write(
      {
        id: 'c1',
        title: '权限管理设计',
        messages: [{ role: 'user', content: 'RBAC 权限模型', timestamp: '' }],
        keyDecisions: [],
        insights: [],
        tags: [],
      },
      'projects', 'teamflow', 'conversations', 'c1.json'
    );
    storage.write(
      { name: 'TeamFlow', targetUsers: '开发者', coreFeatures: '权限管理' },
      'projects', 'teamflow', 'context.json'
    );

    const idx = getSearchIndex();
    idx.rebuild(storage);
    const beforeSave = idx.search('权限');
    assert.ok(beforeSave.length >= 2);

    idx.save(tempDir);

    SearchIndex.resetInstance();
    const idx2 = getSearchIndex();
    const loaded = idx2.load(tempDir);
    assert.strictEqual(loaded, true);

    const afterLoad = idx2.search('权限');
    assert.strictEqual(afterLoad.length, beforeSave.length);
    for (let i = 0; i < beforeSave.length; i++) {
      assert.strictEqual(afterLoad[i].path, beforeSave[i].path);
      assert.strictEqual(afterLoad[i].score, beforeSave[i].score);
    }
  });

  // ==================== 加载过期索引后重建流程正确 ====================

  it('加载过期索引后重建流程正确', () => {
    // 初始数据
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');

    // 第一次构建并保存
    const idx = getSearchIndex();
    idx.rebuild(storage);
    idx.save(tempDir);

    assert.ok(idx.search('产品经理').length > 0);

    // 等待确保 mtime 不同
    const now = Date.now();
    while (Date.now() - now < 50) { /* busy wait */ }

    // 更新数据
    storage.write({ identity: { role: '架构师' } }, 'profile.json');

    // 模拟重启：新实例尝试加载，应失败并重建
    SearchIndex.resetInstance();
    const idx2 = getSearchIndex();

    // load 应因过期而失败
    const loaded = idx2.load(tempDir);
    assert.strictEqual(loaded, false);

    // 重建
    idx2.rebuild(storage);
    idx2.save(tempDir);

    // 应能搜索到新数据
    assert.strictEqual(idx2.search('产品经理').length, 0);
    assert.ok(idx2.search('架构师').length > 0);
  });

  // ==================== clear() 同时清理持久化文件 ====================

  it('clear() 同时清理持久化文件', () => {
    storage.write({ identity: { role: '产品经理' } }, 'profile.json');
    const idx = getSearchIndex();
    idx.rebuild(storage);
    idx.save(tempDir);

    const indexPath = path.join(tempDir, '.index', 'search-index.json');
    assert.ok(fs.existsSync(indexPath));

    idx.clear();
    assert.ok(!fs.existsSync(indexPath), 'clear() 应删除持久化索引文件');
    assert.strictEqual(idx.getStats().totalDocuments, 0);
    assert.strictEqual(idx.getStats().totalKeywords, 0);
  });
});
