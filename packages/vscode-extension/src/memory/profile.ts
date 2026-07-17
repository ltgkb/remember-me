/**
 * Remember Me - 用户画像管理模块
 * 管理全局用户画像和做事风格（~/.remember-me/profile.json）
 */

import type { Profile, IdentityInfo, StyleInfo } from '../types';
import { getLogger } from '../utils/logger';
import { isValidProfile } from '../utils/profileGuard';
import { JsonStorage, getStorage } from './storage';

const PROFILE_FILENAME = 'profile.json';

export class ProfileManager {
  private storage: JsonStorage;

  constructor(storage?: JsonStorage) {
    this.storage = storage || getStorage();
  }

  // ==================== 基础 CRUD ====================

  /**
   * 读取用户画像，如果不存在则返回 null
   */
  read(): Profile | null {
    return this.storage.read<Profile>(PROFILE_FILENAME);
  }

  /**
   * 创建新的用户画像（首次初始化使用）
   */
  create(identity: IdentityInfo, style: StyleInfo): Profile {
    const now = new Date().toISOString();
    const profile: Profile = {
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
      identity,
      style,
    };
    this.storage.write(profile, PROFILE_FILENAME);
    return profile;
  }

  /**
   * 更新用户画像（局部更新，自动备份）
   */
  update(updates: Partial<Omit<Profile, 'id' | 'createdAt'>>): Profile | null {
    const existing = this.read();
    if (!existing) {
      getLogger().warn('[RememberMe] 更新失败：用户画像不存在，请先初始化');
      return null;
    }

    // 先备份
    this.storage.backup(PROFILE_FILENAME);

    const updated: Profile = {
      ...existing,
      ...updates,
      id: existing.id, // 防止意外覆盖
      createdAt: existing.createdAt, // 防止意外覆盖
      updatedAt: new Date().toISOString(),
    };

    // 如果更新中包含 identity 或 style，需要浅合并
    if (updates.identity) {
      updated.identity = { ...existing.identity, ...updates.identity };
    }
    if (updates.style) {
      updated.style = { ...existing.style, ...updates.style };
    }

    const success = this.storage.write(updated, PROFILE_FILENAME);
    return success ? updated : null;
  }

  /**
   * 更新身份信息
   */
  updateIdentity(updates: Partial<IdentityInfo>): Profile | null {
    const existing = this.read();
    if (!existing) {
      return null;
    }
    return this.update({
      identity: { ...existing.identity, ...updates },
    });
  }

  /**
   * 更新做事风格
   */
  updateStyle(updates: Partial<StyleInfo>): Profile | null {
    const existing = this.read();
    if (!existing) {
      return null;
    }
    return this.update({
      style: { ...existing.style, ...updates },
    });
  }

  /**
   * 添加特殊习惯
   */
  addSpecialHabit(habit: string): Profile | null {
    const existing = this.read();
    if (!existing) {
      return null;
    }
    const habits = [...existing.style.specialHabits];
    if (!habits.includes(habit)) {
      habits.push(habit);
      return this.updateStyle({ specialHabits: habits });
    }
    return existing;
  }

  /**
   * 移除特殊习惯
   */
  removeSpecialHabit(habit: string): Profile | null {
    const existing = this.read();
    if (!existing) {
      return null;
    }
    const habits = existing.style.specialHabits.filter(h => h !== habit);
    return this.updateStyle({ specialHabits: habits });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.storage.exists(PROFILE_FILENAME);
  }

  /**
   * 获取初始化建议（首次使用时调用）
   */
  getDefaultProfile(): { identity: IdentityInfo; style: StyleInfo } {
    return {
      identity: {
        role: '产品经理',
        experience: '1-3年',
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
  }

  /**
   * 生成记忆注入 Prompt 所需的【身份】和【做事风格】段落
   */
  buildMemoryPrompt(): string {
    const profile = this.read();
    if (!isValidProfile(profile)) {
      return '';
    }

    const { identity, style } = profile;
    const lines: string[] = [];

    lines.push('【身份】');
    lines.push(`- 角色：${identity.role}`);
    lines.push(`- 经验：${identity.experience}`);
    lines.push(`- 领域：${identity.industry}`);
    lines.push(`- 专业背景：${identity.background}`);
    lines.push('');

    lines.push('【做事风格】');
    lines.push(`- 文档结构：${style.documentStructure}`);
    lines.push(`- 详细程度：${style.detailLevel}`);
    lines.push(`- 语言：${style.language}`);
    lines.push(`- 语气：${style.tone}`);
    lines.push(`- 回复风格：${style.responseStyle}`);
    if (style.specialHabits.length > 0) {
      lines.push(`- 特殊习惯：${style.specialHabits.join('、')}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取状态栏显示的简短信息
   */
  getStatusLabel(): string {
    const profile = this.read();
    if (!isValidProfile(profile)) {
      return '未设置画像';
    }
    const parts: string[] = [];
    if (profile.identity.industry && profile.identity.role) {
      parts.push(`${profile.identity.industry}${profile.identity.role}`);
    } else if (profile.identity.role) {
      parts.push(profile.identity.role);
    }
    if (profile.style.specialHabits.length > 0) {
      parts.push(profile.style.specialHabits[0]);
    }
    return parts.join(' | ') || '已设置画像';
  }

  // ==================== 工具方法 ====================

  private generateId(): string {
    return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// 单例导出
let profileManagerInstance: ProfileManager | null = null;

export function getProfileManager(storage?: JsonStorage): ProfileManager {
  if (!profileManagerInstance) {
    profileManagerInstance = new ProfileManager(storage);
  }
  return profileManagerInstance;
}
