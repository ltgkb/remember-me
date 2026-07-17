/**
 * Remember Me - ProjectManager 单元测试
 * 验证项目上下文管理模块的 CRUD、决策/术语/竞品管理和 Prompt 构建（PRD §2.1.3 项目上下文）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectManager } from '../../memory/project';
import { JsonStorage } from '../../memory/storage';

describe('ProjectManager', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let manager: ProjectManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'remember-me-project-test-')
    );
    storage = new JsonStorage({ basePath: tempDir });
    manager = new ProjectManager(storage);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('项目 CRUD', () => {
    it('create 应创建新项目', () => {
      const project = manager.create('TeamFlow', '企业管理员', '项目管理协作');
      assert.ok(project);
      assert.strictEqual(project!.name, 'TeamFlow');
      assert.strictEqual(project!.targetUsers, '企业管理员');
    });

    it('create 对重复名称应返回已有项目', () => {
      const first = manager.create('TeamFlow', 'A', 'B');
      const second = manager.create('TeamFlow', 'C', 'D');
      assert.strictEqual(second!.id, first!.id);
    });

    it('create 对无效名称应返回 null', () => {
      const project = manager.create('   ', '用户', '功能');
      assert.strictEqual(project, null);
    });

    it('read 应读取已创建的项目', () => {
      manager.create('TeamFlow', '企业管理员', '项目管理协作');
      const read = manager.read('TeamFlow');
      assert.strictEqual(read!.name, 'TeamFlow');
    });

    it('exists 应正确判断项目存在性', () => {
      assert.strictEqual(manager.exists('TeamFlow'), false);
      manager.create('TeamFlow', 'A', 'B');
      assert.strictEqual(manager.exists('TeamFlow'), true);
    });

    it('update 应局部更新项目', () => {
      manager.create('TeamFlow', 'A', 'B');
      const updated = manager.update('TeamFlow', { targetUsers: '中小企业' });
      assert.strictEqual(updated!.targetUsers, '中小企业');
      assert.strictEqual(updated!.coreFeatures, 'B');
    });

    it('delete 应删除项目', () => {
      manager.create('TeamFlow', 'A', 'B');
      assert.strictEqual(manager.exists('TeamFlow'), true);
      manager.delete('TeamFlow');
      assert.strictEqual(manager.exists('TeamFlow'), false);
    });

    it('list 应按更新时间倒序返回项目', async () => {
      manager.create('ProjectA', 'A', 'B');
      await new Promise(r => setTimeout(r, 2));
      manager.create('ProjectB', 'C', 'D');
      const list = manager.list();
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list[0].name, 'ProjectB');
    });
  });

  describe('当前项目管理', () => {
    beforeEach(() => {
      manager.create('TeamFlow', 'A', 'B');
    });

    it('setCurrent 应设置当前项目', () => {
      const success = manager.setCurrent('TeamFlow');
      assert.strictEqual(success, true);
      assert.strictEqual(manager.getCurrentName(), 'TeamFlow');
    });

    it('setCurrent 对不存在的项目应返回 false', () => {
      const success = manager.setCurrent('NotExist');
      assert.strictEqual(success, false);
    });

    it('getCurrent 应返回当前项目上下文', () => {
      manager.setCurrent('TeamFlow');
      const current = manager.getCurrent();
      assert.strictEqual(current!.name, 'TeamFlow');
    });

    it('clearCurrent 应清除当前项目', () => {
      manager.setCurrent('TeamFlow');
      manager.clearCurrent();
      assert.strictEqual(manager.getCurrent(), null);
    });
  });

  describe('决策管理', () => {
    beforeEach(() => {
      manager.create('TeamFlow', 'A', 'B');
    });

    it('addDecision 应添加决策', () => {
      const updated = manager.addDecision(
        'TeamFlow',
        '认证方案',
        '使用 OAuth 2.0',
        '已确定'
      );
      assert.strictEqual(updated!.decisions.length, 1);
      assert.strictEqual(updated!.decisions[0].title, '认证方案');
    });

    it('updateDecisionStatus 应更新决策状态', () => {
      manager.addDecision('TeamFlow', '方案A', '描述', '待确认');
      const decisionId = manager.read('TeamFlow')!.decisions[0].id;
      const updated = manager.updateDecisionStatus(
        'TeamFlow',
        decisionId,
        '已确定'
      );
      assert.strictEqual(updated!.decisions[0].status, '已确定');
    });

    it('removeDecision 应删除决策', () => {
      manager.addDecision('TeamFlow', '临时方案', '描述', '已废弃');
      const decisionId = manager.read('TeamFlow')!.decisions[0].id;
      const updated = manager.removeDecision('TeamFlow', decisionId);
      assert.strictEqual(updated!.decisions.length, 0);
    });
  });

  describe('术语管理', () => {
    beforeEach(() => {
      manager.create('TeamFlow', 'A', 'B');
    });

    it('setTerminology 应添加新术语', () => {
      const updated = manager.setTerminology('TeamFlow', '用户', '企业管理员');
      assert.strictEqual(updated!.terminology.length, 1);
    });

    it('setTerminology 应更新已有术语', () => {
      manager.setTerminology('TeamFlow', '用户', '旧定义');
      const updated = manager.setTerminology('TeamFlow', '用户', '新定义');
      assert.strictEqual(updated!.terminology.length, 1);
      assert.strictEqual(updated!.terminology[0].definition, '新定义');
    });

    it('removeTerminology 应删除术语', () => {
      manager.setTerminology('TeamFlow', '用户', '定义');
      const updated = manager.removeTerminology('TeamFlow', '用户');
      assert.strictEqual(updated!.terminology.length, 0);
    });

    it('findTerm 应查找术语定义', () => {
      manager.setTerminology('TeamFlow', '用户', '企业管理员');
      const term = manager.findTerm('TeamFlow', '用户');
      assert.strictEqual(term!.definition, '企业管理员');
      assert.strictEqual(manager.findTerm('TeamFlow', '不存在'), null);
    });
  });

  describe('竞品管理', () => {
    beforeEach(() => {
      manager.create('TeamFlow', 'A', 'B');
    });

    it('addCompetitor 应添加竞品', () => {
      const updated = manager.addCompetitor('TeamFlow', 'Slack');
      assert.ok(updated!.competitors.includes('Slack'));
    });

    it('addCompetitor 不应重复添加', () => {
      manager.addCompetitor('TeamFlow', 'Slack');
      const beforeCount = manager.read('TeamFlow')!.competitors.length;
      manager.addCompetitor('TeamFlow', 'Slack');
      assert.strictEqual(
        manager.read('TeamFlow')!.competitors.length,
        beforeCount
      );
    });

    it('removeCompetitor 应移除竞品', () => {
      manager.addCompetitor('TeamFlow', 'Slack');
      const updated = manager.removeCompetitor('TeamFlow', 'Slack');
      assert.ok(!updated!.competitors.includes('Slack'));
    });
  });

  describe('Prompt 构建', () => {
    beforeEach(() => {
      manager.create('TeamFlow', '企业管理员', '项目管理协作');
      manager.setCurrent('TeamFlow');
    });

    it('buildMemoryPrompt 应包含项目信息', () => {
      const prompt = manager.buildMemoryPrompt();
      assert.ok(prompt.includes('TeamFlow'));
      assert.ok(prompt.includes('企业管理员'));
    });

    it('buildMemoryPrompt 应包含决策和术语', () => {
      manager.addDecision('TeamFlow', '认证方案', '使用 OAuth 2.0', '已确定');
      manager.setTerminology('TeamFlow', '用户', '企业管理员');
      const prompt = manager.buildMemoryPrompt();
      assert.ok(prompt.includes('OAuth 2.0'));
      assert.ok(prompt.includes('用户 = 企业管理员'));
    });

    it('buildMemoryPrompt 对不存在的项目应返回空字符串', () => {
      const prompt = manager.buildMemoryPrompt('NonExistent');
      assert.strictEqual(prompt, '');
    });
  });
});
