# Remember Me — 迭代报告

**迭代日期**: 2026-07-14
**迭代类型**: Phase 3 收尾 + Phase 4.1 语义搜索 MVP 集成 + 工程债务修复
**报告生成时间**: 2026-07-14

---

## 一、交付总览

| 任务 | 模块 | 优先级 | 状态 | 验证方式 |
|------|------|--------|------|----------|
| C1 Windows 目录删除 EPERM 修复 | `storage.ts` | P2 | ✅ 完成 | 2 新增测试通过，EPERM 消失 |
| B1 `vector_index.py` 语义搜索模块 | `memory-engine` | P1 | ✅ 完成 | 端到端召回验证 |
| B2 `POST /semantic-search` + `/semantic-index` 端点 | `server.py` | P1 | ✅ 完成 | 6/6 端点测试通过 |
| B3 `EngineClient.semanticSearch` + `buildSemanticIndex` | `engineClient.ts` | P1 | ✅ 完成 | 6 新增 TS 测试通过 |
| B4 VS Code 搜索 UI 模式切换 | `extension.ts` / `statusBar.ts` / `searchSettings.ts` | P1 | ✅ 完成 | 编译通过 |
| B5 单元测试 TS + Python | 测试套件 | P1 | ✅ 完成 | TS 333 / Python 6 |
| 文档 CHANGELOG + 版本号 | 全局 | P0 | ✅ 完成 | v0.3.0 |

---

## 二、新增与修改文件清单

### 1. Python memory-engine（3 文件）

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/memory_engine/vector_index.py` | ➕ 新增 ~280 行 | `VectorIndex` 类：懒加载 ChromaDB + sentence-transformers，项目级集合隔离，`index_memory` / `semantic_search` / `delete_memory` / `get_stats` / `close`；批量索引工具 `index_all_memories` |
| `src/memory_engine/server.py` | 📝 修改 | 新增 `/semantic-search`、`/semantic-index` 端点，懒加载 VectorIndex，503 降级，服务关闭释放资源；版本升至 0.3.0 |
| `src/memory_engine/__init__.py` | 📝 修改 | 导出 `VectorIndex` / `SemanticSearchError`；版本升至 0.3.0 |
| `pyproject.toml` | 📝 修改 | 新增 `chromadb>=1.5.0`、`sentence-transformers>=2.3.0` 依赖 + `minimal` 可选组 |
| `scripts/test_endpoints.py` | 📝 修改 | 新增 `/semantic-index`、`/semantic-search`（含 400 校验）测试 |

### 2. VS Code 扩展（6 文件）

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/utils/searchSettings.ts` | ➕ 新增 ~75 行 | `SearchSettingsManager`：搜索模式持久化到 `search-settings.json`，`setMode` / `toggle` / `setSemanticAvailable` |
| `src/utils/engineClient.ts` | 📝 修改 | 新增 `SemanticSearchResult` 接口、`semanticSearch()`、`buildSemanticIndex()` 方法，503 降级 |
| `src/extension.ts` | 📝 修改 | `searchMemory` 重写支持双模式 + 结果 QuickPick 展示；新增 `toggleSearchMode`、`buildSemanticIndex` 命令；启动时探测语义可用性 |
| `src/ui/statusBar.ts` | 📝 修改 | 新增 `searchMode` 状态字段与 `updateSearchMode`；状态栏图标/tooltip 反映模式；快捷菜单新增 2 入口 |
| `src/memory/storage.ts` | 📝 修复 | `delete()` 区分目录/文件，目录用 `fs.rmSync` 递归删除 |
| `package.json` | 📝 修改 | 版本 0.3.0；新增 2 命令声明 |

### 3. 测试（3 文件）

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/test/suite/engineClient.test.ts` | 📝 修改 | +6 测试：semanticSearch（成功/503/字段映射/连接失败）+ buildSemanticIndex（成功/503） |
| `src/test/suite/searchSettings.test.ts` | ➕ 新增 | +5 测试：默认模式/持久化/toggle/可用性/幂等写入 |
| `src/test/suite/storage.test.ts` | 📝 修改 | +2 测试：目录递归删除、不存在路径幂等 |

### 4. 文档（2 文件）

| 文件 | 类型 | 说明 |
|------|------|------|
| `CHANGELOG.md` | ➕ 新增 | v0.3.0 完整变更记录（Keep a Changelog 格式） |
| `README.md` | 📝 修改 | 路线图 Phase 4.1 状态更新 |

---

## 三、核心实现详解

### 3.1 语义搜索架构（B1+B2+B3）

```
VS Code 插件                          memory-engine (Python)
┌─────────────────────┐               ┌──────────────────────────┐
│ searchMemory 命令   │  HTTP POST    │ /semantic-search 端点     │
│   ↓ 读取 searchMode │ ────────────► │   ↓                       │
│ semantic mode →     │  {query,...}  │ VectorIndex.semantic_search│
│ EngineClient.       │ ◄──────────── │   ↓ ChromaDB cosine query │
│   semanticSearch()  │  results[]    │ sentence-transformers 编码│
│   ↓ 503 → 空数组    │               │   ↓                       │
│ 回退关键词搜索      │               │ 返回 Top-K {id,text,score}│
└─────────────────────┘               └──────────────────────────┘
```

**关键设计决策**：
- **绕过 ChromaDB embedding function 协议**：ChromaDB 1.5 的 embedding function 接口变动频繁（要求 `embed_query` 等），改为由 `VectorIndex` 自行用 sentence-transformers 编码，索引时传 `embeddings`、查询时传 `query_embeddings`，彻底规避适配层兼容性问题。这是预研原型到正式集成的关键修正。
- **懒加载**：模型与 ChromaDB 客户端首次语义请求时初始化，服务启动零延迟；首次查询冷启动 ~7-12s，后续 <20ms。
- **项目隔离**：每个项目对应 `remember_me_{project}` 集合，全局记忆用 `remember_me_global`。
- **优雅降级**：chromadb/sentence-transformers 未安装时 `SemanticSearchError` → 端点 503 + `fallback` 字段 → EngineClient 返回空数组 + warn → UI 自动回退关键词搜索。

### 3.2 搜索模式切换 UX（B4）

- 模式持久化于 `~/.remember-me/search-settings.json`（独立于 profile.json，不侵入 Profile 类型）。
- 状态栏实时显示当前模式（🔍 / 🧠 图标 + tooltip）。
- 关键词无结果 → 提示「试试语义搜索」一键切换。
- 语义无结果 → 提示「回退关键词搜索」或「构建索引」。
- 切到语义前校验服务健康，未运行时警告。

### 3.3 Windows 目录删除修复（C1）

`fs.unlinkSync` 仅能删文件，删目录在 Windows 抛 EPERM。改为 `statSync` 判断类型：目录 → `fs.rmSync({ recursive, force })`（Node<14.14 降级 `rmdirSync`），文件 → `unlinkSync`。

---

## 四、测试验证报告

### 4.1 TypeScript

```
tsc -p ./
✅ 0 错误 0 警告

node out/test/runner.js
✅ 333 passing（0 failing，0 pending）
   较上轮 320 → +13（semanticSearch 4 + buildSemanticIndex 2 + searchSettings 5 + 目录删除 2）
```

### 4.2 Python 端点

```
.venv/Scripts/python scripts/test_endpoints.py
[PASS] /health — status, service, version
[PASS] /extract — type, raw_text, confidence (2 items)
[PASS] /search — file, line, snippet
[PASS] /semantic-index — Indexed 3 memories
[PASS] /semantic-search — id, text, score, metadata (1 item)
[PASS] /semantic-search (bad request) — 400 校验
All endpoint tests passed!
```

### 4.3 语义搜索端到端验证

测试数据（临时目录）：1 个 profile.json + 1 个项目（context.json + 1 对话）。
- 批量索引：3 条记忆，64ms。
- 查询「用户登录认证方式」：召回 1 条，score 0.23，延迟 16ms。
- 查询「OAuth」：score 0.43，排名最高，语义相关性正确。

### 4.4 关键指标

| 指标 | 数值 |
|------|------|
| TS 编译错误 | 0 |
| TS 测试 | 333/333 通过 |
| Python 端点测试 | 6/6 通过 |
| 语义搜索首次冷启动 | ~7-12s（模型加载） |
| 语义搜索稳态延迟 | <20ms |
| 索引 3 条记忆 | 64ms |

---

## 五、已知限制与风险

| 项 | 说明 | 应对 |
|----|------|------|
| 跨语言召回低 | all-MiniLM-L6-v2 中文→英文 0/5 | Phase 4.2 评估 bge-m3 |
| 模型冷启动延迟 | 首次查询 7-12s | UI 提示「正在加载语义模型」；服务预加载 |
| 单线程 server | `http.server` 并发瓶颈 | 生产迁移 uvicorn + FastAPI |
| 无 CI | 端点测试未纳入自动化 | 下轮 GitHub Actions |

---

## 六、下轮迭代建议

1. **GitHub Release v0.3.0** + 标签推送（需 git 仓库）。
2. **CI 配置**：`.github/workflows/ci.yml` 双环境矩阵（Node + Python）。
3. **模型预加载**：服务启动时后台预热模型，消除冷启动。
4. **Phase 4.2**：评估 bge-m3 提升跨语言召回。

---

**编制时间**: 2026-07-14
