# 🧠 Remember Me — AI 记忆管家

> **一次设定，永久记住。让 AI 真正成为你的协作伙伴，而不是每次都要重新认识的陌生人。**

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

Remember Me 是一款 VS Code 插件，专为**产品经理、运营、设计师、学生、创业者**等非技术用户设计，让 AI 能"记住"你的做事风格、偏好和过往对话，不再每次从头教。

---

## 📖 目录

- [功能特性](#-功能特性)
- [安装指南](#-安装指南)
- [快速开始](#-快速开始)
- [使用说明](#-使用说明)
- [支持的 AI 提供商](#-支持的-ai-提供商)
- [项目结构](#-项目结构)
- [开发文档](#-开发文档)
- [贡献指南](#-贡献指南)
- [路线图](#-路线图)
- [常见问题](#-常见问题)
- [许可证](#-许可证)

---

## ✨ 功能特性

### 四层记忆体系

Remember Me 采用四层记忆结构，覆盖你与 AI 协作的所有维度：

| 记忆层级 | 定义 | 示例 |
|----------|------|------|
| **个人画像 (Profile)** | 你是谁？背景、经验、领域 | B端SaaS产品经理，3-5年经验 |
| **做事风格 (Style)** | 你怎么做？偏好、习惯、标准 | 详细PRD + MoSCoW优先级 + 用户旅程图 |
| **项目上下文 (Project Context)** | 你在做什么？背景、决策、进展 | TeamFlow项目，目标用户是企业管理员 |
| **对话历史 (Conversation History)** | 你们聊过什么？讨论、决策、修改 | 上周决定用OAuth 2.0 + SSO登录 |

### 三种记忆触发模式

- 🟢 **自动基础记忆** — 每次对话自动注入个人画像和项目上下文
- 🟡 **智能推荐记忆** — AI 检测到相关内容时自动推荐历史记忆
- 🔴 **手动检索记忆** — 用户主动搜索关键词、时间范围、项目或标签

### 多场景写作支持

| 场景 | 记忆重点 |
|------|----------|
| **PRD（产品需求文档）** | 产品背景、用户画像、功能结构、验收标准 |
| **商业计划书** | 商业模式、市场定位、财务模型、竞争壁垒 |
| **学术论文** | 研究领域、理论框架、方法论、引用格式 |
| **市场调研报告** | 调研方法、样本特征、分析框架、结论 |
| **活动策划方案** | 品牌调性、目标人群、预算范围、渠道偏好 |
| **设计说明文档** | 设计规范、色彩体系、组件库、交互原则 |
| **技术方案文档** | 技术栈、架构决策、接口规范、部署环境 |
| **汇报材料** | 汇报对象、关注重点、数据口径、格式要求 |

### 透明存储

采用**纯 JSON 文件存储**，原因：
- 非技术用户可以看到、理解、手动修改自己的记忆
- 零依赖，不需要安装数据库
- 可以用 Git 备份
- 符合"透明档案"的理念

### Phase 3 智能增强

Phase 3 为 Remember Me 带来了四大智能特性，让 AI 协作更加高效自然。**模板系统**覆盖 PRD、商业计划书、学术论文等 8 种专业写作场景，一键生成结构化框架；**风格一致性检查**与**智能推荐记忆**协同工作，前者自动检测并修复文档中不符合你个人习惯的表达，后者基于内容感知算法在输入时离线推送相关历史决策与术语。**记忆版本控制**为每次更新保留可追溯的备份，支持一键回滚与 JSON 预览，确保你的知识资产安全可控。

### Phase 4.1 语义搜索

基于 ChromaDB + sentence-transformers（all-MiniLM-L6-v2）的向量语义搜索已作为 MVP 上线。搜索支持「🔍 关键词」与「🧠 语义」双模式一键切换，语义模式用自然语言描述即可召回相关历史记忆（决策、对话、术语），按相似度排序并展示匹配度。模式持久化、服务降级自动回退、一键构建索引均已就绪。> ℹ️ 语义搜索需启动 memory-engine 服务（`python -m memory_engine.server`），首次查询有约 7~12s 模型加载冷启动。

---

## 📦 安装指南

### 方式一：从 VS Code 扩展市场安装（推荐）

1. 打开 VS Code
2. 点击左侧活动栏的 **扩展** 图标（或按 `Ctrl+Shift+X` / `Cmd+Shift+X`）
3. 搜索 `"Remember Me"`
4. 点击 **安装**

### 方式二：从 VSIX 文件安装

1. 从 [Releases](https://github.com/ltgkb/remember-me/releases) 页面下载最新 `.vsix` 文件
2. 在 VS Code 中，按 `Ctrl+Shift+P` / `Cmd+Shift+P` 打开命令面板
3. 输入并选择 **"扩展：从 VSIX 安装"**
4. 选择下载的 `.vsix` 文件

### 方式三：源码安装（开发者）

```bash
# 克隆仓库
git clone https://github.com/ltgkb/remember-me.git
cd remember-me/packages/vscode-extension

# 安装依赖
npm install

# 编译
npm run compile

# 在 VS Code 中按 F5 启动调试
```

详细安装说明请参阅 [docs/INSTALL.md](docs/INSTALL.md)。

---

## 🚀 快速开始

### 第一步：完成设置向导（3 分钟）

安装插件后，会自动弹出欢迎提示。点击 **"开始设置"**，完成 5 步问卷：

1. **你是做什么的？** — 选择你的身份角色
2. **你主要写什么类型的文档？** — PRD / 商业计划书 / 论文 / 其他
3. **你的文档风格是？** — 简洁 / 标准 / 详尽
4. **你有什么特殊习惯？** — MoSCoW 优先级 / 用户旅程图 / 竞品对比 / 引用格式规范
5. **你目前在做什么项目？** — 输入项目名称、目标用户、核心功能

你也可以随时通过命令面板（`Ctrl+Shift+P`）搜索 **"Remember Me: 打开设置向导"** 重新运行向导。

### 第二步：开始你的第一次 AI 对话

1. 点击 VS Code 底部状态栏的 **🧠 Remember Me** 图标
2. 选择 **"开始对话"**
3. AI 会自动注入你的记忆 Prompt，例如：

   ```
   🧠 Remember Me 已激活
   身份：B端SaaS产品经理 | 项目：TeamFlow
   风格：详细PRD + MoSCoW优先级 + 用户旅程图
   ```

4. 输入你的需求，例如："帮我写登录功能的 PRD"
5. AI 会基于你的风格和项目上下文生成符合你习惯的文档

### 第三步：探索更多功能

- **切换项目**：点击状态栏项目名，快速切换不同项目上下文
- **搜索记忆**：按 `Ctrl+Shift+P` 搜索 **"Remember Me: 搜索记忆"**
- **编辑记忆**：点击状态栏 **"编辑记忆"**，在可视化面板中修改
- **查看对话历史**：在侧边栏 Remember Me 视图中浏览历史对话

---

## 📘 使用说明

### 状态栏交互

VS Code 底部状态栏会显示当前激活的记忆状态：

```
🧠 B端SaaS产品经理 | 项目：TeamFlow | MoSCoW
```

点击状态栏图标可快速访问：
- 打开设置
- 开始对话
- 切换项目
- 搜索记忆

### 记忆注入 Prompt

每次点击 **"开始对话"**，插件会自动生成记忆注入 Prompt，格式如下：

```markdown
你是用户的 AI 协作助手。以下是关于这位用户的背景信息：

【身份】
- 角色：产品经理
- 经验：3-5年
- 领域：SaaS

【做事风格】
- 文档结构：先背景后功能
- 详细程度：详尽（10页以上）
- 语言：中文
- 特殊习惯：MoSCoW优先级、用户旅程图

【当前项目】TeamFlow
- 目标用户：企业管理员
- 核心功能：团队协作与项目管理
- 已确定决策：
  • 认证方式：使用 OAuth 2.0 + SSO
```

### 命令列表

在命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）中搜索 `"Remember Me"` 可使用以下命令：

| 命令 | 功能 |
|------|------|
| `Remember Me: 打开设置` | 打开设置面板 |
| `Remember Me: 开始对话` | 在新文档中注入记忆 Prompt |
| `Remember Me: 切换项目` | 切换到其他项目上下文 |
| `Remember Me: 搜索记忆` | 关键词搜索历史记忆 |
| `Remember Me: 更新个人画像` | 编辑个人画像信息 |
| `Remember Me: 打开设置向导` | 重新运行首次设置向导 |
| `Remember Me: 打开记忆编辑器` | 打开可视化记忆编辑面板 |
| `Remember Me: 刷新记忆` | 刷新记忆数据 |
| `Remember Me: 查看对话历史` | 查看历史对话记录 |
| `Remember Me: 关于` | 显示插件版本信息 |

### 侧边栏

点击左侧活动栏的 **⏱ 历史图标** 打开 Remember Me 侧边栏，可查看：
- 当前项目概览
- 最近对话列表
- 快捷操作按钮

### 配置文件

所有记忆数据存储在用户主目录下的 `~/.remember-me/` 文件夹中：

```
~/.remember-me/
├── profile.json              # 个人画像 + 做事风格（全局）
├── projects/
│   ├── teamflow/
│   │   ├── context.json      # 项目上下文
│   │   └── conversations/    # 对话历史
│   └── thesis-llm/
│       ├── context.json
│       └── conversations/
└── templates/                # 文档模板
```

你可以直接编辑这些 JSON 文件，所有修改会实时同步到插件中。

更多详细用法请参阅 [docs/USAGE.md](docs/USAGE.md)。

---

## 🤖 支持的 AI 提供商

| 提供商 | 类型 | 特点 |
|--------|------|------|
| **DeepSeek** | 国内云端 | 性价比高，推理能力强 |
| **通义千问 (Qwen)** | 国内云端 | 多模态，中文理解好 |
| **文心一言 (ERNIE)** | 国内云端 | 百度生态，企业友好 |
| **智谱 (ChatGLM)** | 国内云端 | 免费额度多，学术友好 |
| **Ollama** | 本地 | 隐私安全，离线可用 |
| **LM Studio** | 本地 | 图形界面，易上手 |

### 配置 AI 提供商

1. 打开 VS Code 设置（`Ctrl+,` / `Cmd+,`）
2. 搜索 `"Remember Me"`
3. 配置以下选项：
   - **AI 提供商**：选择你的提供商
   - **API 密钥**：输入你的 API Key
   - **模型名称**：选择模型（如 `deepseek-chat`）
   - **自定义 API 基础 URL**（可选）：用于本地部署或代理

---

## 🏗 项目结构

```
remember-me/
├── packages/
│   └── vscode-extension/       # VS Code 插件（TypeScript）
│       ├── src/
│       │   ├── extension.ts    # 插件主入口
│       │   ├── types.ts        # 核心类型定义
│       │   ├── memory/         # 记忆管理模块
│       │   │   ├── storage.ts      # JSON 文件读写
│       │   │   ├── profile.ts      # 用户画像管理
│       │   │   ├── project.ts      # 项目上下文管理
│       │   │   └── conversation.ts # 对话历史管理
│       │   ├── ai/             # AI 提供商适配层
│       │   │   ├── provider.ts     # Provider 工厂
│       │   │   ├── base-openai.ts  # OpenAI 兼容基类
│       │   │   ├── deepseek.ts     # DeepSeek 适配
│       │   │   ├── qwen.ts         # 通义千问适配
│       │   │   ├── ernie.ts        # 文心一言适配
│       │   │   ├── chatglm.ts      # 智谱适配
│       │   │   ├── ollama.ts       # Ollama 本地适配
│       │   │   └── index.ts        # 统一导出
│       │   ├── ui/             # 用户界面模块
│       │   │   ├── statusBar.ts         # 状态栏管理
│       │   │   ├── sidebarProvider.ts   # 侧边栏数据
│       │   │   └── webview/             # Webview 面板
│       │   │       ├── baseWebview.ts   # Webview 基础抽象
│       │   │       ├── onboarding.ts    # 首次使用向导
│       │   │       ├── settingsPanel.ts # 设置面板
│       │   │       └── memoryEditor.ts  # 记忆编辑器
│       │   └── utils/
│       │       └── promptBuilder.ts  # 记忆注入 Prompt 构建器
│       ├── package.json
│       └── tsconfig.json
├── docs/                       # 项目文档
│   ├── PRD.md                  # 产品需求文档
│   ├── INSTALL.md              # 安装指南
│   ├── USAGE.md                # 使用说明
│   ├── CONTRIBUTING.md         # 贡献指南
│   └── ARCHITECTURE.md         # 架构文档
├── reports/                    # 开发迭代报告
└── README.md                   # 本文档
```

---

## 📚 开发文档

- [架构设计](docs/ARCHITECTURE.md) — 技术架构、存储方案、AI 适配层设计
- [API 文档](docs/ARCHITECTURE.md#ai-适配层) — AI Provider 统一接口说明
- [类型定义](packages/vscode-extension/src/types.ts) — 核心 TypeScript 类型接口

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！请参阅 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) 了解：

- 如何提交 Issue
- 开发环境搭建
- 代码规范
- 提交 PR 的流程

### 快速贡献

```bash
# Fork 并克隆仓库
git clone https://github.com/your-username/remember-me.git
cd remember-me/packages/vscode-extension

# 安装依赖
npm install

# 启动开发模式（监听文件变化）
npm run watch

# 在 VS Code 中按 F5 启动调试窗口
```

---

## 🗺 路线图

### Phase 1：MVP（当前）
- [x] VS Code 插件脚手架
- [x] 设置向导（3 分钟问卷）
- [x] JSON 存储层（Profile + Project Context）
- [x] DeepSeek + Ollama 接入
- [x] 基础记忆注入（自动注入 Profile + Project Context）
- [x] 对话内提醒 UI
- [x] GitHub 开源发布

### Phase 2：核心功能
- [x] 通义千问 + 文心一言 + 智谱接入
- [x] 对话历史自动记录
- [x] 关键信息自动提取
- [x] 手动搜索记忆
- [x] 记忆更新确认机制
- [x] 多项目切换

### Phase 3：智能增强
- [x] 智能推荐记忆（内容感知）
- [x] 风格一致性检查
- [x] 模板系统（PRD / 商业计划书 / 论文等 8 场景）
- [x] 记忆版本控制
- [x] 搜索索引优化 + 持久化
- [x] 社区模板市场

### Phase 4：商业化
- [x] 语义搜索 MVP（ChromaDB + sentence-transformers，Phase 4.1）
- [ ] 云端同步（Pro 版）
- [ ] 团队协作（Pro 版）
- [ ] 语义搜索模型升级（bge-m3 跨语言，Phase 4.2）
- [ ] 记忆质量分析（Pro 版）
- [ ] 付费系统接入

---

## ❓ 常见问题

### Q: 我的记忆数据安全吗？

**A:** 绝对安全。所有记忆数据以纯 JSON 文件形式存储在你的本地计算机（`~/.remember-me/`），不上传任何服务器。你可以随时查看、编辑或删除这些文件。

### Q: 支持哪些 AI 模型？

**A:** 目前支持 DeepSeek、通义千问、文心一言、智谱、Ollama（本地）和 LM Studio（本地）。所有适配器均基于 OpenAI 兼容 API 设计，后续可快速接入更多提供商。

### Q: 我是技术开发者，可以用这个插件吗？

**A:** 当然可以！虽然 Remember Me 的设计初衷是服务非技术用户，但任何需要与 AI 协作写作的人都可受益。技术文档、API 设计文档、架构方案等场景同样适用。

### Q: 如何备份我的记忆数据？

**A:** 由于记忆数据是纯 JSON 文件，你可以：
- 用 Git 管理 `~/.remember-me/` 目录
- 定期复制备份文件夹
- 插件内置自动备份功能（每次更新保留最近 20 个版本）

### Q: 如何迁移记忆到另一台电脑？

**A:** 只需复制 `~/.remember-me/` 文件夹到新电脑的对应位置即可。Pro 版将支持云端自动同步。

---

## 📄 许可证

[MIT](LICENSE) © Remember Me 团队

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给我们一颗星！**

[提交 Issue](https://github.com/ltgkb/remember-me/issues) · [参与贡献](docs/CONTRIBUTING.md) · [查看文档](docs/)

</div>
