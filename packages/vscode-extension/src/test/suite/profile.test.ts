/**
 * Remember Me - ProfileManager 单元测试
 * 验证用户画像管理模块的 CRUD、备份和 Prompt 构建功能（PRD §2.1.1 个人画像）
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProfileManager } from '../../memory/profile';
import { JsonStorage } from '../../memory/storage';
import type { IdentityInfo, StyleInfo } from '../../types';

describe('ProfileManager', () => {
  let tempDir: string;
  let storage: JsonStorage;
  let manager: ProfileManager;

  const sampleIdentity: IdentityInfo = {
    role: '产品经理',
    experience: '3-5年',
    industry: 'SaaS',
    background: '技术',
  };

  const sampleStyle: StyleInfo = {
    documentStructure: '先背景后功能',
    detailLevel: '标准（3-5页）',
    language: '中文',
    tone: '正式',
    specialHabits: ['MoSCoW优先级', '用户旅程图'],
    responseStyle: '先框架再细节',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'remember-me-profile-test-')
    );
    storage = new JsonStorage({ basePath: tempDir });
    manager = new ProfileManager(storage);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('初始化与创建', () => {
    it('isInitialized 在创建前应返回 false', () => {
      assert.strictEqual(manager.isInitialized(), false);
    });

    it('isInitialized 在创建后应返回 true', () => {
      manager.create(sampleIdentity, sampleStyle);
      assert.strictEqual(manager.isInitialized(), true);
    });

    it('create 应创建包含正确字段的 Profile', () => {
      const profile = manager.create(sampleIdentity, sampleStyle);
      assert.ok(profile.id.startsWith('profile_'));
      assert.ok(profile.createdAt);
      assert.ok(profile.updatedAt);
      assert.deepStrictEqual(profile.identity, sampleIdentity);
      assert.deepStrictEqual(profile.style, sampleStyle);
    });
  });

  describe('读取', () => {
    it('read 应返回已创建的画像', () => {
      const created = manager.create(sampleIdentity, sampleStyle);
      const read = manager.read();
      assert.deepStrictEqual(read, created);
    });

    it('read 在未初始化时应返回 null', () => {
      assert.strictEqual(manager.read(), null);
    });
  });

  describe('更新', () => {
    beforeEach(() => {
      manager.create(sampleIdentity, sampleStyle);
    });

    it('update 应局部更新字段并更新 updatedAt', () => {
      const before = manager.read()!;
      const updated = manager.update({
        identity: { role: '设计师', experience: '3-5年', industry: 'SaaS', background: '技术' },
      } as any);
      assert.ok(updated);
      assert.strictEqual(updated!.identity.role, '设计师');
      assert.strictEqual(
        updated!.identity.experience,
        before.identity.experience
      );
      assert.notStrictEqual(updated!.updatedAt, before.updatedAt);
    });

    it('update 不应覆盖 id 和 createdAt', () => {
      const before = manager.read()!;
      const updated = manager.update({
        id: 'hacked',
        createdAt: '2000-01-01',
      } as any);
      assert.strictEqual(updated!.id, before.id);
      assert.strictEqual(updated!.createdAt, before.createdAt);
    });

    it('update 应对 identity 和 style 进行浅合并', () => {
      manager.update({ identity: { role: '运营', experience: '3-5年', industry: 'SaaS', background: '技术' } });
      const profile = manager.read()!;
      assert.strictEqual(profile.identity.role, '运营');
      assert.strictEqual(profile.identity.industry, 'SaaS');
    });

    it('update 对不存在的画像应返回 null', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      const freshDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'remember-me-fresh-')
      );
      const freshStorage = new JsonStorage({ basePath: freshDir });
      const freshManager = new ProfileManager(freshStorage);
      assert.strictEqual(freshManager.update({}), null);
      fs.rmSync(freshDir, { recursive: true, force: true });
    });
  });

  describe('习惯管理', () => {
    beforeEach(() => {
      manager.create(sampleIdentity, sampleStyle);
    });

    it('addSpecialHabit 应添加新习惯', () => {
      const updated = manager.addSpecialHabit('竞品对比');
      assert.ok(updated!.style.specialHabits.includes('竞品对比'));
    });

    it('addSpecialHabit 不应重复添加', () => {
      manager.addSpecialHabit('竞品对比');
      const beforeCount = manager.read()!.style.specialHabits.length;
      manager.addSpecialHabit('竞品对比');
      assert.strictEqual(
        manager.read()!.style.specialHabits.length,
        beforeCount
      );
    });

    it('removeSpecialHabit 应移除习惯', () => {
      manager.removeSpecialHabit('MoSCoW优先级');
      assert.ok(
        !manager.read()!.style.specialHabits.includes('MoSCoW优先级')
      );
    });
  });

  describe('Prompt 构建', () => {
    beforeEach(() => {
      manager.create(sampleIdentity, sampleStyle);
    });

    it('buildMemoryPrompt 应包含身份和风格信息', () => {
      const prompt = manager.buildMemoryPrompt();
      assert.ok(prompt.includes('【身份】'));
      assert.ok(prompt.includes('产品经理'));
      assert.ok(prompt.includes('【做事风格】'));
      assert.ok(prompt.includes('MoSCoW优先级'));
    });

    it('buildMemoryPrompt 在未初始化时应返回空字符串', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      const freshDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'remember-me-empty-')
      );
      const freshStorage = new JsonStorage({ basePath: freshDir });
      const freshManager = new ProfileManager(freshStorage);
      assert.strictEqual(freshManager.buildMemoryPrompt(), '');
      fs.rmSync(freshDir, { recursive: true, force: true });
    });

    it('getStatusLabel 应返回简洁的身份描述', () => {
      const label = manager.getStatusLabel();
      assert.ok(label.includes('SaaS'));
      assert.ok(label.includes('产品经理'));
    });
  });

  describe('默认值', () => {
    it('getDefaultProfile 应返回合法的结构', () => {
      const defaults = manager.getDefaultProfile();
      assert.ok(
        [
          '产品经理',
          '运营',
          '设计师',
          '学生',
          '创业者',
          '管理者',
          '其他',
        ].includes(defaults.identity.role)
      );
      assert.ok(Array.isArray(defaults.style.specialHabits));
    });
  });
});
