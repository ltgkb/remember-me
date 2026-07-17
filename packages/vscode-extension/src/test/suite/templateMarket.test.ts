/**
 * Remember Me - 模板市场单元测试
 * 验证模板导入/导出与共享功能（C1 任务组）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateManager } from '../../template/manager';
import { JsonStorage } from '../../memory/storage';

describe('TemplateManager - 模板市场', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let manager: TemplateManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-test-'));
    storage = new JsonStorage({ basePath: tempDir });
    manager = new TemplateManager(storage);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── validateTemplate ──

  describe('validateTemplate', () => {
    it('应通过有效模板', () => {
      const validTemplate = {
        id: 'test-template',
        name: '测试模板',
        description: '测试描述',
        category: 'prd',
        meta: {
          difficulty: '标准',
          typicalLength: '5-10 页',
        },
        structure: {
          sections: [],
        },
      };
      const errors = manager.validateTemplate(validTemplate);
      assert.deepStrictEqual(errors, []);
    });

    it('缺少 id 字段时应返回错误', () => {
      const invalid = {
        name: '测试模板',
        description: '测试描述',
        category: 'prd',
        meta: {
          difficulty: '标准',
          typicalLength: '5-10 页',
        },
        structure: {
          sections: [],
        },
      };
      const errors = manager.validateTemplate(invalid);
      assert.ok(errors.some(e => e.includes('id')));
    });

    it('缺少 name 字段时应返回错误', () => {
      const invalid = {
        id: 'test-template',
        description: '测试描述',
        category: 'prd',
        meta: {
          difficulty: '标准',
          typicalLength: '5-10 页',
        },
        structure: {
          sections: [],
        },
      };
      const errors = manager.validateTemplate(invalid);
      assert.ok(errors.some(e => e.includes('name')));
    });

    it('category 类型错误时应返回错误', () => {
      const invalid = {
        id: 'test-template',
        name: '测试模板',
        description: '测试描述',
        category: 'invalid-category',
        meta: {
          difficulty: '标准',
          typicalLength: '5-10 页',
        },
        structure: {
          sections: [],
        },
      };
      const errors = manager.validateTemplate(invalid);
      assert.ok(errors.some(e => e.includes('category')));
    });

    it('缺少 sections 时应返回错误', () => {
      const invalid = {
        id: 'test-template',
        name: '测试模板',
        description: '测试描述',
        category: 'prd',
        meta: {
          difficulty: '标准',
          typicalLength: '5-10 页',
        },
        structure: {},
      };
      const errors = manager.validateTemplate(invalid);
      assert.ok(errors.some(e => e.includes('sections')));
    });
  });

  // ── importFromFile ──

  describe('importFromFile', () => {
    it('应成功导入有效模板', () => {
      const importFile = path.join(tempDir, 'import-template.json');
      const template = {
        id: 'unique-imported',
        name: '导入的模板',
        description: '描述',
        category: 'tech',
        version: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        meta: {
          targetAudience: '开发者',
          typicalLength: '5-10 页',
          language: '中文',
          difficulty: '标准',
        },
        structure: {
          preamble: '引导语',
          sections: [
            {
              id: 'sec1',
              title: '章节1',
              description: '描述',
              required: true,
              prompt: '提示',
              memoryFocus: ['profile'],
            },
          ],
        },
        memoryConfig: {
          priority: ['profile'],
          requiredStyleHabits: [],
          projectContextKeys: [],
        },
        tags: ['测试'],
        isBuiltIn: true,
      };
      fs.writeFileSync(importFile, JSON.stringify(template, null, 2), 'utf-8');

      const result = manager.importFromFile(importFile);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.template.name, '导入的模板');
        assert.strictEqual(result.template.isBuiltIn, false);
      }
    });

    it('ID 冲突时应自动重命名', () => {
      // 内置模板 prd-standard 已存在（由 ensureBuiltInTemplates 写入）
      const importFile = path.join(tempDir, 'conflict-template.json');
      const template = {
        id: 'prd-standard',
        name: '冲突模板',
        description: '描述',
        category: 'prd',
        version: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        meta: {
          targetAudience: '产品经理',
          typicalLength: '5-10 页',
          language: '中文',
          difficulty: '标准',
        },
        structure: {
          preamble: '引导语',
          sections: [],
        },
        memoryConfig: {
          priority: ['profile'],
          requiredStyleHabits: [],
          projectContextKeys: [],
        },
        tags: ['测试'],
        isBuiltIn: true,
      };
      fs.writeFileSync(importFile, JSON.stringify(template, null, 2), 'utf-8');

      const result = manager.importFromFile(importFile);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.ok(result.template.id.startsWith('prd-standard-imported-'));
        assert.strictEqual(result.template.isBuiltIn, false);
      }
    });

    it('无效 JSON 应返回错误', () => {
      const importFile = path.join(tempDir, 'bad-json.json');
      fs.writeFileSync(importFile, '{ not json }', 'utf-8');

      const result = manager.importFromFile(importFile);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.errors.length > 0);
      }
    });
  });

  // ── exportToFile ──

  describe('exportToFile', () => {
    it('应成功导出模板', () => {
      const exportFile = path.join(tempDir, 'export-template.json');
      const success = manager.exportToFile('prd-standard', exportFile);
      assert.strictEqual(success, true);
      assert.strictEqual(fs.existsSync(exportFile), true);
    });

    it('导出文件应包含 exportMeta 字段', () => {
      const exportFile = path.join(tempDir, 'export-with-meta.json');
      manager.exportToFile('prd-standard', exportFile);

      const content = fs.readFileSync(exportFile, 'utf-8');
      const data = JSON.parse(content);
      assert.ok(data.exportMeta);
      assert.ok(typeof data.exportMeta.exportedAt === 'string');
      assert.strictEqual(data.exportMeta.exportedBy, 'remember-me-v0.1.0');
    });

    it('模板不存在时应返回 false', () => {
      const exportFile = path.join(tempDir, 'not-found.json');
      const success = manager.exportToFile('non-existent-template', exportFile);
      assert.strictEqual(success, false);
    });
  });

  // ── 端到端 ──

  describe('导入后列表读取', () => {
    it('导入的模板应可被 listAll() 读取', () => {
      const importFile = path.join(tempDir, 'e2e-template.json');
      const template = {
        id: 'e2e-test-template',
        name: '端到端测试模板',
        description: '描述',
        category: 'report',
        version: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        meta: {
          targetAudience: '测试人员',
          typicalLength: '3-5 页',
          language: '中文',
          difficulty: '入门',
        },
        structure: {
          preamble: '引导语',
          sections: [],
        },
        memoryConfig: {
          priority: ['profile'],
          requiredStyleHabits: [],
          projectContextKeys: [],
        },
        tags: ['测试'],
        isBuiltIn: true,
      };
      fs.writeFileSync(importFile, JSON.stringify(template, null, 2), 'utf-8');

      const importResult = manager.importFromFile(importFile);
      assert.strictEqual(importResult.success, true);

      const all = manager.listAll();
      const found = all.find(t => t.id === 'e2e-test-template');
      assert.ok(found);
      if (found) {
        assert.strictEqual(found.name, '端到端测试模板');
        assert.strictEqual(found.isBuiltIn, false);
      }
    });
  });
});
