# Phase 3 功能截图清单

> 本目录用于存放 Phase 3 功能演示截图。所有截图均为占位符说明，实际截图请在 VS Code Extension Host 中按以下指引截取。

---

## 截图规范

- **分辨率**: 建议 1920×1080 或更高，截图区域宽度 ≥ 1200px
- **格式**: PNG（无损）
- **命名规则**: `{序号}-{功能英文名}.png`，例如 `01-onboarding-wizard.png`
- **标注**: 关键交互区域用红色矩形框标注（可使用 ShareX / Snipaste 标注工具）
- **主题**: 优先使用 VS Code 默认深色主题，确保文字清晰可读

---

## 截图列表（10 张）

| 序号 | 文件名 | 对应功能 | 截取指引 |
|------|--------|----------|----------|
| 01 | `01-onboarding-wizard.png` | 首次使用向导 | 删除 `~/.remember-me/profile.json` 后重启 Extension Host，截取欢迎提示与第 1 步问卷 |
| 02 | `02-status-bar-activated.png` | 状态栏记忆激活 | 完成 Onboarding 后，截取底部状态栏显示 `🧠 B端SaaS产品经理 \| 项目：TeamFlow` |
| 03 | `03-start-chat-prompt.png` | 开始对话与 Prompt 注入 | 执行「开始对话」命令后，截取注入的记忆 Prompt 文档与 AI 流式响应 |
| 04 | `04-template-quickpick.png` | 模板系统 | 按 `Ctrl+Shift+P` 执行 `Remember Me: 选择模板`，截取 QuickPick 列表（8 个内置模板） |
| 05 | `05-smart-recommendation.png` | 智能推荐记忆 | 在文档中输入「登录功能」后，截取状态栏或侧边栏弹出的 💡 相关记忆推荐 |
| 06 | `06-style-check-fix.png` | 风格一致性检查 | 打开一份缺少 MoSCoW 优先级的 Markdown PRD，执行 `Remember Me: 自动修复风格` 前后的对比（可拼接为一张） |
| 07 | `07-version-control-panel.png` | 记忆版本控制 | 执行 `Remember Me: 打开版本控制`，截取 Webview 面板中的备份列表、JSON 预览与回滚按钮 |
| 08 | `08-search-memory-results.png` | 搜索记忆 | 执行 `Remember Me: 搜索记忆`，输入关键词「OAuth」，截取结果列表（含高亮片段） |
| 09 | `09-template-market.png` | 社区模板市场 | 执行 `Remember Me: 管理模板`，截取模板统计信息（内置 8 + 自定义 N） |
| 10 | `10-memory-editor.png` | 记忆编辑器 | 执行 `Remember Me: 打开记忆编辑器`，截取可视化记忆编辑面板（三标签页：画像 / 项目 / 风格） |

---

## 截图在文档中的引用

上述截图在 `docs/PHASE3_DEMO.md` 中有对应引用锚点，请按编号替换占位符路径：

```markdown
![01-首次使用向导](docs/demo/screenshots/01-onboarding-wizard.png)
![02-状态栏记忆激活](docs/demo/screenshots/02-status-bar-activated.png)
...
```

---

**最后更新**: 2026-07-14
**负责子代理**: UI 界面与文档
