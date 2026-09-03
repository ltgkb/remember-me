import * as assert from 'assert';
import type { Profile } from '../../types';
import { getRoleLabel, isValidProfile } from '../../utils/profileGuard';

const validProfile: Profile = {
  id: 'profile-1',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  identity: {
    role: '产品经理',
    experience: '5年以上',
    industry: 'SaaS',
    background: '技术',
  },
  style: {
    documentStructure: '先背景后功能',
    detailLevel: '标准（3-5页）',
    language: '中文',
    tone: '正式',
    specialHabits: ['先给结论'],
    responseStyle: '先框架再细节',
  },
};

describe('profileGuard', () => {
  it('接受完整且值域合法的画像', () => {
    assert.strictEqual(isValidProfile(validProfile), true);
    assert.strictEqual(getRoleLabel(validProfile), '产品经理');
  });

  it('拒绝来自手改 JSON 的未知枚举值', () => {
    const invalid = {
      ...validProfile,
      identity: { ...validProfile.identity, role: '超级管理员' },
    };

    assert.strictEqual(isValidProfile(invalid), false);
    assert.strictEqual(getRoleLabel(invalid), '未设置');
  });

  it('拒绝缺少元数据或包含非字符串习惯的画像', () => {
    const missingId = { ...validProfile, id: '' };
    const invalidHabits = {
      ...validProfile,
      style: { ...validProfile.style, specialHabits: ['有效', 42] },
    };

    assert.strictEqual(isValidProfile(missingId), false);
    assert.strictEqual(isValidProfile(invalidHabits), false);
  });
});
