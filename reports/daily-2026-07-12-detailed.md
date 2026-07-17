# Remember Me — 每日迭代报告（详细版）

**日期**: 2026-07-12（周六）
**时间范围**: 00:00 – 08:00 CST（凌晨开发窗口）
**迭代阶段**: Phase 3 实机验证收尾 + Phase 4 预研启动
**报告生成时间**: 2026-07-12 08:00:35+0800

---

## 一、今日交付总览

| 任务组 | 模块 | 优先级 | 状态 | 代码交付 |
|--------|------|--------|------|----------|
| B1 | EngineClient API 契约修复 | P0 🔴 | ✅ 完成 | engineClient.ts 重写响应解析（196 行） |
| B1 测试 | EngineClient 测试重构 | P0 🔴 | ✅ 完成 | engineClient.test.ts Mock 服务器框架（248 行） |
| C1 | MemoryRecommender 多语言停用词 | P1 🟡 | ✅ 完成 | recommender.ts 新增英文停用词 + 完整推荐逻辑（444 行） |
| C1 测试 | Recommender 完整测试套件 | P1 🟡 | ✅ 完成 | recommender.test.ts 22 个用例（374 行） |
| D1 | 语义搜索技术预研 | P1 🟡 | ✅ 完成 | semantic-search-2026-07-12.md 选型报告（173 行） |
| F1 | 编译与测试回归 | P1 🟡 | ✅ 319 通过 / 1 失败 | 新增 32 个用例全部通过 |

---

## 二、新增与修改文件清单

### 2.1 核心功能文件（3 个文件）

| 文件 | 修改类型 | 行数 | 修改时间 | 功能说明 |
|------|----------|------|----------|----------|
| `src/utils/engineClient.ts` | 🔨 重写 | 196 | 02:02 | 修复 API 契约不匹配：`extract`/`search` 响应从数组解析改为对象解析，增加字段映射与兼容回退 |
| `src/memory/recommender.ts` | 🔧 修改 | 444 | 02:03 | 新增 `ENGLISH_STOP_WORDS`（60+ 词），`extractKeywords` 支持中英文混合过滤，完整实现 MemoryRecommender 类 |
| `docs/research/semantic-search-2026-07-12.md` | ➕ 新增 | 173 | 02:06 | Phase 4 语义搜索技术选型报告：ChromaDB vs FAISS 对比矩阵 + 嵌入模型选型 + 6 周路线图 |

### 2.2 测试文件（2 个文件，新增 32 个用例）

| 文件 | 用例数 | 行数 | 修改时间 | 覆盖范围 |
|------|--------|------|----------|----------|
| `src/test/suite/engineClient.test.ts` | 10 | 248 | 02:03 | healthCheck / extract / search / 超时 / 错误码 / 边界情况 / 字段映射验证 |
| `src/test/suite/recommender.test.ts` | 22 | 374 | 02:05 | 关键词提取（8）/ 基础推荐（6）/ 权重加成（3）/ 会话忽略（3）/ 对话记忆（4）/ 字段完整性 / 跨项目搜索 |

### 2.3 编译输出

共 **39+ 个 `.js` 和 `.js.map` 文件** 在 `out/` 目录中，确认 `tsc` 编译通过（0 错误 0 警告）。

---

## 三、核心功能详解

### 3.1 EngineClient API 契约修复（B1）

**问题背景**: Python `memory-engine` 服务端返回嵌套对象结构，但 `EngineClient` 客户端原先按平面数组直接解析，导致 `extract()` 和 `search()` 永远返回空数组。

**修复前（错误实现）**:
```typescript
// extract() — 按数组解析 ❌
const result = JSON.parse(response.body) as ExtractedInfo[];

// search() — 按数组解析 ❌
const result = JSON.parse(response.body) as SearchResult[];
```

**修复后（正确实现）**:
```typescript
// extract() — 先解析对象，提取 results 数组，映射 raw_text → text
const responseBody = JSON.parse(response.body) as Record<string, unknown>;
const results = Array.isArray(responseBody.results) ? responseBody.results : [];
const mapped = results.map(r => ({
  type: String(r.type || ''),
  text: String(r.raw_text || r.text || ''),  // 兼容新旧字段名
  confidence: Number(r.confidence || 0),
}));

// search() — 先解析对象，提取 matches 数组，映射 file → path, snippet → content
const responseBody = JSON.parse(response.body) as Record<string, unknown>;
const matches = Array.isArray(responseBody.matches) ? responseBody.matches : [];
const mapped = matches.map(m => ({
  path: String(m.file || m.path || ''),       // 兼容新旧字段名
  content: String(m.snippet || m.content || ''),
  score: Number(m.score || 0),
}));
```

**关键改进**:
- 响应解析从「数组假设」改为「对象提取」，与服务端实际格式对齐
- 字段映射保留**兼容回退**：`raw_text` → `text`，`file` → `path`，`snippet` → `content`
- 所有解析路径增加 `Array.isArray` 校验，非预期结构时返回空数组而非抛异常
- 完整 JSDoc 注释覆盖每个公共方法

---

### 3.2 EngineClient Mock 服务器测试框架（B1 测试）

**实现**: 完全自研的 Mock HTTP 服务器，零外部依赖。

| 组件 | 功能 | 说明 |
|------|------|------|
| `startMockServer(handler)` | 启动 Mock 服务器 | 端口自动分配（`listen(0)`），支持自定义请求处理器 |
| `stopMockServer()` | 强制关闭 | 先 `destroy` 所有活跃套接字，再 `server.close()`，防止测试挂起 |
| `mockSockets` 追踪 | 连接生命周期管理 | `Set<net.Socket>` 实时追踪，确保每次测试后端口释放 |

**用例覆盖矩阵**:

| 用例 | 场景 | 验证点 |
|------|------|--------|
| healthCheck 可用 | 200 + `{status: 'ok'}` | 返回 `true` |
| healthCheck 不可用 | 端口不存在（ECONNREFUSED） | 返回 `false`，不抛异常 |
| healthCheck 非 200 | 503 Service Unavailable | 返回 `false`，记录 warn |
| extract 成功 | `{count, results: [{raw_text, type, confidence}]}` | 正确解析 2 条结果，`text` 字段映射正确 |
| search 成功 | `{keyword, matches: [{file, line, snippet}]}` | 正确解析 2 条结果，`path`/`content` 映射正确 |
| 请求超时 | Mock 服务器永不响应 | 80ms 超时后返回 `[]`，耗时 ≥ 70ms |
| extract 500 | 服务端内部错误 | 返回 `[]`，记录 warn |
| search 404 | 路由不存在 | 返回 `[]`，记录 warn |
| 非 JSON 响应 | `text/plain` 返回乱文本 | `JSON.parse` 异常捕获，返回 `[]` |
| 空数组向后兼容 | 服务端直接返回 `[]` | 兼容旧格式，返回 `[]` |

---

### 3.3 MemoryRecommender 多语言停用词与完整推荐系统（C1）

**实现**: `src/memory/recommender.ts` 共 444 行，实现 Phase 3 核心差异化特性——基于关键词匹配的离线记忆推荐系统。

#### 3.3.1 英文停用词扩展

新增 `ENGLISH_STOP_WORDS` 集合（60+ 词），分类覆盖：

| 类别 | 示例 | 数量 |
|------|------|------|
| 基础冠词/代词 | a, an, the, this, that, i, you, he, she, it, we, they | 22 |
| 常用动词/助动词 | am, is, are, was, were, be, have, has, do, will, can, may, must | 17 |
| 常见介词/连词 | in, on, at, to, for, of, with, by, and, or, but, if, because | 20 |
| 常见副词/限定词 | not, only, just, now, then, here, there, when, where, all, any, more, most | 15 |

**集成点**: `extractKeywords()` 方法在英文/数字分支中，同时检查 `STOP_WORDS`（中文）和 `ENGLISH_STOP_WORDS`（英文）：

```typescript
if (lower.length >= 2 && !STOP_WORDS.has(lower) && !ENGLISH_STOP_WORDS.has(lower)) {
  keywords.push(lower);
}
```

#### 3.3.2 关键词提取算法

| 文本类型 | 处理策略 | 停用词过滤 |
|----------|----------|-----------|
| 连续中文字符 | 2-gram ~ 4-gram 滑动窗口提取 | `STOP_WORDS`（中文） |
| 英文/数字/符号 | 转小写，长度 ≥ 2 | `STOP_WORDS` + `ENGLISH_STOP_WORDS` |
| 混合文本 | 先按空格/标点切分，再分离中英文分别处理 | 双停用词表联合过滤 |

#### 3.3.3 候选记忆收集

来源覆盖 4 大类、7 小类：

| 来源 | 类型 | matchText 构成 |
|------|------|---------------|
| 项目决策 | `decision` | `title + description` |
| 项目术语 | `term` | `term + definition` |
| 对话标题 | `conversation` | `title + tags + userMessages` |
| 对话关键决策 | `decision` | `title + description` |
| 对话洞察 | `conversation` | `insight.content` |
| 用户消息 | 加成标记 | 为对话候选追加 `userText` 到 `matchText` |

#### 3.3.4 相关性计算（多维度权重加成）

基础分数采用 Dice 系数变体：`score = (2 × overlap) / (contentKeywords.length + candidateKeywords.length)`

| 加成条件 | 加分值 | 说明 |
|----------|--------|------|
| 同一项目 | +0.2 | 当前项目匹配优先 |
| 近期内容（7 天内） | +0.15 | 时间衰减，新记忆优先 |
| 已确定决策 | +0.1 | `status === '已确定'` 的决策优先 |
| 用户消息匹配 | +0.1 | 对话中包含用户发送的消息内容匹配 |

**上限控制**: `Math.min(score, 1.0)`，确保 relevanceScore 不超过 1.0。

**排序与截断**: 按 `relevanceScore` 降序排列，取前 5 条。

---

### 3.4 语义搜索技术选型报告（D1）

**目标**: 为 Phase 4 Pro 版「语义搜索」选择向量数据库与嵌入模型方案。

#### 3.4.1 向量数据库对比矩阵

| 评估维度 | 权重 | ChromaDB | FAISS | 加权得分 (ChromaDB) | 加权得分 (FAISS) |
|---------|------|----------|-------|---------------------|------------------|
| 安装复杂度 | 高 (×1.5) | 4 | 3 | 6.0 | 4.5 |
| 存储体积 | 高 (×1.5) | 4 | 5 | 6.0 | 7.5 |
| 查询性能 | 中 (×1.0) | 3 | 5 | 3.0 | 5.0 |
| 跨语言支持 | 高 (×1.5) | 4 | 3 | 6.0 | 4.5 |
| VS Code 插件集成 | 高 (×1.5) | 4 | 3 | 6.0 | 4.5 |
| 许可协议 | 中 (×1.0) | 5 | 5 | 5.0 | 5.0 |
| 离线可用性 | 高 (×1.5) | 5 | 5 | 7.5 | 7.5 |
| **加权总分** | — | — | — | **39.5** | **38.0** |

#### 3.4.2 推荐结论

| 项目 | 结论 |
|------|------|
| 向量数据库 | **ChromaDB**（加权总分 39.5 vs 38.0） |
| 嵌入模型（默认） | **all-MiniLM-L6-v2**（384 维，80MB，多语言） |
| 嵌入模型（可选） | **bge-small-zh-v1.5**（512 维，100MB，中文优化） |
| 预估额外存储 | 1,000 条记忆 ≈ 1.5MB；10,000 条 ≈ 15MB |
| 预估查询延迟 | 1,000 条 < 50ms；10,000 条 < 150ms |

#### 3.4.3 Phase 4 集成路线图

```
Phase 4.1 MVP 语义搜索（2 周）
  ├─ pyproject.toml 新增 chromadb + sentence-transformers 依赖
  ├─ 新增 vector_index.py 模块，JSON 变更自动同步到 ChromaDB
  ├─ POST /semantic-search HTTP 端点，返回 Top-5 记忆片段
  └─ VS Code 插件 UI：语义搜索切换按钮 + 自然语言输入

Phase 4.2 优化与体验提升（2 周）
  ├─ 增量索引优化（避免全量重建）
  ├─ 混合搜索（关键词 + 语义，权重融合）
  ├─ 结果解释（高亮匹配原因）
  └─ 模型本地缓存

Phase 4.3 生产就绪（2 周）
  ├─ 索引健康检查与自动修复
  ├─ 100 / 1K / 10K / 100K 条压力测试
  ├─ 降级策略（模型/ChromaDB 异常时回退关键词搜索）
  └─ 用户设置：启用开关 + 模型选择下拉框
```

---

## 四、测试验证报告

### 4.1 编译结果

```
tsc -p ./

✅ 0 个错误
✅ 0 个警告
```

### 4.2 测试执行结果

```
npm test
> tsc -p ./ && node out/test/runner.js

✅ 319 通过
❌ 1 失败
```

**新增用例详细列表（32 个，全部通过）**:

**EngineClient（10 个用例）**:
- `healthCheck 服务可用时应返回 true` — 200 + status: ok
- `healthCheck 服务不可用时（端口不存在）应返回 false` — ECONNREFUSED 降级
- `服务返回非 200 状态码时应返回 false` — 503 降级
- `extract 成功调用应返回提取结果数组` — 对象格式解析 + raw_text→text 映射
- `search 成功调用应返回搜索结果数组` — 对象格式解析 + file→path, snippet→content 映射
- `请求超时时应返回空数组` — 80ms 超时模拟
- `extract 收到 500 应返回空数组` — 服务端错误降级
- `search 收到 404 应返回空数组` — 路由不存在降级
- `extract 收到非 JSON 响应应返回空数组` — 解析异常降级
- `search 收到空数组响应（向后兼容）应正确返回空数组` — 旧格式兼容

**MemoryRecommender（22 个用例）**:
- 关键词提取（8）：英文转小写、英文停用词过滤、混合中英文、纯英文停用词过滤、中文停用词过滤、单字过滤、空文本、去重
- 基础推荐（6）：项目决策推荐、术语推荐、无匹配空返回、最多 5 条、降序排列、得分上限 1.0
- 权重加成（3）：同一项目 +0.2、已确定决策 +0.1、近期内容 +0.15
- 会话忽略（3）：单条 ignore、多条 ignore、clear 恢复
- 对话记忆推荐（4）：对话标题匹配、关键决策匹配、洞察匹配、用户消息匹配加成
- 字段完整性（1）：返回对象包含所有必填字段
- 跨项目搜索（1）：不传 currentProject 时跨项目返回结果

**已有失败用例（1 个，与本次迭代无关）**:
- `ProjectManager.list 应按更新时间倒序返回项目` — 排序断言失败（实际 'ProjectA'，预期 'ProjectB'）

---

## 五、代码质量统计

| 指标 | 数值 | 说明 |
|------|------|------|
| 新增/修改 TypeScript 文件 | 3 个 | engineClient.ts、recommender.ts、engineClient.test.ts |
| 新增 TypeScript 文件 | 2 个 | recommender.test.ts、semantic-search 报告 |
| 新增测试文件 | 2 个 | engineClient.test.ts、recommender.test.ts |
| 新增测试用例 | 32 个 | EngineClient 10 + MemoryRecommender 22 |
| 新增/修改代码行数 | ~1,262 行 | engineClient 196 + recommender 444 + engineClient.test 248 + recommender.test 374 |
| 编译错误 | **0** | 严格模式通过 |
| 编译警告 | **0** | 无隐式 any / 无未使用变量 |
| 新增测试通过率 | **32/32** | 全部通过 |
| 总测试通过率 | **319/320** | 1 个已有失败不影响本次迭代 |
| 技术文档 | 1 份 | 语义搜索选型报告 173 行 |

---

## 六、遇到的问题与解决方案

### 问题 1: EngineClient API 契约不匹配

| 项目 | 内容 |
|------|------|
| **现象** | `engineClient.extract()` 和 `search()` 永远返回空数组，即使 Python 服务正常运行且返回正确数据 |
| **根因** | Python `server.py` 返回嵌套对象结构（`{ results: [...] }` / `{ matches: [...] }`），但 `EngineClient` 按平面数组（`ExtractedInfo[]` / `SearchResult[]`）直接 `JSON.parse` 并断言类型 |
| **影响** | Phase 2/3 所有依赖 EngineClient 的功能（记忆提取、搜索）在实机环境中完全失效 |
| **修复方案** | 1. 改为先 `JSON.parse` 为 `Record<string, unknown>`；2. 用 `Array.isArray` 安全提取内部数组；3. 增加字段映射（`raw_text`→`text`, `file`→`path`, `snippet`→`content`）并保留兼容回退 |
| **验证结果** | Mock 服务器测试 10 个用例全部通过，字段映射验证精确到每个属性 |

### 问题 2: 多语言停用词缺失

| 项目 | 内容 |
|------|------|
| **现象** | `MemoryRecommender.extractKeywords()` 处理英文文本时，提取结果包含大量无意义词汇（如 "the", "is", "a", "about"），降低推荐精度 |
| **根因** | 原实现仅包含中文停用词 `STOP_WORDS`，英文/数字分支未做停用词过滤 |
| **影响** | 英文记忆内容（如技术文档、代码讨论）的推荐相关性下降 |
| **修复方案** | 1. 新增 `ENGLISH_STOP_WORDS` 集合（60+ 词，覆盖冠词、代词、动词、介词、连词、副词）；2. 在 `extractKeywords()` 英文分支中同时检查中英文停用词；3. 混合中英文场景（如 "我们使用 Python 进行开发"）双过滤 |
| **验证结果** | Recommender 测试 22 个用例全部通过，含 8 个关键词提取专项用例 |

### 问题 3: EngineClient 单元测试需要 Mock HTTP 服务器

| 项目 | 内容 |
|------|------|
| **现象** | 无法依赖真实 Python 服务进行单元测试，且需要验证超时、错误码、非 JSON 响应等边界场景 |
| **根因** | EngineClient 封装了底层 HTTP 通信，直接测试需要可控的服务端行为 |
| **解决方案** | 自研 Mock HTTP 服务器框架：1. `startMockServer(handler)` 自动分配端口；2. `mockSockets` 追踪所有连接；3. `stopMockServer()` 强制销毁套接字后关闭，防止测试挂起；4. afterEach 确保每个用例后服务器完全释放 |
| **验证结果** | 连续运行 10 次，无端口占用、无测试挂起 |

---

## 七、风险与应对记录

| 风险 | 状态 | 应对方案 | 剩余风险等级 |
|------|------|----------|-------------|
| EngineClient 与服务端 API 格式不一致 | ✅ 已修复 | 重写响应解析，增加兼容回退，Mock 测试覆盖 | 🟢 低 |
| 多语言场景关键词提取精度不足 | ✅ 已修复 | 补充 60+ 英文停用词，混合场景测试验证 | 🟢 低 |
| Extension Host 实机调试发现交互问题 | 待执行 | 编译 + 测试通过，计划今日白天执行 F5 验证 | 🟡 中 |
| Python 服务端到端调用链路未验证 | 待执行 | EngineClient 单元测试通过，待实机联调 | 🟡 中 |
| 语义搜索预研结论在原型验证中失效 | 观察中 | 已预留 Phase 4.1 的 2 周 MVP 窗口用于快速原型验证和调整 | 🟡 中 |
| ProjectManager.list 排序测试失败 | 已记录 | 与本次迭代无关，已定位到 `list()` 实现逻辑，待下次迭代修复 | 🟢 低 |

---

## 八、明日计划（2026-07-13）

| 优先级 | 任务 | 说明 | 预计工作量 |
|--------|------|------|-----------|
| P0 | Extension Host 实机调试 | 在 VS Code F5 中验证 20+ 命令的完整交互流程，记录问题到 e2e-issues | 3-4h |
| P0 | memory-engine 端到端验证 | 启动 Python HTTP 服务，测试 health/extract/search 端点实机调用 | 2-3h |
| P1 | 修复 ProjectManager.list 排序测试 | 定位排序逻辑错误，修复后确保测试通过 | 0.5h |
| P1 | 语义搜索快速原型（可选） | 若时间允许，用 ChromaDB + all-MiniLM-L6-v2 验证 100 条模拟记忆的语义搜索 | 2h |
| P2 | Phase 3 功能演示文档 | 截图 + 流程图 + 使用说明，为 README 更新和宣发准备素材 | 2h |

---

## 九、附录：文件变更时间线

```
02:02  src/utils/engineClient.ts              — 重写响应解析逻辑，修复 API 契约不匹配
02:03  src/test/suite/engineClient.test.ts     — 重构测试：Mock HTTP 服务器 + 10 个用例
02:03  src/memory/recommender.ts               — 新增英文停用词，完整 MemoryRecommender 实现
02:05  src/test/suite/recommender.test.ts      — 新建测试套件：22 个用例全覆盖
02:06  docs/research/semantic-search-2026-07-12.md — 技术选型报告：ChromaDB + all-MiniLM-L6-v2
08:00  reports/daily-2026-07-12.md            — 日报初稿
08:00  reports/daily-2026-07-12-detailed.md   — 详细迭代报告
```

---

**编制时间**: 2026-07-12 08:00 CST
**编制者**: Remember Me 开发团队（自动化报告）
**数据来源**: `packages/vscode-extension/src/` 实际文件系统快照 + `tsc -p ./` + `npm test`
