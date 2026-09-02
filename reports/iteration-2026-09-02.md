# Remember Me 全面审查与优化迭代报告

日期：2026-09-02  
分支：`codex/comprehensive-review-iteration`  
版本：VS Code 扩展 `0.4.0-alpha.1`；Python 引擎 `0.4.0a1`

## 结论

项目已有较扎实的单元测试和清晰的本地优先方向，但审查前的主分支仍属于“功能演示可用、发布与安全闭环不足”：核心对话没有从真实入口写入历史；本地服务暴露浏览器跨域与路径边界；最新 CI 被清理工作流取消；GitHub Release 没有 VSIX，Marketplace 也未发布。

本轮优先修复真实用户链路、安全边界和可交付性，没有继续扩张尚未接入产品入口的云同步功能。

## 关键发现与处置

| 优先级 | 发现 | 处置 |
|---|---|---|
| P0 | `startChat` 生成回答后没有保存对话，核心记忆闭环未发生 | 自动保存问答、提取洞察并即时更新索引 |
| P0 | 同日同标题对话使用相同文件名，会静默覆盖 | 文件名增加唯一后缀并补回归测试 |
| P0 | localhost 服务允许 `Access-Control-Allow-Origin: *`，备份与项目路径缺少完整边界 | 拒绝浏览器 Origin；限制路径、请求体、查询长度与结果数 |
| P0 | 项目关键词搜索使用 `{data_dir}/{project}`，与实际 `{data_dir}/projects/{project}` 不一致 | 统一安全归一化并修复搜索根目录 |
| P1 | JSON 直接覆盖写，进程中断可留下半文件；存储 API 可被 `..` 或符号链接带出根目录 | 原子写、`0600` 权限、三层路径约束 |
| P1 | API 密钥存于 `settings.json`；架构文档声称 SecretStorage 但代码未实现 | SecretStorage 命令与自动迁移 |
| P1 | `modelName`、`memoryPath` 配置存在但未真正生效 | 接入 Provider 与存储初始化 |
| P1 | AI 初始化每次调用 `models.list()`，部分兼容提供商不支持且增加延迟 | 改为本地配置检查，真实聊天请求负责连通性验证 |
| P1 | 最新 HEAD 的 CI 被自动清理任务主动取消 | 清理仅允许手动触发，不取消任何运行 |
| P1 | Release 无 VSIX、缺 LICENSE、扩展包不可复现交付 | CI/Tag 打包链、MIT LICENSE、包元数据与 README |
| P2 | VSIX 含 2008 个文件和完整依赖/测试产物 | esbuild 单文件 bundle + `.vscodeignore` |
| P2 | 多个 Webview 无 CSP | 基础 Webview 统一 nonce CSP |

## 验证证据

- TypeScript：`npm test`，342 项通过。
- Node 生产依赖：`npm audit --omit=dev`，0 个已知漏洞（基线检查）。
- Python：`pytest tests -q`，397 项通过。
- Python 静态检查：Ruff 通过；Mypy strict 对 21 个源文件通过。
- HTTP：真实启动 `memory_engine.server`，8 组端点测试通过；无语义依赖时按设计返回 503 并保留关键词能力。
- VSIX：真实打包成功，约 202 KB / 6 文件；包内仅 manifest、元数据、许可证、README 与单一 extension bundle。

## 尚未宣称完成

- 尚未使用真实 DeepSeek/Qwen 等密钥执行云端问答，因此不宣称所有提供商当前 API 兼容性已实测。
- 尚未在 Extension Development Host 中完成全流程人工 UI 验收；单元、类型、包结构和核心数据链已验证。
- 语义搜索仍使用 `all-MiniLM-L6-v2`，中英跨语言召回限制仍在。
- 云同步目前主要是加密与本地协议原语，缺少云端适配器、冲突 UI 和生产级端到端验证。
- 当前未发布到 VS Code Marketplace；本轮建立的是可复现 VSIX 与后续 Release 自动附加能力。
- 用户记忆 JSON 默认是本地明文；SecretStorage 只保护 API 密钥，同步加密层不等于本地静态数据全盘加密。

## 下一轮建议

1. 在 macOS/Windows 的 Extension Development Host 各跑一次“首次设置 → 安全设置密钥/本地模型 → 对话 → 历史 → 搜索 → 重启恢复”。
2. 用真实提供商做匹配问题的流式响应、错误提示、超时和模型名兼容性测试。
3. CI 多平台绿灯后发布 `v0.4.0-alpha.1` GitHub Release，再决定是否提交 Marketplace。
4. 暂缓新增同步功能，先为数据导出/删除、隐私告知、诊断页和故障恢复补产品化入口。
