# Remember Me — 开发迭代计划

**迭代日期**: 2026-07-21（凌晨 02:00 启动）
**计划编制时间**: 2026-07-20 20:00 CST
**迭代类型**: Phase 4.2.1 二轮冲刺（密钥生命周期整合）+ Phase 4.2.2 提前启动（纯本地同步原语）+ CI flaky 修复
**对应 PRD 需求**: `docs/PRD.md` §5.2 Pro 版「云端同步：多设备记忆同步，加密存储」、§7 Phase 4 里程碑「云端同步（Pro 版）」
**预估工时**: 6 小时（单轮迭代，02:00 → 08:00）

---

## 一、当前进度总览（截至 2026-07-20 20:00）

### 1.1 已完成模块

| 阶段 | 模块 | 状态 | 关键交付物 |
|------|------|------|------------|
| Phase 1 MVP | 插件脚手架、JSON 存储、画像/项目/对话管理、6×AI 提供商、23 命令、首次使用向导 | ✅ 完成 | v0.1.0（2026-07-08） |
| Phase 2 核心 | 对话历史自动记录、关键信息提取、手动搜索、更新确认、多项目切换 | ✅ 完成 | v0.2.0（2026-07-10） |
| Phase 3 增强 | 8 场景模板系统、风格一致性检查、智能推荐、版本控制、搜索索引优化、模板市场 | ✅ 完成 | v0.3.0（2026-07-14，GitHub Release 已发布） |
| Phase 4.1 语义搜索 | VectorIndex（ChromaDB + all-MiniLM-L6-v2）、语义/混合搜索端点、搜索 UI 三模式切换 | ✅ 完成 | 端点 8/8；首查延迟 83.5ms |
| Phase 4.2.1 首轮 | `crypto` 包 6 模块：KDF 双路径 / AES-256-GCM / KeyStore 双后端 / BIP39 恢复码 / 异常族；`remember-me-crypto selftest` | ✅ 完成（2026-07-20） | pytest **151/151**；覆盖率 **100%**；Windows Credential Locker 跨进程免密恢复实测通过；CI 8/8 全绿 |
| 质量基线 | mypy --strict 0 错误（11 文件，目标 3.12）；ruff 0 错误；端点 8/8；npm test 333/333；tsc 0 错误 | ✅ 完成 | 2026-07-20 终验 |

### 1.2 待办事项与遗留

| 需求 | 来源 | 当前状态 | 优先级与说明 |
|------|------|----------|--------------|
| **Phase 4.2.1 二轮冲刺** | 07-20 迭代报告 §八 | ⏳ 待启动 | **P0** — manifest HMAC（MK 子密钥已就位）、`.sync/` 目录约定、keystore 与 KDF/恢复码首次绑定流程 |
| **Phase 4.2.2 提前启动** | 路线图 §3.3 / 07-20 迭代报告 §八 | ⏳ 待启动 | **P0** — 4.2.1 窗口余 10 天裕度充足；本轮只做纯本地原语（lamport / manifest / chunker / queue），不接端点、不动 worker 线程 |
| **searchIndexPersistence flaky 修复** | 07-20 CI 事件登记（报告 §七.五） | ⏳ 待修复 | **P1** — Windows 时间精度边界误判索引过期；修复前 main 任何推送均有概率掷骰失败；范式已定（参照 `7c6bd3b`） |
| **社交媒体宣发执行（D2）** | 顺延自 07-19 | ⏳ 素材就绪待发布 | **P1** — 需浏览器登录态（WebBridge），人工窗口执行 |
| **VS Code 三模式搜索手动验证（D3）** | 顺延自 07-18 | ⏳ 待人工 | **P1** — 已连续顺延两轮，建议优先安排人工窗口 |
| **误提交临时文件清理** | 本轮盘点新发现 | ⏳ 待清理 | **P2** — `packages/vscode-extension/src/extension.ts.new`（0 字节）与 `fix-ext2.js`（一次性修复脚本）已被 git 跟踪，确认无引用后移除 |
| 仓库开启 Discussions | 07-19 日报 | ⏳ 可选 | **P2** — Release 反馈帖暂以 Issues 代替 |

---

## 二、本次迭代目标

> **目标**：完成 Phase 4.2.1 收官——落地 `.sync/` 目录约定、首次绑定/解锁流程（passphrase → 主密钥 → 托管/恢复码）与 manifest HMAC 完整性原语；并按路线图 §3.3 提前启动 Phase 4.2.2 的四个纯本地同步原语（Lamport 时钟 / FileVersion 清单 / 4KB 块级哈希树 / 离线队列），配齐测试与静态检查。同步修复已登记的 `searchIndexPersistence` CI flaky。将云端同步从「加密层核心可验收」推进到「同步协议本地原语就绪」。

**范围约束**：
1. 引擎侧（`packages/memory-engine`）为主，**不触网**（除依赖安装与 git 推送）；同步 worker 线程、`server.py` 端点、冲突策略引擎、云端适配器**不在本轮范围**（属 4.2.2 正式窗口与 4.2.3）；
2. 插件侧唯一改动为 D1 flaky 修复（小范围、有既定范式），其余插件代码不动；
3. 严格沿用既定架构：`docs/design/cloud-sync-architecture-2026-07-16.md` §3.2/§3.4 与路线图 §3.3 交付物定义。

---

## 三、开发任务明细

### 任务组 A：Phase 4.2.1 二轮冲刺 —— 密钥生命周期整合（优先级 P0）

#### A1. `.sync/` 目录约定与同步配置基座 `sync/paths.py` + `sync/config.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/`（新建包）
- **任务描述**:
  1. 新建 `sync/__init__.py` 包骨架，导出公共 API 占位；`SyncError` 异常族自 `crypto/errors.py` 既有起点扩展
  2. `paths.py`：统一同步产物落点 `{data_dir}/.sync/`（`manifest.json` / `config.json` / `queue/` / `keystore.enc`），路径解析复用 `cli.py` 的 `_data_dir()` / `REMEMBER_ME_DATA_DIR` 环境变量约定（测试隔离零成本）；`.backups/`、`templates/` 不纳入同步范围的约定写入 docstring（路线图 §5.1）
  3. `config.py`：`.sync/config.json` 读写——`deviceId`（首次启动生成 UUID4）、`sync.enabled`、`kdf.method`、`kdf.salt`（hex）等字段；同目录临时文件 + `os.replace` 原子写（沿用 `FileKeyStore` 先例）
- **预期产出**:
  - `sync/__init__.py` / `paths.py` / `config.py`（含类型注解，满足 mypy --strict）
  - 目录约定文档字符串 + config round-trip 冒烟

#### A2. 首次绑定与解锁流程 `crypto/bootstrap.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/crypto/bootstrap.py`
- **任务描述**:
  1. **首次启用**：`bootstrap_first_run(passphrase, data_dir=None)` → `derive_master_key_auto` 派生主密钥 → `method` 与 `salt` 持久化至 `.sync/config.json`（07-20 决策记录 3 既定：method 必须持久化否则他端无法复现）→ `get_keystore().store(master_key)` → `generate_recovery()` 返回 12 词恢复码；结构化返回 `BootstrapResult`（含 `downgraded` 标记供上层提示，恢复码仅经返回值出层、绝不落盘/记日志）
  2. **常规解锁**：`unlock(passphrase=None, data_dir=None)` → keystore.load 优先；无条目/后端不可用 → 口令经持久化的 method+salt 重派生（`derive_master_key`，绝不暗中换法）→ 重新托管
  3. **恢复码重建**：`unlock_with_recovery(words, data_dir=None)` → `from_recovery_code` 重建主密钥 → 重新托管并返回成功标记
  4. 日志红线沿用 `recovery.py`：绝不打印恢复码/主密钥内容（含指纹）
- **预期产出**:
  - `bootstrap.py` 三流程实现
  - 首启 → 解锁 → 恢复码重建的全链路自证（主密钥逐字节一致）

#### A3. manifest HMAC 完整性原语 `sync/manifest_mac.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/manifest_mac.py`
- **任务描述**:
  1. 基于 `derive_subkeys` 的 MK 子密钥：manifest 序列化字节 → HMAC-SHA256 附加存储（`manifest.json` 与 `manifest.json.sig` 分离，或内嵌字段，选型写入 docstring 理由）
  2. `write_manifest_mac(data, mk)` / `verify_manifest_mac(data, mk)`；校验失败抛 `SyncError` 中文友好提示
  3. 「损坏即按全新设备重建」语义原语：校验失败 → 返回 `ManifestCorrupted` 状态标记 + 备份损坏文件至 `.sync/corrupted-{ts}/` 后重建空清单（路线图 §6 风险表既定方针；全量冲突比对属 4.2.2，本轮只留接口占位）
- **预期产出**:
  - `manifest_mac.py`（签名/验签/损坏处置三函数）
  - 篡改必检出、损坏可重建的自证测试

---

### 任务组 B：Phase 4.2.2 提前启动 —— 纯本地同步原语（优先级 P0，不触网）

#### B1. Lamport 时钟 `sync/lamport.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/lamport.py`
- **任务描述**:
  1. `LamportClock`：`tick()`（本地事件 +1）/ `merge(remote)`（取 max+1）；`deviceId` 自 config 注入
  2. `(lamport, deviceId)` 字典序比较函数 `happens_before(a, b)` / `compare(a, b)`，语义 100% 对齐架构 §3.2
  3. 时钟值持久化集成 A1 config（`lamport` 字段），防进程重启回退
- **预期产出**: `lamport.py` + 收敛性说明（双时钟交错合并最终一致）

#### B2. FileVersion 清单 `sync/manifest.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/manifest.py`
- **任务描述**:
  1. `FileVersion` dataclass：`filepath / lamport / deviceId / contentHash / modifiedAt`（字段与架构 §3.2 逐项对齐，frozen + 类型注解）
  2. `Manifest`：清单读写（`.sync/manifest.json`）+ `diff(local, remote)` 计算（新增/变更/冲突/伪冲突四分；伪冲突 = contentHash 相同但时间戳不同，架构 §3.2）
  3. 读写全程经 A3 HMAC 保护；损坏走 A3 既定处置
  4. 扫描数据源约定：枚举 `profile.json`、`projects/*/context.json`、`projects/*/conversations/*.json`、`search-settings.json`（架构 §2.2 加密粒度表）
- **预期产出**: `manifest.py`（FileVersion / Manifest / diff 三件套）

#### B3. 4KB 块级哈希树 `sync/chunker.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/chunker.py`
- **任务描述**:
  1. 文件 → 4KB 块序列 → 逐块 SHA-256 → 块哈希列表 + 整文件根哈希（架构 §3.4）
  2. `changed_chunks(local_hashes, remote_hashes)`：变更块索引识别，供增量上传只传变更块
  3. 边界：空文件、不足 4KB、非 4KB 整数倍尾块；流式读取支持 ≥1MB 大文件
- **预期产出**: `chunker.py`（哈希树 + 变更识别）

#### B4. 离线队列 `sync/queue.py`
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/src/memory_engine/sync/queue.py`
- **任务描述**:
  1. `.sync/queue/*.json`（JSONL 追加，延续透明 JSON 哲学）：`enqueue(change)` / `peek()` / `replay()` FIFO 重放 / `depth()`
  2. 容量上限 500 条：超限合并同文件变更（同一路径只留最新版本），触发告警日志且不崩溃、不丢最新变更（路线图 §6 既定）
  3. 进程内锁保证追加原子性；进程强杀后队列文件可续（损坏行跳过 + 告警）
- **预期产出**: `queue.py`（入队/重放/上限行为）

---

### 任务组 C：质量验证（优先级 P0）

#### C1. `tests/sync/` 测试套件
- **优先级**: P0 🔴
- **负责模块**: `packages/memory-engine/tests/sync/`
- **任务描述**:
  1. **bootstrap**：首启/常规解锁/恢复码重建矩阵；keyring 不可用自动降级 FileKeyStore；method+salt 持久化后跨进程重派生逐字节一致
  2. **manifest HMAC**：1 bit 篡改必检出；损坏文件备份 + 空清单重建；MK 域分离（DEK 无法验签）
  3. **Lamport**：双时钟交错 merge 收敛；字典序平局 deviceId 决胜；持久化重启不回退
  4. **manifest diff**：新增/变更/冲突/伪冲突四分矩阵
  5. **chunker**：1MB 文件二次哈希仅尾部变更 → 变更块数 < 总块数 20%（路线图 4.2.2 验收标准 4 的本地原语版断言）；边界三例
  6. **queue**：50 文件入队 FIFO 重放无丢失无重复（验收标准 2 原语版）；500 上限同路径合并；损坏行容错
  7. 覆盖率目标：sync 包 ≥ 85%（路线图 §3.3 验收标准 6）；bootstrap 所在 crypto 包整体不跌破既有 100% 基线（新增代码全覆盖）
- **预期产出**:
  - `pytest tests/sync/` 全绿记录 + 覆盖率数据（写入迭代报告）

#### C2. 静态检查与既有基线回归
- **优先级**: P0 🔴
- **负责模块**: 全仓
- **任务描述**:
  1. `mypy --strict` 0 错误（含新增 sync 包与 bootstrap.py）；`ruff check` 0 错误
  2. 既有基线不回退：`pytest tests/crypto/` 151/151；`scripts/test_endpoints.py` 8/8；npm test 333/333 + D1 修复增量；tsc 0 错误
  3. 按 CONTRIBUTING 迭代收尾规则：提交并推送 main，观察 CI（3.12 腿必绿；3.14 金丝雀腿沿既定条件化通道）
  4. CI 补丁评估：`tests/sync/` 纳入 CI Python 腿 pytest 步骤（沿用 `becf80e` 条件化先例，无需新通道）
- **预期产出**:
  - mypy / ruff 零错误日志；回归确认记录；推送记录 + CI 运行结果

---

### 任务组 D：质量修复与发布收尾遗留（优先级 P1）

#### D1. `searchIndexPersistence` flaky 修复（插件侧，已登记）
- **优先级**: P1 🟡
- **负责模块**: `packages/vscode-extension/src/utils/searchIndex.ts` + `src/test/suite/searchIndexPersistence.test.ts`
- **任务描述**:
  1. 病灶已定位（07-20 定性）：`save()` 写 `updatedAt: new Date().toISOString()`（`searchIndex.ts:441`），`load()` 以「源文件 mtime > updatedAt」判过期（`searchIndex.ts:494`），Windows runner 毫秒精度边界误判
  2. 修复二选一（参照 `7c6bd3b` profile.ts 单调性范式）：`save()` 的 `updatedAt` 取「不早于最晚源文件 mtime」；或 `load()` 比较加 ≥1ms 容差。选型理由写入提交信息
  3. 该用例连跑 3 次验证 + npm test 全量 333+ 回归
- **预期产出**: 修复补丁 + 3 次连跑记录；main 推送不再掷骰

#### D2. 社交媒体宣发执行（顺延，人工窗口）
- **优先级**: P1 🟡
- **负责模块**: 运营 / `docs/demo/social-media-2026-07-15.md`
- **任务描述**: 按已备素材发布 ≥3 平台（X 中文 / 即刻 / 小红书），需浏览器登录态（WebBridge）；发布链接回写素材文档「发布记录」表
- **预期产出**: ≥3 平台实际发布链接 + 素材文档更新（凌晨自动化会话不执行，标记待人工）

#### D3. VS Code 三模式搜索手动验证（顺延，人工窗口）
- **优先级**: P1 🟡（已连续顺延两轮，建议优先安排）
- **负责模块**: `packages/vscode-extension` UI
- **任务描述**: 状态栏预热提示过渡、关键词/语义/混合三模式切换与持久化、混合结果 `🔍🧠` 前缀确认
- **预期产出**: 手动验证记录（写入日报，凌晨自动化会话不执行，标记待人工）

---

### 任务组 E：仓库卫生与迭代闭环（优先级 P2）

#### E1. 误提交临时文件清理
- **优先级**: P2 🟢
- **负责模块**: `packages/vscode-extension/src/`
- **任务描述**: `extension.ts.new`（0 字节）与 `fix-ext2.js`（一次性修复脚本）已被 git 跟踪，全仓检索确认无引用后 `git rm`；检查是否需补 `.gitignore` 规则防复发
- **预期产出**: 清理提交（确认 tsc / npm test 不受影响）

#### E2. 迭代报告 + CHANGELOG + 推送
- **优先级**: P2 🟢
- **负责模块**: `reports/` + `CHANGELOG.md` + git
- **任务描述**:
  1. `reports/iteration-2026-07-21.md`：任务对照表、tests/sync 验收数据、覆盖率、CI 结论
  2. `reports/daily-2026-07-21.md` + `daily-2026-07-21-detailed.md`（含 D1 修复记录、D2/D3 状态、下一步行动）
  3. `CHANGELOG.md` `[0.4.0-alpha]` 章节增补：4.2.1 二轮交付 + 4.2.2 原语先行
  4. 按迭代收尾规则推送 main 并观察 CI
- **预期产出**: 3 份报告 + CHANGELOG 条目 + 推送记录

---

## 四、任务优先级矩阵

```
           紧急程度
           高 ←————————→ 低
           ┌─────────┬─────────┐
     高   │ A1 A2   │   D1    │
     重   │ A3 B1   │   D2    │
     要   │ B2 B3   │   D3    │
     性   │ B4 C1   │  (P1)   │
           │ C2 (P0) │         │
           ├─────────┼─────────┤
     低   │   —     │ E1 E2   │
           │         │  (P2)   │
           └─────────┴─────────┘
```

注：D1 虽为 P1，但其修复前 main 上任何提交均有概率触发 CI 掷骰失败，建议与 A 组并行尽早落地（改动小、范式既定）。

---

## 五、执行顺序建议（时间线）

```
02:00 ─┬─ 环境盘点：git status + .venv 确认 + 回顾 07-20 迭代报告「下轮建议」
       │
02:10 ─┬─ 【并行】主线：【A1】sync 包骨架 + .sync/ 目录约定 + config 基座
       │        副线：【D1】searchIndexPersistence flaky 修复 + 连跑 3 次（插件侧独立改动）
       │
02:50 ─┬─ 【A2】crypto/bootstrap.py 首启/解锁/恢复码三流程
       │
03:40 ─┬─ 【A3】manifest HMAC 签名/验签/损坏处置
       │
04:10 ─┬─ 【B1】lamport.py + 【B2】manifest.py（FileVersion/diff，集成 A3）
       │
05:00 ─┬─ 【B3】chunker.py 4KB 哈希树 + 变更识别
       │
05:40 ─┬─ 【B4】queue.py 离线队列 + 上限合并
       │
06:20 ─┬─ 【C1】tests/sync/ 六组测试 + 覆盖率 ≥85%
       │
07:10 ─┬─ 【C2】mypy --strict / ruff / crypto 151 回归 / 端点 8/8 / npm 333+ / tsc
       │
07:30 ─┬─ 【E1】临时文件清理提交；【D2/D3】标记待人工写入日报
       │
07:40 ─┬─ 【E2】迭代报告 ×3 + CHANGELOG 增补 + 推送 main + CI 观察
       │
08:00 ── 迭代结束，最终检查（git diff + 测试确认 + CI 绿钩）
```

---

## 六、验收标准

| 检查项 | 标准 | 验证方式 |
|--------|------|----------|
| A1 目录约定 | `.sync/` 产物统一落点；`REMEMBER_ME_DATA_DIR` 隔离可用；config 原子写 round-trip | pytest |
| A2 绑定流程 | 首启 → 解锁 → 恢复码重建主密钥逐字节一致；method+salt 持久化；keyring 不可用自动降级 | pytest 矩阵 |
| A3 manifest HMAC | 1 bit 篡改必检出；损坏备份 + 空清单重建；恢复码/主密钥零日志 | pytest |
| B1 Lamport | 双时钟交错 merge 收敛一致；字典序平局 deviceId 决胜；重启不回退 | pytest |
| B2 清单 diff | 新增/变更/冲突/伪冲突四分矩阵全过；字段与架构 §3.2 逐项对齐 | pytest |
| B3 chunker | 1MB 文件尾部变更 → 变更块 < 总块 20%；空文件/不足 4KB/尾块边界正确 | pytest |
| B4 队列 | 50 文件 FIFO 重放无丢失无重复；500 上限同路径合并 + 告警；损坏行容错 | pytest |
| C1 覆盖率 | sync 包 ≥ 85%；crypto 包新增代码不跌破 100% 基线 | pytest-cov |
| C2 质量 | mypy --strict 0 错误；ruff 0 错误；crypto 151/151、端点 8/8、npm 333+、tsc 不回退 | 命令行 |
| D1 flaky | 修复后该用例连跑 3 次全绿；npm test 全量不回退 | npm test |
| D2 宣发 | ≥3 平台发布，链接回写素材文档（待人工窗口） | 平台链接 |
| D3 手动验证 | 三模式切换 + 预热提示 + 🔍🧠 前缀确认（待人工窗口） | 人工记录 |
| E1 清理 | 临时文件移除，tsc / npm test 不受影响 | git + 命令行 |
| E2 报告 | 3 份报告 + CHANGELOG 条目 + 推送完成 + CI 绿钩 | 文档审查 |

---

## 七、风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 范围蔓延：4.2.2 提前启动部分越界做端点/worker | 中 | 单轮做不完、验收失焦 | 范围约束硬性卡死：本轮仅四个纯本地原语 + 测试，端点/worker/冲突引擎留 4.2.2 正式窗口；A 组（4.2.1 收官）优先级高于 B 组，挤压时保 A 弃 B4 |
| 凌晨非交互会话 keyring 行为与桌面不一致 | 低 | A2 测试受阻 | 07-20 已实证 `WinVaultKeyring` 凌晨可用；仍保留 skipif + FileKeyStore 降级双通道（既有先例） |
| manifest HMAC 与 FileKeyStore 的 MK 使用域冲突 | 低 | 设计返工 | HKDF info 域分离已固定（`remember-me:mk:v1`）；manifest 验签独立调用，不复用 keystore 内部密文 |
| 队列 JSONL 并发追加撕裂 | 低 | B4 正确性 | 进程内锁 + 单行追加；损坏行跳过 + 告警（测试覆盖） |
| D1 插件侧修复引入新时序问题 | 低 | npm 回归失败 | 范式与 `7c6bd3b` 同款；连跑 3 次 + 全量回归把关；改动单独提交便于回退 |
| CI Python 3.14 金丝雀腿缺 sync 轮子 | 中 | CI 黄灯 | 既定条件化通道（`becf80e`）自动生效，tests/sync 纯本地无新增依赖、预期全腿可跑 |
| 单轮 6h 做不完 A+B+C | 中 | 任务挤压 | 保底顺序 A1→A2→A3→B1→B2→C1（4.2.1 收官 + 清单核心）→ B3 → B4 → C2 → D/E；06:30 B4 未启动则顺延下轮 |

---

## 八、相关文档与代码入口

- **PRD 需求**: `docs/PRD.md`（§5.2 Pro 版云端同步、§7 Phase 4 里程碑）
- **Phase 4.2 路线图**: `docs/design/cloud-sync-roadmap-2026-07-18.md`（§3.2 里程碑 4.2.1、§3.3 里程碑 4.2.2、§6 风险表）⭐ 本轮直接依据
- **架构依据**: `docs/design/cloud-sync-architecture-2026-07-16.md`（§2.2 加密粒度、§3.2 Lamport/FileVersion、§3.4 增量同步）
- **上轮计划/报告**: `plan/iteration-2026-07-20.md`、`reports/iteration-2026-07-20.md`（§八 下轮建议）、`reports/daily-2026-07-20-morning.md`
- **既有代码**:
  - `packages/memory-engine/src/memory_engine/crypto/`（kdf `derive_master_key_auto`/`derive_subkeys`、keystore `get_keystore`、recovery `from_recovery_code`、errors `SyncError` 起点）
  - `packages/memory-engine/src/memory_engine/cli.py`（`_data_dir()` / `DEFAULT_DATA_DIR` / `REMEMBER_ME_DATA_DIR`）
  - `packages/memory-engine/src/memory_engine/server.py`（`_shutdown_event` / `_preload_vector_index` 线程范式，本轮不用、下轮用）
  - `packages/vscode-extension/src/utils/searchIndex.ts`（D1 病灶行 441/494）与 `src/memory/profile.ts`（`7c6bd3b` 单调性范式）
- **工程配置**: `packages/memory-engine/pyproject.toml`（sync/dev 分组、mypy/ruff 3.12）
- **推送规则**: `docs/CONTRIBUTING.md`「迭代收尾规则」
- **仓库**: https://github.com/ltgkb/remember-me（v0.3.0 已发布，main 最新 `8ea5f32`）

---

**计划版本**: v1.0
**编制者**: 迭代计划系统
**最后更新**: 2026-07-20 20:00 CST
