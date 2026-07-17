/**
 * Remember Me - Memory Engine HTTP Client
 * 使用 Node.js 内置 http 模块与 Python memory-engine 服务通信
 */

import * as http from 'http';
import { getLogger } from './logger';

export interface ExtractedInfo {
  type: string;
  text: string;
  confidence: number;
}

export interface SearchResult {
  path: string;
  content: string;
  score?: number;
}

/**
 * 语义搜索结果条目
 */
export interface SemanticSearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * 通用 HTTP 请求选项
 */
interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * 与 Python memory-engine 服务交互的客户端
 * 所有网络异常均被捕获，返回安全默认值（空数组 / false），不抛异常
 */
export class EngineClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(port: number = 8765, timeoutMs: number = 3000) {
    this.baseUrl = `http://localhost:${port}`;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 健康检查
   * @returns 包含 healthy、semanticReady 和可选 modelLoaded 的对象
   */
  async healthCheck(): Promise<{ healthy: boolean; semanticReady: boolean; modelLoaded?: string }> {
    try {
      const response = await this.requestWithTimeout({ method: 'GET', path: '/health' });
      if (response.statusCode !== 200) {
        getLogger().warn(`[EngineClient] healthCheck 非 200 状态码: ${response.statusCode}`);
        return { healthy: false, semanticReady: false };
      }
      const body = JSON.parse(response.body) as Record<string, unknown>;
      const isOk = body.status === 'ok';
      const semanticReady = body.semantic_ready === undefined ? true : Boolean(body.semantic_ready);
      const modelLoaded = body.model_loaded !== undefined ? String(body.model_loaded) : undefined;
      if (isOk) {
        getLogger().info('[EngineClient] healthCheck 成功');
      } else {
        getLogger().warn(`[EngineClient] healthCheck 响应异常: ${response.body}`);
      }
      return { healthy: isOk, semanticReady, modelLoaded };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] healthCheck 失败: ${message}`);
      return { healthy: false, semanticReady: false };
    }
  }

  /**
   * 调用 /extract 接口提取信息
   * @param text 待提取的文本
   * @param includeInsights 是否包含 insights
   * @returns ExtractedInfo 数组，失败时返回空数组
   */
  async extract(text: string, includeInsights?: boolean): Promise<ExtractedInfo[]> {
    try {
      const body = JSON.stringify({ text, include_insights: includeInsights ?? false });
      const response = await this.requestWithTimeout({
        method: 'POST',
        path: '/extract',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.statusCode !== 200) {
        getLogger().warn(`[EngineClient] extract 非 200 状态码: ${response.statusCode}`);
        return [];
      }
      const responseBody = JSON.parse(response.body) as Record<string, unknown>;
      const results = Array.isArray(responseBody.results)
        ? (responseBody.results as Array<Record<string, unknown>>)
        : [];
      const mapped: ExtractedInfo[] = results.map((r) => ({
        type: String(r.type || ''),
        text: String(r.raw_text || r.text || ''),
        confidence: Number(r.confidence || 0),
      }));
      getLogger().info(`[EngineClient] extract 成功，提取 ${mapped.length} 条信息`);
      return mapped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] extract 失败: ${message}`);
      return [];
    }
  }

  /**
   * 调用 /search 接口搜索记忆
   * @param keyword 搜索关键词
   * @param project 可选的项目过滤
   * @returns SearchResult 数组，失败时返回空数组
   */
  async search(keyword: string, project?: string): Promise<SearchResult[]> {
    try {
      const body = JSON.stringify({ keyword, project: project ?? '' });
      const response = await this.requestWithTimeout({
        method: 'POST',
        path: '/search',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.statusCode !== 200) {
        getLogger().warn(`[EngineClient] search 非 200 状态码: ${response.statusCode}`);
        return [];
      }
      const responseBody = JSON.parse(response.body) as Record<string, unknown>;
      const matches = Array.isArray(responseBody.matches)
        ? (responseBody.matches as Array<Record<string, unknown>>)
        : [];
      const mapped: SearchResult[] = matches.map((m) => ({
        path: String(m.file || m.path || ''),
        content: String(m.snippet || m.content || ''),
        score: Number(m.score || 0),
      }));
      getLogger().info(`[EngineClient] search 成功，找到 ${mapped.length} 条结果`);
      return mapped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] search 失败: ${message}`);
      return [];
    }
  }

  /**
   * 调用 /semantic-search 接口进行语义检索（基于向量相似度）
   *
   * 当 memory-engine 服务未启动、chromadb 不可用（503）或网络异常时，
   * 返回空数组并记录 warn 日志，UI 层可据此自动回退到关键词搜索。
   *
   * @param query 自然语言查询
   * @param project 项目名，省略时搜索全局记忆
   * @param topK 返回结果数上限，默认 5
   * @param threshold 相似度下限（0~1），默认 0（不过滤）
   * @returns SemanticSearchResult 数组，按 score 降序排列
   */
  async semanticSearch(
    query: string,
    project?: string,
    topK?: number,
    threshold?: number
  ): Promise<SemanticSearchResult[]> {
    try {
      const body = JSON.stringify({
        query,
        project: project ?? '',
        top_k: topK ?? 5,
        threshold: threshold ?? 0,
      });
      const response = await this.requestWithTimeout({
        method: 'POST',
        path: '/semantic-search',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.statusCode !== 200) {
        // 503 表示语义搜索服务降级，属预期情况，按 warn 而非 error 记录
        getLogger().warn(
          `[EngineClient] semanticSearch 状态码 ${response.statusCode}，可能需要回退到关键词搜索`
        );
        return [];
      }
      const responseBody = JSON.parse(response.body) as Record<string, unknown>;
      const results = Array.isArray(responseBody.results)
        ? (responseBody.results as Array<Record<string, unknown>>)
        : [];
      const mapped: SemanticSearchResult[] = results.map((r) => ({
        id: String(r.id || ''),
        text: String(r.text || ''),
        score: Number(r.score || 0),
        metadata: (r.metadata as Record<string, unknown> | undefined) ?? undefined,
      }));
      getLogger().info(
        `[EngineClient] semanticSearch 成功，找到 ${mapped.length} 条结果`
      );
      return mapped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] semanticSearch 失败: ${message}`);
      return [];
    }
  }

  /**
   * 调用 /hybrid-search 接口进行混合检索（关键词 + 向量）
   *
   * 当 memory-engine 服务未启动或网络异常时，
   * 返回空数组并记录 warn 日志。
   *
   * @param query 自然语言查询
   * @param project 项目名，省略时搜索全局记忆
   * @param topK 返回结果数上限，默认 5
   * @param keywordWeight 关键词权重（0~1），默认 0.5
   * @param semanticWeight 语义权重（0~1），默认 0.5
   * @returns SemanticSearchResult 数组，按 score 降序排列
   */
  async hybridSearch(
    query: string,
    project?: string,
    topK?: number,
    keywordWeight?: number,
    semanticWeight?: number
  ): Promise<SemanticSearchResult[]> {
    try {
      const body = JSON.stringify({
        query,
        project: project ?? '',
        top_k: topK ?? 5,
        keyword_weight: keywordWeight ?? 0.5,
        semantic_weight: semanticWeight ?? 0.5,
      });
      const response = await this.requestWithTimeout({
        method: 'POST',
        path: '/hybrid-search',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.statusCode !== 200) {
        getLogger().warn(
          `[EngineClient] hybridSearch 状态码 ${response.statusCode}，可能需要回退到关键词搜索`
        );
        return [];
      }
      const responseBody = JSON.parse(response.body) as Record<string, unknown>;
      const results = Array.isArray(responseBody.results)
        ? (responseBody.results as Array<Record<string, unknown>>)
        : [];
      const mapped: SemanticSearchResult[] = results.map((r) => ({
        id: String(r.id || ''),
        text: String(r.text || ''),
        score: Number(r.score || 0),
        metadata: (r.metadata as Record<string, unknown> | undefined) ?? undefined,
      }));
      getLogger().info(
        `[EngineClient] hybridSearch 成功，找到 ${mapped.length} 条结果`
      );
      return mapped;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] hybridSearch 失败: ${message}`);
      return [];
    }
  }

  /**
   * 触发批量语义索引（POST /semantic-index）
   *
   * 将 ~/.remember-me 下的 JSON 记忆灌入向量索引。首次启用语义搜索
   * 或记忆发生大批量变更后调用。服务不可用时返回 false。
   *
   * @returns 索引的记忆总数，失败返回 -1
   */
  async buildSemanticIndex(): Promise<number> {
    try {
      const response = await this.requestWithTimeout({
        method: 'POST',
        path: '/semantic-index',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (response.statusCode !== 200) {
        getLogger().warn(
          `[EngineClient] buildSemanticIndex 状态码 ${response.statusCode}`
        );
        return -1;
      }
      const body = JSON.parse(response.body) as Record<string, unknown>;
      const total = Number(body.total_memories || 0);
      getLogger().info(`[EngineClient] 语义索引完成，共 ${total} 条记忆`);
      return total;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger().warn(`[EngineClient] buildSemanticIndex 失败: ${message}`);
      return -1;
    }
  }

  /**
   * 底层 HTTP 请求封装（仅内部使用）
   */
  private request(options: RequestOptions): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path, this.baseUrl);
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method,
        headers: options.headers ?? {},
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * 带超时的请求包装
   * 超时后返回拒绝的 Promise，由上层 catch 处理为安全默认值
   */
  private async requestWithTimeout(
    options: RequestOptions
  ): Promise<{ statusCode: number; body: string }> {
    return Promise.race([
      this.request(options),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      }),
    ]);
  }
}
