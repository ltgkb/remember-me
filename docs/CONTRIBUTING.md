# 贡献指南

感谢你对 Remember Me 项目的关注！我们欢迎所有形式的贡献，包括但不限于：

- 提交 Bug 报告
- 提出新功能建议
- 改进文档
- 提交代码修复或新功能
- 分享使用经验和模板

---

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [开发文档](#开发文档)
- [发布流程](#发布流程)

---

## 行为准则

- 尊重每一位贡献者，保持友善和专业的交流
- 接受建设性批评，以改进项目为目标
- 关注社区共同利益

---

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请通过 [GitHub Issues](https://github.com/remember-me-team/remember-me/issues) 提交，并包含以下信息：

1. **问题描述**：清晰描述 Bug 的表现
2. **复现步骤**：一步一步说明如何复现
3. **期望行为**：说明你认为正确的行为应该是什么
4. **实际行为**：说明实际发生了什么
5. **环境信息**：
   - VS Code 版本
   - 插件版本
   - 操作系统
6. **截图或录屏**（如适用）
7. **日志**：输出面板 > Remember Me 的相关日志

### 提出新功能

如果你有新功能建议，请：

1. 先在 Issues 中搜索，确认没有重复的建议
2. 创建新 Issue，选择 "Feature Request" 模板
3. 详细描述功能的使用场景和价值
4. 如果可能，提供 mockup 或示例

### 改进文档

文档改进可以直接提交 Pull Request，或先创建 Issue 讨论。

---

## 开发环境搭建

### 前置要求

| 软件 | 版本 | 用途 |
|------|------|------|
| VS Code | ≥ 1.85.0 | 开发环境 |
| Node.js | ≥ 18.0.0 | 构建工具 |
| Git | 最新版 | 版本控制 |

### 克隆与安装

```bash
# 1. Fork 仓库（在 GitHub 上点击 Fork 按钮）

# 2. 克隆你的 Fork
git clone https://github.com/YOUR_USERNAME/remember-me.git
cd remember-me

# 3. 进入插件目录
cd packages/vscode-extension

# 4. 安装依赖
npm install

# 5. 编译
npm run compile
```

### 启动开发模式

```bash
# 方式一：监听文件变化自动编译
npm run watch

# 方式二：手动编译
npm run compile
```

### 调试插件

1. 在 VS Code 中打开 `packages/vscode-extension` 文件夹
2. 按 `F5` 或点击左侧调试图标启动 **Extension Development Host**
3. 在新窗口中测试插件功能
4. 在原始窗口的调试控制台中查看日志

---

## 代码规范

### TypeScript 规范

本项目使用 TypeScript 严格模式，请遵循以下规范：

#### 1. 文件头部注释

每个文件顶部应包含文件说明注释：

```typescript
/**
 * Remember Me - {模块名称}
 * {一句话描述模块职责}
 */
```

#### 2. 函数注释

公共函数必须添加 JSDoc 注释：

```typescript
/**
 * 构建完整的记忆注入 Markdown Prompt
 * @param profile - 用户画像
 * @param project - 当前项目上下文（可选）
 * @returns 格式化后的 Prompt 字符串
 */
build(profile: Profile, project?: ProjectContext): string { ... }
```

#### 3. 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `JsonStorage`, `PromptBuilder` |
| 接口名 | PascalCase | `Profile`, `ProjectContext` |
| 函数/方法 | camelCase | `buildMemoryPrompt`, `getStorage` |
| 变量 | camelCase | `storageInstance`, `currentProject` |
| 常量 | UPPER_SNAKE_CASE | `MAX_BACKUP_COUNT` |
| 文件 | kebab-case | `prompt-builder.ts`, `settings-panel.ts` |

#### 4. 类型安全

- 严禁使用 `any` 类型
- 优先使用 `unknown` 并进行类型守卫
- 函数参数和返回值必须标注类型
- 使用 `strict: true` 模式

#### 5. 错误处理

```typescript
// 推荐：明确处理错误
try {
  const data = JSON.parse(content);
  return data as T;
} catch (error) {
  console.error(`[RememberMe] 读取文件失败: ${filePath}`, error);
  return null;
}

// 推荐：使用 void 处理不关心的 Promise
void vscode.window.showInformationMessage('记忆已刷新');
```

#### 6. 代码组织

```typescript
// 导入分组：外部库 > VS Code API > 内部模块 > 类型
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getStorage } from './memory/storage';
import type { Profile, ProjectContext } from './types';

// 模块级变量
let storageInstance: JsonStorage | null = null;

// 导出函数/类
export function activate(context: vscode.ExtensionContext): void { ... }

// 内部辅助函数
function checkFirstRun(context: vscode.ExtensionContext): Promise<void> { ... }
```

### 代码风格检查

提交前请确保代码通过 TypeScript 编译：

```bash
npm run compile
```

---

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

### 提交格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型说明

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 仅文档修改 |
| `style` | 代码格式修改（不影响功能） |
| `refactor` | 代码重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建过程或辅助工具的变动 |

### 示例

```bash
# 新功能
feat(memory): 添加对话历史搜索功能

# Bug 修复
fix(ui): 修复设置面板在暗色主题下的显示问题

# 文档
docs(readme): 更新安装指南

# 重构
refactor(storage): 优化 JSON 读写性能
```

---

## Pull Request 流程

### 1. 创建分支

从 `main` 分支创建功能分支：

```bash
git checkout -b feat/your-feature-name
# 或
git checkout -b fix/issue-description
```

### 2. 开发与提交

```bash
# 修改代码...

# 编译验证
npm run compile

# 提交
git add .
git commit -m "feat(scope): 描述"
```

### 3. 同步上游

```bash
git remote add upstream https://github.com/remember-me-team/remember-me.git
git fetch upstream
git rebase upstream/main
```

### 4. 推送并创建 PR

```bash
git push origin feat/your-feature-name
```

然后在 GitHub 上创建 Pull Request，请确保：

- [ ] PR 标题遵循提交规范
- [ ] 描述清楚说明改动内容和原因
- [ ] 关联相关 Issue（如有）
- [ ] 代码通过编译无错误
- [ ] 新增功能包含基本测试（如适用）

### 5. 代码审查

维护者会审查你的 PR，可能需要你进行修改。请保持耐心并及时响应反馈。

---

## 开发文档

### 模块职责

| 模块 | 路径 | 职责 |
|------|------|------|
| 入口 | `src/extension.ts` | 插件激活、命令注册、生命周期管理 |
| 类型 | `src/types.ts` | 全项目共享的 TypeScript 接口 |
| 存储 | `src/memory/storage.ts` | JSON 文件读写、目录管理、版本备份 |
| 画像 | `src/memory/profile.ts` | 用户画像 CRUD、Prompt 生成 |
| 项目 | `src/memory/project.ts` | 项目上下文管理、决策/术语/竞品 |
| 对话 | `src/memory/conversation.ts` | 对话历史记录、搜索、筛选 |
| AI 工厂 | `src/ai/provider.ts` | Provider 工厂、配置验证 |
| AI 基类 | `src/ai/base-openai.ts` | OpenAI 兼容 API 的流式对话封装 |
| AI 适配器 | `src/ai/*.ts` | 各提供商的具体适配 |
| 状态栏 | `src/ui/statusBar.ts` | 状态栏 UI、记忆提示、菜单 |
| 侧边栏 | `src/ui/sidebarProvider.ts` | Activity Bar 树形数据 |
| Webview | `src/ui/webview/*.ts` | 设置面板、向导、记忆编辑器 |
| Prompt | `src/utils/promptBuilder.ts` | 记忆注入 Prompt 构建 |

### 添加新的 AI 提供商

1. 在 `src/ai/` 下创建新的适配器文件，如 `moonshot.ts`
2. 继承 `BaseOpenAIProvider` 或实现 `AIProvider` 接口
3. 在 `src/ai/provider.ts` 的工厂方法中注册
4. 更新 `package.json` 的 `rememberMe.aiProvider` 枚举值
5. 添加单元测试

### 添加新的 Webview 面板

1. 继承 `BaseWebview` 类
2. 实现 `getHtmlContent()` 方法返回 HTML 字符串
3. 处理消息通信（`postMessage` / `onDidReceiveMessage`）
4. 在 `extension.ts` 中注册命令

---

## 发布流程

### 版本号规则

遵循 [SemVer](https://semver.org/)：
- `MAJOR`：不兼容的 API 修改
- `MINOR`：向下兼容的功能新增
- `PATCH`：向下兼容的问题修复

### 发布步骤（维护者）

1. 更新 `package.json` 中的版本号
2. 更新 `CHANGELOG.md`
3. 创建标签：`git tag -a v0.1.0 -m "Release v0.1.0"`
4. 推送标签：`git push origin v0.1.0`
5. 在 GitHub 上创建 Release
6. 打包并上传 `.vsix`：
   ```bash
   cd packages/vscode-extension
   vsce package
   ```
7. 提交到 VS Code 扩展市场（如适用）

---

## 获取帮助

如果你在贡献过程中遇到问题：

1. 查看本指南和 [README](../README.md)
2. 查看 [架构文档](ARCHITECTURE.md)
3. 在 [GitHub Discussions](https://github.com/remember-me-team/remember-me/discussions) 提问
4. 联系维护者团队

再次感谢你的贡献！🧠
