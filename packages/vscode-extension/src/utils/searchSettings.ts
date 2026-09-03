/**
 * Remember Me - 搜索设置持久化
 *
 * 单独维护搜索模式（关键词 / 语义），不侵入 Profile 类型。
 * 存储于 ~/.remember-me/search-settings.json。
 */

import type { JsonStorage } from '../memory/storage';
import { getStorage } from '../memory/storage';
import { getLogger } from './logger';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchSettings {
  mode: SearchMode;
  /** 上次语义搜索是否可用（用于 UI 灰显判断） */
  semanticAvailable?: boolean;
}

const FILENAME = 'search-settings.json';

export class SearchSettingsManager {
  private storage: JsonStorage;

  constructor(storage?: JsonStorage) {
    this.storage = storage || getStorage();
  }

  read(): SearchSettings {
    const data = this.storage.read<unknown>(FILENAME);
    if (!data || typeof data !== 'object') {
      return { mode: 'keyword' };
    }
    const candidate = data as Partial<SearchSettings>;
    if (
      candidate.mode !== 'keyword' &&
      candidate.mode !== 'semantic' &&
      candidate.mode !== 'hybrid'
    ) {
      return { mode: 'keyword' };
    }
    const settings: SearchSettings = { mode: candidate.mode };
    if (typeof candidate.semanticAvailable === 'boolean') {
      settings.semanticAvailable = candidate.semanticAvailable;
    }
    return settings;
  }

  setMode(mode: SearchMode): SearchSettings {
    const current = this.read();
    const updated: SearchSettings = { ...current, mode };
    this.storage.write(updated, FILENAME);
    return updated;
  }

  setSemanticAvailable(available: boolean): void {
    const current = this.read();
    if (current.semanticAvailable === available) {
      return;
    }
    this.storage.write({ ...current, semanticAvailable: available }, FILENAME);
    getLogger().info(
      `[RememberMe] 语义搜索可用性: ${available ? '可用' : '不可用'}`
    );
  }

  toggle(): SearchMode {
    const current = this.read();
    const next: SearchMode = current.mode === 'keyword' ? 'semantic' : current.mode === 'semantic' ? 'hybrid' : 'keyword';
    this.setMode(next);
    return next;
  }
}

let instance: SearchSettingsManager | null = null;

export function getSearchSettings(storage?: JsonStorage): SearchSettingsManager {
  if (!instance) {
    instance = new SearchSettingsManager(storage);
  }
  return instance;
}
