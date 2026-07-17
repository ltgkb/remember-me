/**
 * Remember Me - JsonStorage 单元测试
 * 验证 JSON 文件存储层的读写、备份、列表等功能（PRD §3.2 存储方案）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonStorage } from '../../memory/storage';

describe('JsonStorage', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-test-'));
    storage = new JsonStorage({ basePath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('构造函数', () => {
    it('应使用自定义 basePath', () => {
      assert.strictEqual(storage.getBasePath(), tempDir);
    });

    it('应自动创建不存在的 basePath', () => {
      const newDir = path.join(tempDir, 'auto-create');
      const s = new JsonStorage({ basePath: newDir });
      assert.strictEqual(fs.existsSync(newDir), true);
      assert.strictEqual(s.getBasePath(), newDir);
    });
  });

  describe('基本读写', () => {
    it('write 后应能 read 到相同数据', () => {
      const data = { name: 'test', value: 42, nested: { a: true } };
      const success = storage.write(data, 'test.json');
      assert.strictEqual(success, true);

      const result = storage.read<typeof data>('test.json');
      assert.deepStrictEqual(result, data);
    });

    it('应支持多级路径读写', () => {
      const data = { level: 'deep' };
      storage.write(data, 'projects', 'teamflow', 'context.json');
      const result = storage.read<typeof data>(
        'projects',
        'teamflow',
        'context.json'
      );
      assert.deepStrictEqual(result, data);
    });

    it('读取不存在的文件应返回 null', () => {
      const result = storage.read('non-existent.json');
      assert.strictEqual(result, null);
    });

    it('读取损坏的 JSON 应返回 null 且不抛异常', () => {
      const filePath = path.join(tempDir, 'corrupt.json');
      fs.writeFileSync(filePath, 'not json {', 'utf-8');
      const result = storage.read('corrupt.json');
      assert.strictEqual(result, null);
    });
  });

  describe('exists & delete', () => {
    it('exists 应正确反映文件存在性', () => {
      assert.strictEqual(storage.exists('new-file.json'), false);
      storage.write({ a: 1 }, 'new-file.json');
      assert.strictEqual(storage.exists('new-file.json'), true);
    });

    it('delete 应删除文件并返回 true', () => {
      storage.write({ a: 1 }, 'to-delete.json');
      assert.strictEqual(storage.exists('to-delete.json'), true);
      const success = storage.delete('to-delete.json');
      assert.strictEqual(success, true);
      assert.strictEqual(storage.exists('to-delete.json'), false);
    });

    it('删除不存在的文件应返回 true（幂等）', () => {
      const success = storage.delete('never-existed.json');
      assert.strictEqual(success, true);
    });

    it('delete 应递归删除目录及其内容', () => {
      // 构造一个含子目录与文件的目录结构
      storage.write({ a: 1 }, 'proj', 'conversations', 'c1.json');
      storage.write({ a: 2 }, 'proj', 'context.json');
      const dirPath = path.join(tempDir, 'proj');
      assert.strictEqual(fs.existsSync(dirPath), true);

      const success = storage.delete('proj');
      assert.strictEqual(success, true);
      assert.strictEqual(fs.existsSync(dirPath), false);
    });

    it('delete 对不存在路径应返回 true（目录幂等）', () => {
      const success = storage.delete('totally-missing-dir');
      assert.strictEqual(success, true);
    });
  });

  describe('merge', () => {
    it('merge 应合并现有数据', () => {
      storage.write({ a: 1, b: 2 }, 'merge-test.json');
      const result = storage.merge({ b: 3, c: 4 }, 'merge-test.json');
      assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
    });

    it('merge 不存在的文件应创建新文件', () => {
      const result = storage.merge({ x: 'hello' }, 'new-merge.json');
      assert.deepStrictEqual(result, { x: 'hello' });
    });
  });

  describe('目录列表', () => {
    it('listDir 应返回目录中的文件列表', () => {
      storage.write({ a: 1 }, 'dir1', 'file1.json');
      storage.write({ a: 2 }, 'dir1', 'file2.json');
      const list = storage.listDir('dir1');
      assert.ok(list.includes('file1.json'));
      assert.ok(list.includes('file2.json'));
    });

    it('listDir 对不存在的目录应返回空数组', () => {
      const list = storage.listDir('non-existent-dir');
      assert.deepStrictEqual(list, []);
    });

    it('readAllInDir 应读取所有 JSON 文件', () => {
      storage.write({ id: '1' }, 'dir2', 'a.json');
      storage.write({ id: '2' }, 'dir2', 'b.json');
      const all = storage.readAllInDir<{ id: string }>('dir2');
      assert.strictEqual(all.length, 2);
      assert.ok(
        all.some((item) => item.name === 'a' && item.data.id === '1')
      );
      assert.ok(
        all.some((item) => item.name === 'b' && item.data.id === '2')
      );
    });

    it('readAllInDir 应跳过非 JSON 文件和无法解析的文件', () => {
      fs.mkdirSync(path.join(tempDir, 'dir3'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'dir3', 'readme.txt'),
        'text',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tempDir, 'dir3', 'bad.json'),
        'bad',
        'utf-8'
      );
      const all = storage.readAllInDir('dir3');
      assert.strictEqual(all.length, 0);
    });
  });

  describe('备份功能', () => {
    it('backup 应创建带时间戳的备份文件', () => {
      storage.write({ version: 1 }, 'backup-test.json');
      const success = storage.backup('backup-test.json');
      assert.strictEqual(success, true);

      const backupDir = path.join(tempDir, '.backups');
      assert.strictEqual(fs.existsSync(backupDir), true);

      const backups = fs.readdirSync(backupDir);
      assert.ok(backups.length > 0);
      assert.ok(backups[0].startsWith('backup-test.json'));
    });

    it('backup 对不存在的文件应返回 false', () => {
      const success = storage.backup('no-file.json');
      assert.strictEqual(success, false);
    });

    it('应自动清理旧备份，只保留最近 20 个', () => {
      storage.write({ data: 'x' }, 'cleanup-test.json');
      for (let i = 0; i < 25; i++) {
        storage.backup('cleanup-test.json');
      }
      const backupDir = path.join(tempDir, '.backups');
      const backups = fs.readdirSync(backupDir);
      assert.ok(
        backups.length <= 20,
        `备份数量 ${backups.length} 应 <= 20`
      );
    });
  });
});
