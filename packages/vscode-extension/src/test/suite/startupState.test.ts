/**
 * Remember Me - startup status hydration tests
 */

import * as assert from 'assert';
import type { Profile, ProjectContext } from '../../types';
import { createStartupStatusState } from '../../utils/startupState';

const profile: Profile = {
  id: 'profile-test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  identity: {
    role: '产品经理',
    experience: '3-5年',
    industry: 'SaaS',
    background: '技术',
  },
  style: {
    documentStructure: '先背景后功能',
    detailLevel: '标准（3-5页）',
    language: '中文',
    tone: '正式',
    specialHabits: [],
    responseStyle: '先框架再细节',
  },
};

const project: ProjectContext = {
  id: 'project-test',
  name: 'TeamFlow',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  targetUsers: '团队',
  coreFeatures: '协作',
  decisions: [],
  terminology: [],
  competitors: [],
};

describe('createStartupStatusState', () => {
  it('应恢复有效画像、当前项目和搜索模式', () => {
    const state = createStartupStatusState(profile, project, 'hybrid');

    assert.strictEqual(state.profile, profile);
    assert.strictEqual(state.currentProject, project);
    assert.strictEqual(state.isMemoryActive, true);
    assert.strictEqual(state.searchMode, 'hybrid');
  });

  it('无效画像不应让状态栏显示为已激活', () => {
    const invalidProfile = {
      ...profile,
      identity: { ...profile.identity, role: '' },
    } as unknown as Profile;
    const state = createStartupStatusState(invalidProfile, project, 'keyword');

    assert.strictEqual(state.profile, null);
    assert.strictEqual(state.isMemoryActive, false);
    assert.strictEqual(state.currentProject, project);
  });
});
