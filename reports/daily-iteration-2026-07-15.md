# Remember Me — 每日迭代报告

**日期**: 2026-07-15（周三）  
**版本**: v0.3.0  
**迭代阶段**: Phase 3 正式交付 + Phase 4.1 MVP 语义搜索集成  
**报告生成时间**: 2026-07-15 08:00 CST  

---

## 一、今日凌晨开发成果总览

| 任务 | 模块 | 状态 | 说明 |
|------|------|------|------|
| Phase 3 v0.3.0 Release 发布 | 全局 | ✅ 完成 | CHANGELOG.md 定稿，版本号同步更新 |
| Phase 4.1 语义搜索 MVP | memory-engine / VS Code 扩展 | ✅ 完成 | 向量索引 + 双模式搜索 UI + 优雅降级 |
| Windows 目录删除 EPERM 修复 | storage.ts | ✅ 完成 | `fs.rmSync` 递归删除，2 新增测试通过 |
| 全量测试回归 | 测试套件 | ✅ 完成 | TS 333/333 · Python 6/6 |
| GitHub Actions CI 配置 | `.github/workflows` | 🔄 进行中 | 双环境矩阵已创建，待首次运行验证 |
| TypeScript 编译构建 | out/ 产物 | ✅ 完成 | 7月15日 02:04 全量编译通过 |

---

## 二、packages/ 代码变更与新增文件

### 2.1 memory-engine（Python）— 5 文件变更

#### ➕ 新增文件

| 文件 | 行数 | 功能 |
|------|------|------|
| `packages/memory-engine/src/memory_engine/vector_index.py` | ~358 行 | `VectorIndex` 类：基于 ChromaDB + `all-MiniLM-L6-v2` 的语义搜索核心，支持懒加载、项目级集合隔离、幂等索引、批量索引工具 `index_all_memories` |

#### 📝 修改文件

| 文件 | 变更要点 |
|------|----------|
| `packages/memory-engine/src/memory_engine/server.py` | 新增 `POST /semantic-search`、`POST /semantic-index` 端点；懒加载 `VectorIndex`；503 降级处理；服务关闭释放资源；版本升至 0.3.0 |
| `packages/memory-engine/src/memory_engine/__init__.py` | 导出 `VectorIndex`、`SemanticSearchError`；版本升至 0.3.0 |
| `packages/memory-engine/pyproject.toml` | 新增 `chromadb>=1.5.0`、`sentence-transformers>=2.3.0` 依赖，提供 `minimal` 可选依赖组 |
| `packages/memory-engine/scripts/test_endpoints.py` | 扩展至 6 项端点测试（新增 `/semantic-index`、`/semantic-search` 含 400 校验） |

### 2.2 vscode-extension（TypeScript）— 8 文件变更

#### ➕ 新增文件

| 文件 | 行数 | 功能 |
|------|------|------|
| `packages/vscode-extension/src/utils/searchSettings.ts` | 70 行 | `SearchSettingsManager`：搜索模式（关键词/语义）持久化到 `~/.remember-me/search-settings.json`，提供 `setMode` / `toggle` / `setSemanticAvailable` |

#### 📝 修改文件

| 文件 | 变更要点 |
|------|----------|
| `packages/vscode-extension/src/utils/engineClient.ts` | 新增 `SemanticSearchResult` 接口、`semanticSearch()`、`buildSemanticIndex()` 方法；503 / 网络异常自动降级为空数组 |
| `packages/vscode-extension/src/extension.ts` | `searchMemory` 重写支持双模式 + QuickPick 结果展示；新增 `toggleSearchMode`、`buildSemanticIndex` 命令；启动时探测语义可用性 |
| `packages/vscode-extension/src/ui/statusBar.ts` | 新增 `searchMode` 状态与 `updateSearchMode`；状态栏图标/tooltip 反映模式（🔍 / 🧠）；快捷菜单新增 2 入口 |
| `packages/vscode-extension/src/memory/storage.ts` | **修复 Windows 目录删除 EPERM**：`delete()` 区分目录/文件，目录用 `fs.rmSync({ recursive: true, force: true })` 递归删除，文件保持 `fs.unlinkSync` |
| `packages/vscode-extension/package.json` | 版本 0.3.0；新增 2 条命令声明 |
| `CHANGELOG.md`（根目录） | v0.3.0 完整变更记录（Keep a Changelog 格式） |

### 2.3 测试文件 — 3 文件变更

| 文件 | 变更 |
|------|------|
| `packages/vscode-extension/src/test/suite/engineClient.test.ts` | +6 测试：`semanticSearch`（成功/503/字段映射/连接失败）+ `buildSemanticIndex`（成功/503） |
| `packages/vscode-extension/src/test/suite/searchSettings.test.ts` | ➕ 新增 +5 测试：默认模式/持久化/toggle/可用性/幂等写入 |
| `packages/vscode-extension/src/test/suite/storage.test.ts` | +2 测试：目录递归删除、不存在路径幂等 |

---

## 三、核心功能详解

### 3.1 语义搜索 MVP 架构

```
VS Code 插件                              memory-engine (Python)
┌─────────────────────┐                   ┌──────────────────────────┐
│ searchMemory 命令   │   HTTP POST       │ /semantic-search 端点     │
│   ↓ 读取 searchMode │ ───────────────►  │   ↓                       │
│ semantic mode →     │   {query,...}     │ VectorIndex.semantic_search│
│ EngineClient.       │ ◄───────────────  │   ↓ ChromaDB cosine query │
│   semanticSearch()  │   results[]       │ sentence-transformers 编码│
│   ↓ 503 → 空数组    │                   │   ↓                       │
│ 回退关键词搜索      │                   │ 返回 Top-K {id,text,score}│
└─────────────────────┘                   └──────────────────────────┘
```

**关键设计决策**：
- **绕过 ChromaDB embedding function 协议**：自行用 `sentence-transformers` 编码，索引时传 `embeddings`、查询时传 `query_embeddings`，规避适配层兼容性问题。
- **懒加载**：模型与 ChromaDB 客户端首次语义请求时初始化，服务启动零延迟；首次查询冷启动 ~7–12s，后续 <20ms。
- **项目隔离**：每个项目对应 `remember_me_{project}` 集合，全局记忆用 `remember_me_global`。
- **优雅降级**：依赖不可用时 503 + `fallback` 字段 → `EngineClient` 返回空数组 + warn → UI 自动回退关键词搜索。

### 3.2 搜索模式切换 UX

- 模式持久化于 `~/.remember-me/search-settings.json`（独立于 `profile.json`）。
- 状态栏实时显示当前模式（🔍 关键词 / 🧠 语义 + tooltip）。
- 关键词无结果 → 提示「试试语义搜索」一键切换。
- 语义无结果 → 提示「回退关键词搜索」或「构建索引」。
- 切到语义前校验服务健康，未运行时警告。

### 3.3 Windows 目录删除 EPERM 修复

**问题**：`fs.unlinkSync` 仅能删文件，删目录在 Windows 下抛 `EPERM` 并残留空子目录。

**解决方案**：`statSync` 判断路径类型：
- 目录 → `fs.rmSync(path, { recursive: true, force: true })`（Node < 14.14 降级 `fs.rmdirSync`）
- 文件 → `fs.unlinkSync(path)`

---

## 四、测试验证结果

### 4.1 TypeScript

```
tsc -p ./
✅ 0 错误 0 警告

node out/test/runner.js
✅ 333 passing（0 failing，0 pending）
   较上轮 320 → +13（semanticSearch 4 + buildSemanticIndex 2 + SearchSettingsManager 5 + 目录删除 2）
```

### 4.2 Python 端点

```bash
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

测试数据：1 个 `profile.json` + 1 个项目（`context.json` + 1 对话）。
- 批量索引：3 条记忆，64ms
- 查询「用户登录认证方式」：召回 1 条，score 0.23，延迟 16ms
- 查询「OAuth」：score 0.43，排名最高，语义相关性正确

---

## 五、已知问题与风险

| 项 | 说明 | 应对措施 |
|----|------|----------|
| 跨语言召回率低 | `all-MiniLM-L6-v2` 中文→英文 Top-5 召回 0/5 | Phase 4.2 评估 `bge-m3` 替换 |
| 模型冷启动延迟 | 首次语义查询 7–12s | UI 提示「正在加载语义模型」；下轮引入服务预加载 |
| 单线程 server | `http.server` 并发瓶颈 | 生产环境迁移 uvicorn + FastAPI |
| CI 首次运行待验证 | `.github/workflows/ci.yml` 已创建（7月15日 02:03），尚未触发 | 推送测试分支验证 |

---

## 六、下轮迭代计划

1. **CI 验证与修复**：触发 GitHub Actions 首次运行，修复 Windows / Ubuntu 双环境矩阵潜在问题。
2. **模型预加载**：服务启动时后台预热模型，消除首次查询 7–12s 冷启动。
3. **Phase 4.2**：评估 `bge-m3` 替换 `all-MiniLM-L6-v2`，提升跨语言召回率。
4. **社交媒体宣发**：Phase 3 v0.3.0 功能亮点推文/帖子，附 CHANGELOG 链接。
5. **GitHub Release v0.3.0**：创建 Release 标签，上传构建产物。

---

**编制时间**: 2026-07-15 08:00 CST  
**状态**: Phase 3 已交付，Phase 4.1 MVP 已完成，全量测试通过
