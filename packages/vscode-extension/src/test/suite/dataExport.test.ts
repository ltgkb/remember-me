/**
 * Remember Me - complete user data export tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonStorage } from '../../memory/storage';
import { createMemoryDataExport } from '../../memory/dataExport';

describe('createMemoryDataExport', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-export-test-'));
    storage = new JsonStorage({ basePath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应导出画像、项目、对话、当前项目、搜索设置和自定义模板', () => {
    storage.write({ id: 'profile-1' }, 'profile.json');
    storage.write({ name: 'TeamFlow' }, 'current-project.json');
    storage.write({ mode: 'keyword' }, 'search-settings.json');
    storage.write({ id: 'project-1', name: 'TeamFlow' }, 'projects', 'teamflow', 'context.json');
    storage.write({ id: 'conversation-1' }, 'projects', 'teamflow', 'conversations', 'one.json');
    storage.write({ id: 'custom-1', isBuiltIn: false }, 'user-templates', 'custom-1.json');

    const bundle = createMemoryDataExport(storage, '0.4.0-test', '2026-09-03T00:00:00.000Z');

    assert.strictEqual(bundle.format, 'remember-me-data-export');
    assert.strictEqual(bundle.schemaVersion, 1);
    assert.deepStrictEqual(bundle.data.profile, { id: 'profile-1' });
    assert.deepStrictEqual(bundle.data.activeProject, { name: 'TeamFlow' });
    assert.strictEqual(bundle.data.projects[0].conversations[0].filename, 'one.json');
    assert.strictEqual(bundle.data.userTemplates[0].filename, 'custom-1.json');
  });

  it('不应导出 API 密钥、内置模板、索引或备份', () => {
    storage.write({ apiKey: 'sk-secret-value' }, 'unrelated-settings.json');
    storage.write({ id: 'built-in' }, 'templates', 'built-in.json');
    storage.write({ terms: ['secret-index'] }, '.index', 'search-index.json');
    storage.write({ old: true }, '.backups', 'profile.json.old.json');

    const serialized = JSON.stringify(createMemoryDataExport(storage, '0.4.0-test'));

    assert.ok(!serialized.includes('sk-secret-value'));
    assert.ok(!serialized.includes('built-in'));
    assert.ok(!serialized.includes('secret-index'));
    assert.ok(!serialized.includes('profile.json.old.json'));
  });

  it('损坏 JSON 应记录为跳过路径且不阻断其余导出', () => {
    storage.write({ id: 'profile-1' }, 'profile.json');
    fs.writeFileSync(path.join(tempDir, 'search-settings.json'), '{broken', 'utf8');

    const bundle = createMemoryDataExport(storage, '0.4.0-test');

    assert.deepStrictEqual(bundle.data.profile, { id: 'profile-1' });
    assert.strictEqual(bundle.data.searchSettings, null);
    assert.ok(bundle.skippedPaths.includes('search-settings.json'));
  });
});
