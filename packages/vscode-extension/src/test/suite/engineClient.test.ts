/**
 * Remember Me - EngineClient 单元测试
 * 验证与 Python memory-engine HTTP 服务的通信、超时处理和容错行为
 */

import * as assert from 'assert';
import * as http from 'http';
import * as net from 'net';
import { EngineClient, ExtractedInfo, SearchResult, SemanticSearchResult } from '../../utils/engineClient';

describe('EngineClient', () => {
  let client: EngineClient;
  let mockServer: http.Server | null = null;
  let mockSockets: Set<net.Socket>;
  let mockPort: number;

  /**
   * 启动一个 Mock HTTP 服务器，返回分配的端口号
   * 自动追踪所有连接套接字，以便强制关闭
   */
  function startMockServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      mockSockets = new Set();
      const server = http.createServer(handler);

      server.on('connection', (socket: net.Socket) => {
        mockSockets.add(socket);
        socket.on('close', () => {
          mockSockets.delete(socket);
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('无法获取服务器端口'));
        }
      });
      mockServer = server;
    });
  }

  /**
   * 关闭 Mock HTTP 服务器并强制销毁所有活跃连接
   */
  function stopMockServer(): Promise<void> {
    return new Promise((resolve) => {
      if (mockServer) {
        // 先销毁所有活跃套接字，防止 server.close 被挂起
        for (const socket of mockSockets) {
          socket.destroy();
        }
        mockSockets.clear();
        mockServer.close(() => resolve());
        mockServer = null;
      } else {
        resolve();
      }
    });
  }

  afterEach(async () => {
    await stopMockServer();
  });

  // ==================== 1. healthCheck 服务可用 ====================
  describe('healthCheck', () => {
    it('服务可用时应返回 true', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });

      client = new EngineClient(mockPort);
      const result = await client.healthCheck();
      assert.strictEqual(result.healthy, true);
    });

    // ==================== 2. healthCheck 服务不可用 ====================
    it('服务不可用时（端口不存在）应返回 false', async () => {
      client = new EngineClient(59999, 500);
      const result = await client.healthCheck();
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.semanticReady, false);
    });

    // ==================== 6. 非 200 状态码 ====================
    it('服务返回非 200 状态码时应返回 false', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error' }));
      });

      client = new EngineClient(mockPort);
      const result = await client.healthCheck();
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.semanticReady, false);
    });
  });

  // ==================== 3. extract 成功调用 ====================
  describe('extract', () => {
    it('成功调用应返回提取结果数组', async () => {
      const mockResponse = {
        count: 2,
        results: [
          { type: 'decision', raw_text: '采用微服务架构', suggested_title: '架构决策', confidence: 0.95 },
          { type: 'terminology', raw_text: 'SSR 是指服务端渲染', suggested_title: '术语定义', confidence: 0.85 },
        ],
      };

      mockPort = await startMockServer((req, res) => {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          assert.strictEqual(parsed.text, '测试文本');
          assert.strictEqual(parsed.include_insights, true);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockResponse));
        });
      });

      client = new EngineClient(mockPort);
      const result = await client.extract('测试文本', true);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].type, 'decision');
      assert.strictEqual(result[0].text, '采用微服务架构');
      assert.strictEqual(result[0].confidence, 0.95);
      assert.strictEqual(result[1].text, 'SSR 是指服务端渲染');
    });
  });

  // ==================== 4. search 成功调用 ====================
  describe('search', () => {
    it('成功调用应返回搜索结果数组', async () => {
      const mockResponse = {
        keyword: 'react',
        search_root: '/home/user/.remember-me',
        files_scanned: 5,
        match_count: 2,
        matches: [
          { file: 'projects/demo/context.json', line: 3, snippet: '使用 React 构建前端' },
          { file: 'profile.json', line: 1, snippet: '偏好 TypeScript' },
        ],
      };

      mockPort = await startMockServer((req, res) => {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          assert.strictEqual(parsed.keyword, 'react');
          assert.strictEqual(parsed.project, 'demo');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockResponse));
        });
      });

      client = new EngineClient(mockPort);
      const result = await client.search('react', 'demo');
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].path, 'projects/demo/context.json');
      assert.strictEqual(result[0].content, '使用 React 构建前端');
      assert.strictEqual(result[1].path, 'profile.json');
      assert.strictEqual(result[1].content, '偏好 TypeScript');
    });
  });

  // ==================== 5. 请求超时 ====================
  describe('超时处理', () => {
    it('请求超时时应返回空数组', async () => {
      mockPort = await startMockServer((_req, _res) => {
        // 模拟一个永不响应的服务器（不调用 res.end）
      });

      client = new EngineClient(mockPort, 80); // 80ms 超时
      const start = Date.now();
      const result = await client.extract('超时测试');
      const elapsed = Date.now() - start;

      assert.deepStrictEqual(result, []);
      // 验证确实经历了超时，而非瞬时返回
      assert.ok(elapsed >= 70, `实际耗时 ${elapsed}ms，应接近或大于 80ms`);
    });
  });

  // ==================== 非 200 状态码：extract / search ====================
  describe('错误状态码', () => {
    it('extract 收到 500 应返回空数组', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '内部错误' }));
      });

      client = new EngineClient(mockPort);
      const result = await client.extract('任意文本');
      assert.deepStrictEqual(result, []);
    });

    it('search 收到 404 应返回空数组', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      client = new EngineClient(mockPort);
      const result = await client.search('任意关键词');
      assert.deepStrictEqual(result, []);
    });
  });

  // ==================== 边界情况 ====================
  describe('边界情况', () => {
    it('extract 收到非 JSON 响应应返回空数组', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('这不是 JSON');
      });

      client = new EngineClient(mockPort);
      const result = await client.extract('测试');
      assert.deepStrictEqual(result, []);
    });

    it('search 收到空数组响应（向后兼容）应正确返回空数组', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      });

      client = new EngineClient(mockPort);
      const result = await client.search('无结果关键词');
      assert.deepStrictEqual(result, []);
    });

    it('search 收到对象但 matches 为空数组时应返回空数组', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keyword: 'nothing', files_scanned: 10, match_count: 0, matches: [] }));
      });

      client = new EngineClient(mockPort);
      const result = await client.search('nothing');
      assert.deepStrictEqual(result, []);
    });
  });

  // ==================== semanticSearch ====================
  describe('semanticSearch', () => {
    it('成功调用应返回正确结构的结果', async () => {
      const mockResponse = {
        query: '用户登录',
        project: 'demo',
        results: [
          { id: 'm1', text: 'PRD：用户登录需支持 OAuth2', score: 0.82, metadata: { source: 'context.json' } },
          { id: 'm2', text: '决定用 OAuth 2.0 + 短信验证码', score: 0.76, metadata: { source: 'c1.json' } },
        ],
        total: 2,
        latency_ms: 12.5,
      };

      mockPort = await startMockServer((req, res) => {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body);
          // 验证请求体字段映射
          assert.strictEqual(parsed.query, '用户登录');
          assert.strictEqual(parsed.project, 'demo');
          assert.strictEqual(parsed.top_k, 8);
          assert.strictEqual(parsed.threshold, 0);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockResponse));
        });
      });

      client = new EngineClient(mockPort);
      const result = await client.semanticSearch('用户登录', 'demo', 8, 0);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 'm1');
      assert.strictEqual(result[0].text, 'PRD：用户登录需支持 OAuth2');
      assert.strictEqual(result[0].score, 0.82);
      assert.deepStrictEqual(result[0].metadata, { source: 'context.json' });
      assert.strictEqual(result[1].id, 'm2');
    });

    it('503 降级时应返回空数组（触发回退关键词搜索）', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: '语义搜索服务暂不可用',
          fallback: '请使用关键词搜索 POST /search',
        }));
      });

      client = new EngineClient(mockPort);
      const result = await client.semanticSearch('任意查询');
      assert.deepStrictEqual(result, []);
    });

    it('字段映射应正确处理缺失字段（向后兼容）', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // 缺失 score / metadata，验证默认值
        res.end(JSON.stringify({
          query: 'test',
          results: [{ id: 'x', text: 'hi' }],
          total: 1,
          latency_ms: 1,
        }));
      });

      client = new EngineClient(mockPort);
      const result = await client.semanticSearch('test');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'x');
      assert.strictEqual(result[0].score, 0);
      assert.strictEqual(result[0].metadata, undefined);
    });

    it('服务不可用（端口不存在）应返回空数组', async () => {
      client = new EngineClient(59998, 500);
      const result = await client.semanticSearch('连接失败');
      assert.deepStrictEqual(result, []);
    });
  });

  // ==================== buildSemanticIndex ====================
  describe('buildSemanticIndex', () => {
    it('成功调用应返回索引记忆总数', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ indexed: { global: 1, demo: 2 }, total_memories: 3, latency_ms: 64 }));
      });

      client = new EngineClient(mockPort);
      const total = await client.buildSemanticIndex();
      assert.strictEqual(total, 3);
    });

    it('503 降级时应返回 -1', async () => {
      mockPort = await startMockServer((_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '语义搜索服务暂不可用' }));
      });

      client = new EngineClient(mockPort);
      const total = await client.buildSemanticIndex();
      assert.strictEqual(total, -1);
    });
  });
});
