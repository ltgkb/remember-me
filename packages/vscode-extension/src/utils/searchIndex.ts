/**
 * Remember Me - SearchIndex 搜索索引优化模块（B2）
 *
 * 实现内存倒排索引，将对话搜索从全量 JSON 遍历 O(N) 优化到 O(1) 关键词查找。
 * 索引范围覆盖：profile.json、项目上下文、对话历史。
 *
 * @module searchIndex
 */

import * as fs from 'fs';
import * as path from 'path';
import type { JsonStorage } from '../memory/storage';
import { getLogger } from './logger';

// ==================== 类型定义 ====================

/**
 * 单条搜索结果
 */
export interface SearchIndexResult {
  /** 相对于 storage basePath 的文件路径 */
  path: string;
  /** 匹配度评分（关键词在该文件中出现次数之和） */
  score: number;
}

/**
 * 索引统计信息
 */
export interface SearchIndexStats {
  /** 索引中唯一关键词数量 */
  totalKeywords: number;
  /** 索引中已建立索引的文件数量 */
  totalDocuments: number;
  /** 索引是否已完成至少一次全量构建 */
  isReady: boolean;
}

/**
 * 索引更新事件类型
 */
export type IndexUpdateType = 'rebuild' | 'update' | 'remove';

/**
 * 索引更新事件回调
 */
export type IndexUpdateCallback = (type: IndexUpdateType, path: string) => void;

// ==================== 分词工具 ====================

/**
 * 轻量分词：按空格/标点/中文字符切分，全部转小写。
 *
 * - 中文字符：逐字切分，每个汉字作为一个 token
 * - 英文/数字：连续字母数字序列作为一个 token，过滤纯数字
 * - 全部转小写
 *
 * @param text - 原始文本
 * @returns token 数组（保留重复，用于频率统计）
 */
export function tokenize(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lower = text.toLowerCase();
  const tokens: string[] = [];
  let i = 0;

  while (i < lower.length) {
    const ch = lower.charCodeAt(i);

    // 中文字符范围 \u4e00-\u9fa5
    if (ch >= 0x4e00 && ch <= 0x9fa5) {
      tokens.push(lower[i]);
      i++;
      continue;
    }

    // 英文字母
    if ((ch >= 0x61 && ch <= 0x7a)) {
      let j = i + 1;
      while (j < lower.length) {
        const nextCh = lower.charCodeAt(j);
        if (nextCh >= 0x61 && nextCh <= 0x7a) {
          j++;
        } else if (nextCh >= 0x30 && nextCh <= 0x39) {
          j++;
        } else {
          break;
        }
      }
      const word = lower.slice(i, j);
      if (word.length >= 2) {
        tokens.push(word);
      }
      i = j;
      continue;
    }

    // 数字开头：跳过纯数字，但保留英文+数字混合
    if (ch >= 0x30 && ch <= 0x39) {
      let j = i + 1;
      let hasAlpha = false;
      while (j < lower.length) {
        const nextCh = lower.charCodeAt(j);
        if (nextCh >= 0x30 && nextCh <= 0x39) {
          j++;
        } else if (nextCh >= 0x61 && nextCh <= 0x7a) {
          hasAlpha = true;
          j++;
        } else {
          break;
        }
      }
      const word = lower.slice(i, j);
      if (hasAlpha && word.length >= 2) {
        tokens.push(word);
      }
      i = j;
      continue;
    }

    // 其他字符视为分隔符
    i++;
  }

  return tokens;
}

/**
 * 递归从任意 JSON 值中提取所有可索引文本
 *
 * @param value - JSON 值
 * @returns 拼接后的纯文本
 */
export function extractTextFromJson(value: unknown): string {
  const parts: string[] = [];

  function walk(v: unknown): void {
    if (v === null || v === undefined) {
      return;
    }
    if (typeof v === 'string') {
      parts.push(v);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v));
    } else if (Array.isArray(v)) {
      for (const item of v) {
        walk(item);
      }
    } else if (typeof v === 'object') {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        // 同时索引键名（如字段名也可能被搜索）
        parts.push(key);
        walk((v as Record<string, unknown>)[key]);
      }
    }
  }

  walk(value);
  return parts.join(' ');
}

// ==================== 索引类 ====================

/**
 * 内存倒排索引管理器（单例模式）
 *
 * 将关键词映射到文件路径集合，实现 O(1) 关键词查找。
 * 内部同时维护每个文档的词频信息，用于搜索结果排序。
 */
export class SearchIndex {
  private static instance: SearchIndex | null = null;

  /** 倒排索引：关键词 → 文件路径集合 */
  private index: Map<string, Set<string>> = new Map();

  /**
   * 文档词频：文件路径 → (关键词 → 出现次数)
   * 用于计算搜索匹配度评分
   */
  private docFreq: Map<string, Map<string, number>> = new Map();

  /** 索引更新回调列表 */
  private callbacks: IndexUpdateCallback[] = [];

  /** 是否已完成过至少一次全量重建 */
  private ready = false;

  /** 持久化索引的 basePath，用于 clear() 时清理磁盘 */
  private persistedBasePath: string | null = null;

  /**
   * 私有构造函数，禁止外部直接实例化
   */
  private constructor() {}

  /**
   * 获取 SearchIndex 单例实例
   *
   * @returns SearchIndex 实例
   */
  static getInstance(): SearchIndex {
    if (!SearchIndex.instance) {
      SearchIndex.instance = new SearchIndex();
    }
    return SearchIndex.instance;
  }

  /**
   * 重置单例（主要用于单元测试）
   * 注意：不清除磁盘上的持久化文件，仅清空内存状态
   */
  static resetInstance(): void {
    if (SearchIndex.instance) {
      SearchIndex.instance.index.clear();
      SearchIndex.instance.docFreq.clear();
      SearchIndex.instance.ready = false;
      SearchIndex.instance.persistedBasePath = null;
    }
    SearchIndex.instance = null;
  }

  // ==================== 索引构建 ====================

  /**
   * 全量重建索引。
   *
   * 扫描所有目标文件（profile.json、项目上下文、对话历史），
   * 清空现有索引后重新构建。建议在插件激活时调用一次。
   *
   * @param storage - JsonStorage 实例，用于读取文件
   * @returns 成功索引的文件数量
   */
  rebuild(storage: JsonStorage): number {
    this.clear();
    const basePath = storage.getBasePath();
    let count = 0;

    const files = this.discoverIndexableFiles(basePath);
    for (const relativePath of files) {
      try {
        if (this.indexFile(storage, relativePath)) {
          count++;
        }
      } catch (error) {
        getLogger().warn(`[SearchIndex] 索引文件失败: ${relativePath}`, error);
      }
    }

    this.ready = true;
    this.notify('rebuild', '*');
    getLogger().info(`[SearchIndex] 全量重建完成: ${count} 个文件, ${this.index.size} 个关键词`);
    return count;
  }

  /**
   * 增量更新单个文件。
   *
   * 先移除该文件在现有索引中的条目，再重新索引。
   * 适用于 storage.write() 后的即时更新。
   *
   * @param storage - JsonStorage 实例
   * @param relativePath - 相对于 storage basePath 的文件路径
   * @returns 是否成功
   */
  update(storage: JsonStorage, relativePath: string): boolean {
    if (!this.isIndexablePath(relativePath)) {
      return false;
    }

    this.removeFromIndex(relativePath);

    try {
      const success = this.indexFile(storage, relativePath);
      if (success) {
        this.notify('update', relativePath);
      }
      return success;
    } catch (error) {
      getLogger().warn(`[SearchIndex] 增量更新失败: ${relativePath}`, error);
      return false;
    }
  }

  /**
   * 从索引中移除单个文件。
   *
   * 适用于文件被删除后的索引清理。
   *
   * @param relativePath - 相对于 storage basePath 的文件路径
   */
  remove(relativePath: string): void {
    this.removeFromIndex(relativePath);
    this.notify('remove', relativePath);
  }

  // ==================== 搜索接口 ====================

  /**
   * 关键词搜索。
   *
   * 支持多关键词（空格分隔），返回包含所有关键词的文件交集。
   * 结果按匹配度评分降序排列，评分 = 各关键词在文件中词频之和。
   *
   * @param keyword - 搜索关键词，多个词用空格分隔
   * @returns 搜索结果数组，按 score 降序
   *
   * @example
   * ```ts
   * const results = index.search('权限 设计');
   * // => [{ path: 'projects/teamflow/conversations/xxx.json', score: 5 }, ...]
   * ```
   */
  search(keyword: string): SearchIndexResult[] {
    if (!keyword || !this.ready) {
      return [];
    }

    const keywords = tokenize(keyword);
    if (keywords.length === 0) {
      return [];
    }

    // 去重关键词（同一词多次出现不增加权重）
    const uniqueKeywords = [...new Set(keywords)];

    // 取交集：找到包含所有关键词的文件
    let candidatePaths: Set<string> | null = null;
    for (const kw of uniqueKeywords) {
      const paths = this.index.get(kw);
      if (!paths || paths.size === 0) {
        return []; // 任一关键词无命中，直接返回空
      }
      if (candidatePaths === null) {
        candidatePaths = new Set(paths);
      } else {
        // 交集
        for (const p of candidatePaths) {
          if (!paths.has(p)) {
            candidatePaths.delete(p);
          }
        }
      }
      if (candidatePaths.size === 0) {
        return [];
      }
    }

    if (!candidatePaths || candidatePaths.size === 0) {
      return [];
    }

    // 计算评分并排序
    const results: SearchIndexResult[] = [];
    for (const docPath of candidatePaths) {
      const freqMap = this.docFreq.get(docPath);
      let score = 0;
      if (freqMap) {
        for (const kw of uniqueKeywords) {
          score += freqMap.get(kw) || 0;
        }
      }
      results.push({ path: docPath, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * 获取索引统计信息
   *
   * @returns 索引统计对象
   */
  getStats(): SearchIndexStats {
    return {
      totalKeywords: this.index.size,
      totalDocuments: this.docFreq.size,
      isReady: this.ready,
    };
  }

  /**
   * 索引是否已完成至少一次全量构建
   *
   * @returns true 表示已就绪
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * 清空所有索引数据（但不重置 ready 状态）。
   * 若之前已设置 persistedBasePath，会同时删除持久化文件。
   */
  clear(): void {
    this.index.clear();
    this.docFreq.clear();
    if (this.persistedBasePath) {
      this.clearPersisted(this.persistedBasePath);
      this.persistedBasePath = null;
    }
  }

  // ==================== 持久化接口 ====================

  /**
   * 将当前索引序列化为 JSON 保存到磁盘。
   *
   * @param basePath - storage 根目录
   * @returns 成功返回 true，失败返回 false 并记录日志
   */
  save(basePath: string): boolean {
    const indexDir = path.join(basePath, '.index');
    const indexPath = path.join(indexDir, 'search-index.json');

    try {
      if (!fs.existsSync(indexDir)) {
        fs.mkdirSync(indexDir, { recursive: true });
      }

      // Map/Set → 普通对象/数组
      const indexObj: Record<string, string[]> = {};
      for (const [token, paths] of this.index) {
        indexObj[token] = [...paths];
      }

      const docFreqObj: Record<string, Record<string, number>> = {};
      for (const [docPath, freqMap] of this.docFreq) {
        const freqObj: Record<string, number> = {};
        for (const [token, count] of freqMap) {
          freqObj[token] = count;
        }
        docFreqObj[docPath] = freqObj;
      }

      // updatedAt 单调性保证（与 7c6bd3b 对 profile.ts 的修复同款范式）：
      // load() 以「源文件 mtime > updatedAt」判定索引过期，而 fs 的 mtimeMs
      // 带亚毫秒浮点精度、toISOString() 只保留整数毫秒。Windows CI 上
      // 「源文件先写入、save() 后执行」时仍可能出现 mtime(浮点) 微大于
      // updatedAt(毫秒截断) 的边界，导致 load() 误判过期（测试 flaky）。
      // 因此 updatedAt 取 max(当前时间, 最晚源文件 mtime 向上取整)，
      // 保证 updatedAt 不早于任何已索引源文件的实际修改时间。
      let maxSourceMtimeMs = 0;
      for (const relativePath of this.discoverIndexableFiles(basePath)) {
        try {
          const mtimeMs = fs.statSync(path.join(basePath, relativePath)).mtimeMs;
          if (mtimeMs > maxSourceMtimeMs) {
            maxSourceMtimeMs = mtimeMs;
          }
        } catch {
          // 忽略 stat 失败的文件（与 load() 中 existsSync 检查语义一致）
        }
      }
      const updatedAtMs = Math.max(Date.now(), Math.ceil(maxSourceMtimeMs));

      const data = {
        version: '1.0.0',
        updatedAt: new Date(updatedAtMs).toISOString(),
        totalDocuments: this.docFreq.size,
        index: indexObj,
        docFreq: docFreqObj,
      };

      fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
      this.persistedBasePath = basePath;
      getLogger().info(`[SearchIndex] 索引已持久化: ${indexPath}`);
      return true;
    } catch (error) {
      getLogger().warn('[SearchIndex] 持久化索引失败', error);
      return false;
    }
  }

  /**
   * 从磁盘恢复索引。
   *
   * @param basePath - storage 根目录
   * @returns 成功返回 true，失败返回 false 并记录日志
   */
  load(basePath: string): boolean {
    const indexPath = path.join(basePath, '.index', 'search-index.json');

    try {
      if (!fs.existsSync(indexPath)) {
        getLogger().info(`[SearchIndex] 持久化索引文件不存在: ${indexPath}`);
        return false;
      }

      const content = fs.readFileSync(indexPath, 'utf-8');
      const data = JSON.parse(content) as {
        version: string;
        updatedAt: string;
        totalDocuments: number;
        index: Record<string, string[]>;
        docFreq: Record<string, Record<string, number>>;
      };

      // 版本检查
      if (data.version !== '1.0.0') {
        getLogger().warn(`[SearchIndex] 索引版本不匹配: ${data.version}`);
        return false;
      }

      // 源文件 mtime 检查
      const updatedAtTime = new Date(data.updatedAt).getTime();
      const files = this.discoverIndexableFiles(basePath);
      for (const relativePath of files) {
        const fullPath = path.join(basePath, relativePath);
        if (fs.existsSync(fullPath)) {
          const mtime = fs.statSync(fullPath).mtime.getTime();
          if (mtime > updatedAtTime) {
            getLogger().info(`[SearchIndex] 索引过期: ${relativePath} 已更新`);
            return false;
          }
        }
      }

      // 恢复索引：普通对象/数组 → Map/Set
      this.index.clear();
      this.docFreq.clear();

      for (const [token, paths] of Object.entries(data.index)) {
        this.index.set(token, new Set(paths));
      }

      for (const [docPath, freqMap] of Object.entries(data.docFreq)) {
        const map = new Map<string, number>();
        for (const [token, count] of Object.entries(freqMap)) {
          map.set(token, count);
        }
        this.docFreq.set(docPath, map);
      }

      this.ready = true;
      this.persistedBasePath = basePath;
      getLogger().info(
        `[SearchIndex] 索引从磁盘恢复: ${data.totalDocuments} 个文件, ${this.index.size} 个关键词`
      );
      return true;
    } catch (error) {
      getLogger().warn('[SearchIndex] 加载持久化索引失败', error);
      return false;
    }
  }

  /**
   * 删除持久化索引文件（若存在）。
   *
   * @param basePath - storage 根目录
   */
  clearPersisted(basePath: string): void {
    const indexPath = path.join(basePath, '.index', 'search-index.json');
    try {
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
        getLogger().info(`[SearchIndex] 已删除持久化索引: ${indexPath}`);
      }
    } catch (error) {
      getLogger().warn('[SearchIndex] 删除持久化索引失败', error);
    }
  }

  // ==================== 事件/回调机制 ====================

  /**
   * 注册索引更新回调。
   *
   * 当索引发生 rebuild / update / remove 时触发。
   *
   * @param callback - 回调函数
   */
  onUpdate(callback: IndexUpdateCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 注销索引更新回调。
   *
   * @param callback - 要移除的回调函数
   */
  offUpdate(callback: IndexUpdateCallback): void {
    const idx = this.callbacks.indexOf(callback);
    if (idx >= 0) {
      this.callbacks.splice(idx, 1);
    }
  }

  /**
   * 生成一个可用于 JsonStorage write 后调用的钩子函数。
   *
   * 用法示例：
   * ```ts
   * const storage = getStorage();
   * const index = SearchIndex.getInstance();
   * const hook = index.createWriteHook(storage);
   *
   * // 在每次 write 后调用
   * storage.write(data, 'projects', 'teamflow', 'context.json');
   * hook('projects/teamflow/context.json');
   * ```
   *
   * @param storage - JsonStorage 实例
   * @returns 钩子函数，接收相对于 basePath 的文件路径
   */
  createWriteHook(storage: JsonStorage): (relativePath: string) => void {
    return (relativePath: string) => {
      this.update(storage, relativePath);
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 发现所有需要建立索引的文件路径
   *
   * @param basePath - storage 根目录
   * @returns 相对于 basePath 的文件路径数组
   */
  private discoverIndexableFiles(basePath: string): string[] {
    const files: string[] = [];

    // 1. profile.json
    const profilePath = path.join(basePath, 'profile.json');
    if (fs.existsSync(profilePath)) {
      files.push('profile.json');
    }

    // 2. projects/<name>/context.json 和 projects/<name>/conversations/*.json
    const projectsDir = path.join(basePath, 'projects');
    if (fs.existsSync(projectsDir) && fs.statSync(projectsDir).isDirectory()) {
      const projectNames = fs.readdirSync(projectsDir);
      for (const projectName of projectNames) {
        const projectDir = path.join(projectsDir, projectName);
        if (!fs.statSync(projectDir).isDirectory()) {
          continue;
        }

        // context.json
        const contextPath = path.join(projectDir, 'context.json');
        if (fs.existsSync(contextPath)) {
          files.push(path.join('projects', projectName, 'context.json'));
        }

        // conversations/*.json
        const convDir = path.join(projectDir, 'conversations');
        if (fs.existsSync(convDir) && fs.statSync(convDir).isDirectory()) {
          const convFiles = fs.readdirSync(convDir).filter(
            f => f.endsWith('.json') && f !== '.gitkeep'
          );
          for (const convFile of convFiles) {
            files.push(path.join('projects', projectName, 'conversations', convFile));
          }
        }
      }
    }

    return files;
  }

  /**
   * 判断路径是否属于索引范围
   *
   * @param relativePath - 相对于 basePath 的路径
   * @returns true 表示该路径应被索引
   */
  private isIndexablePath(relativePath: string): boolean {
    if (relativePath === 'profile.json') {
      return true;
    }
    // projects/<name>/context.json
    if (/^projects\/[^/]+\/context\.json$/.test(relativePath)) {
      return true;
    }
    // projects/<name>/conversations/*.json
    if (/^projects\/[^/]+\/conversations\/[^/]+\.json$/.test(relativePath)) {
      return true;
    }
    return false;
  }

  /**
   * 索引单个文件
   *
   * @param storage - JsonStorage 实例
   * @param relativePath - 相对于 basePath 的路径
   * @returns 是否成功
   */
  private indexFile(storage: JsonStorage, relativePath: string): boolean {
    const segments = relativePath.split(/[/\\]/);
    const data = storage.read<unknown>(...segments);
    if (data === null) {
      return false;
    }

    const text = extractTextFromJson(data);
    const tokens = tokenize(text);

    // 统计词频
    const freqMap = new Map<string, number>();
    for (const token of tokens) {
      freqMap.set(token, (freqMap.get(token) || 0) + 1);
    }

    // 写入倒排索引
    for (const [token, count] of freqMap) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)!.add(relativePath);
    }

    // 写入文档词频
    this.docFreq.set(relativePath, freqMap);

    return true;
  }

  /**
   * 从索引中移除指定文件的所有条目
   *
   * @param relativePath - 相对于 basePath 的路径
   */
  private removeFromIndex(relativePath: string): void {
    // 从倒排索引中移除
    for (const [token, paths] of this.index) {
      paths.delete(relativePath);
      if (paths.size === 0) {
        this.index.delete(token);
      }
    }

    // 从文档词频中移除
    this.docFreq.delete(relativePath);
  }

  /**
   * 通知所有注册回调
   *
   * @param type - 更新类型
   * @param affectedPath - 受影响的文件路径
   */
  private notify(type: IndexUpdateType, affectedPath: string): void {
    for (const cb of this.callbacks) {
      try {
        cb(type, affectedPath);
      } catch {
        // 忽略回调抛出的异常，避免影响主流程
      }
    }
  }
}

// ==================== 便捷导出 ====================

/**
 * 获取 SearchIndex 单例实例的便捷函数
 *
 * @returns SearchIndex 实例
 */
export function getSearchIndex(): SearchIndex {
  return SearchIndex.getInstance();
}
