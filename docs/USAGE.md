# 使用说明

本文档详细介绍 Remember Me 的各项功能及使用方法。

---

## 目录

- [首次设置](#首次设置)
- [状态栏交互](#状态栏交互)
- [记忆管理](#记忆管理)
- [AI 对话](#ai-对话)
- [项目切换](#项目切换)
- [搜索记忆](#搜索记忆)
- [命令参考](#命令参考)
- [配置项说明](#配置项说明)
- [数据存储位置](#数据存储位置)

---

## 首次设置

### 设置向导

安装插件后，系统会在 3 秒后自动弹出欢迎提示：

> 👋 欢迎使用 Remember Me！让 AI 记住你的风格和项目上下文。是否现在完成 3 分钟设置向导？

点击 **"开始设置"**，跟随向导完成以下步骤：

#### 步骤 1：身份角色

选择你的主要身份：
- 产品经理
- 运营
- 设计师
- 学生
- 创业者
- 管理者
- 其他

#### 步骤 2：经验与领域

- **经验水平**：新手 / 1-3年 / 3-5年 / 5年以上
- **行业领域**：电商 / SaaS / 社交 / 金融 / 教育 / 医疗 / 其他
- **专业背景**：技术 / 商业 / 设计 / 文科 / 其他

#### 步骤 3：文档偏好

- **文档结构偏好**：先写背景还是先写功能点？
- **详细程度**：简洁（1页）/ 标准（3-5页）/ 详尽（10页以上）
- **语言**：中文 / 英文 / 双语
- **语气**：正式 / 口语化 / 学术

#### 步骤 4：特殊习惯（多选）

- MoSCoW 优先级标注
- 用户旅程图
- 竞品对比
- 财务预测
- 引用格式规范（APA / MLA / GB/T 7714）
- 数据图表
- SWOT 分析
- 验收标准

#### 步骤 5：创建第一个项目

输入项目基本信息：
- **项目名称**：如 "TeamFlow"
- **目标用户**：如 "企业管理员，不是终端用户"
- **核心功能**：如 "团队协作与项目管理"

### 重新运行向导

如需修改设置，可通过以下方式重新运行：
- 命令面板：`Ctrl+Shift+P` > "Remember Me: 打开设置向导"
- 状态栏菜单：点击 🧠 > "打开设置向导"

---

## 状态栏交互

### 记忆激活提示

完成设置后，VS Code 底部状态栏会显示：

```
🧠 B端SaaS产品经理 | 项目：TeamFlow | MoSCoW
```

这表示：
- ✅ 个人画像已加载
- ✅ 项目上下文已加载
- ✅ AI 对话将自动注入这些记忆

### 状态栏菜单

点击状态栏的 **🧠 Remember Me** 图标，弹出快捷菜单：

| 选项 | 功能 |
|------|------|
| $(gear) 打开设置 | 配置个人画像、项目、AI 提供商 |
| $(comment-discussion) 开始对话 | 在新文档中注入记忆 Prompt |
| $(folder) 切换项目 | 切换到其他项目上下文 |
| $(search) 搜索记忆 | 关键词搜索历史记忆 |

### 新信息检测

当 AI 检测到对话中出现新的项目信息时，状态栏会显示提示：

> 💡 检测到新信息：你提到了"支持多语言"  
> 是否要更新项目上下文？ [更新] [忽略] [标记为待确认]

---

## 记忆管理

### 记忆结构

Remember Me 的记忆分为四个层级：

#### 1. 个人画像（Profile）

定义：你是谁？你的背景、经验、领域。

文件位置：`~/.remember-me/profile.json`

包含内容：
```json
{
  "id": "profile-xxx",
  "identity": {
    "role": "产品经理",
    "experience": "3-5年",
    "industry": "SaaS",
    "background": "商业"
  },
  "style": {
    "documentStructure": "先背景后功能",
    "detailLevel": "详尽（10页以上）",
    "language": "中文",
    "tone": "正式",
    "specialHabits": ["MoSCoW优先级", "用户旅程图"],
    "responseStyle": "先框架再细节"
  }
}
```

#### 2. 项目上下文（Project Context）

定义：你在做什么？当前项目的背景、决策、进展。

文件位置：`~/.remember-me/projects/{项目名}/context.json`

包含内容：
```json
{
  "id": "project-xxx",
  "name": "TeamFlow",
  "targetUsers": "企业管理员",
  "coreFeatures": "团队协作与项目管理",
  "decisions": [
    {
      "id": "dec-1",
      "title": "认证方式",
      "description": "使用 OAuth 2.0 + SSO",
      "status": "已确定"
    }
  ],
  "terminology": [
    {
      "term": "用户",
      "definition": "企业管理员，不是终端用户"
    }
  ],
  "competitors": ["Slack", "飞书"]
}
```

#### 3. 做事风格（Style）

做事风格与个人画像存储在同一个 `profile.json` 中，详见上方示例。

#### 4. 对话历史（Conversation History）

定义：你们聊过什么？之前的讨论、决策、修改记录。

文件位置：`~/.remember-me/projects/{项目名}/conversations/`

### 编辑记忆

#### 方式一：设置面板

1. 命令面板：`Ctrl+Shift+P` > "Remember Me: 打开设置"
2. 或点击状态栏 > "打开设置"
3. 设置面板包含三个标签页：
   - **画像**：编辑身份、经验、领域
   - **项目**：管理多个项目上下文
   - **风格**：调整文档偏好和特殊习惯

#### 方式二：记忆编辑器

1. 命令面板：`Ctrl+Shift+P` > "Remember Me: 打开记忆编辑器"
2. 可视化面板展示所有记忆数据
3. 支持关键词搜索、项目筛选、标签筛选

#### 方式三：直接编辑 JSON

由于采用纯 JSON 文件存储，你可以直接用 VS Code 编辑：

```bash
# 打开记忆文件夹
code ~/.remember-me
```

所有修改会实时同步到插件中。

### 版本控制

每次更新记忆文件时，插件会自动创建备份：
- 备份位置：文件同级目录下的 `.backups/` 文件夹
- 保留数量：最近 20 个版本
- 命名格式：`{文件名}.{ISO时间戳}`

如需回滚，直接复制备份文件覆盖原文件即可。

---

## AI 对话

### 开始对话

**方式一**：点击状态栏 🧠 > "开始对话"

**方式二**：命令面板 > "Remember Me: 开始对话"

**方式三**：快捷键（如有配置）

### 记忆注入效果

执行"开始对话"后，插件会：

1. 创建一个新的 Markdown 文档
2. 自动注入记忆 Prompt，例如：

```markdown
你是用户的 AI 协作助手。以下是关于这位用户的背景信息：

【身份】
- 角色：产品经理
- 经验：3-5年
- 领域：SaaS
- 专业背景：商业

【做事风格】
- 文档结构：先背景后功能
- 详细程度：详尽（10页以上）
- 语言：中文
- 语气：正式
- 特殊习惯：MoSCoW优先级、用户旅程图
- 回复风格：先框架再细节

【当前项目】TeamFlow
- 目标用户：企业管理员
- 核心功能：团队协作与项目管理
- 已确定决策：
  • 认证方式：使用 OAuth 2.0 + SSO
- 术语定义：
  • 用户 = 企业管理员，不是终端用户

请基于以上信息协助用户，确保回复符合用户的风格和项目上下文。
```

3. 显示提示："🧠 Remember Me 记忆已注入"

### 多场景写作示例

#### 示例 1：写 PRD

```
用户：帮我写登录功能的 PRD

AI（基于记忆）：
# 登录功能 PRD

## 背景
TeamFlow 面向企业管理员，需要提供安全可靠的登录方式...

## 用户故事
- 作为企业管理员，我希望通过 SSO 登录，以便统一管理...

## 功能描述
...（自动标注 MoSCoW 优先级）

## 验收标准
...（根据你的习惯自动补充）

💡 相关记忆：你之前决定用 OAuth 2.0，这个方案需要调整吗？
```

#### 示例 2：写论文

```
用户：帮我写实验设计部分

AI（基于记忆）：
## 实验设计

### 数据集
我们使用 ...（符合你定义的实验设置）

### 评价指标
采用 BLEU 和 ROUGE 作为主要指标...
（引用第一章的文献综述）

###  baseline 对比
...

⚠️ 风格检查：你之前定义的评价指标是 BLEU 和 ROUGE，要补充新的指标吗？
```

---

## 项目切换

### 为什么需要项目切换？

不同项目有不同的上下文：
- 工作项目：TeamFlow（SaaS 协作工具）
- 个人项目：MyBlog（技术博客）
- 学术项目：Thesis-LLM（大语言模型研究）

### 如何切换项目

**方式一**：点击状态栏当前项目名 > 选择新项目

**方式二**：命令面板 > "Remember Me: 切换项目"

**方式三**：设置面板 > "项目" 标签页 > 选择项目

### 创建新项目

1. 打开设置面板（`Ctrl+Shift+P` > "Remember Me: 打开设置"）
2. 切换到 "项目" 标签页
3. 点击 "创建新项目"
4. 输入项目名称、目标用户、核心功能

---

## 搜索记忆

### 关键词搜索

1. 命令面板：`Ctrl+Shift+P` > "Remember Me: 搜索记忆"
2. 输入关键词，如："用户权限"
3. 查看搜索结果：
   - 个人画像匹配项
   - 项目上下文匹配项
   - 对话历史匹配项

### 搜索范围

搜索会覆盖以下所有数据：
- `profile.json` — 个人画像和风格
- `projects/*/context.json` — 各项目上下文
- `projects/*/conversations/*.json` — 对话历史

### 高级筛选（开发中）

Phase 2 将支持：
- 时间范围搜索（"上周的讨论"）
- 项目筛选（"TeamFlow 项目"）
- 标签筛选（"已决策 / 待确认 / 已废弃"）

---

## 命令参考

在命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）中搜索 `"Remember Me"`：

| 命令 ID | 显示名称 | 功能描述 |
|---------|----------|----------|
| `rememberMe.openSettings` | 打开设置 | 打开三标签页设置面板 |
| `rememberMe.startChat` | 开始对话 | 在新文档注入记忆 Prompt |
| `rememberMe.switchProject` | 切换项目 | 选择并激活其他项目 |
| `rememberMe.searchMemory` | 搜索记忆 | 关键词全局搜索 |
| `rememberMe.updateProfile` | 更新个人画像 | 快捷打开画像编辑页 |
| `rememberMe.showMenu` | 显示菜单 | 弹出状态栏快捷菜单 |
| `rememberMe.openOnboarding` | 打开设置向导 | 重新运行首次设置 |
| `rememberMe.openMemoryEditor` | 打开记忆编辑器 | 打开可视化记忆面板 |
| `rememberMe.refreshMemory` | 刷新记忆 | 重新加载磁盘数据 |
| `rememberMe.viewConversationHistory` | 查看对话历史 | 浏览历史对话 |
| `rememberMe.showAbout` | 关于 Remember Me | 显示版本信息 |

---

## 配置项说明

在 VS Code 设置（`Ctrl+,`）中搜索 `"Remember Me"`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rememberMe.aiProvider` | 字符串 | `deepseek` | AI 提供商：deepseek / qwen / ernie / chatglm / ollama / lmstudio |
| `rememberMe.apiKey` | 字符串 | `""` | API 密钥（云端模型必填） |
| `rememberMe.apiBaseUrl` | 字符串 | `""` | 自定义 API 基础 URL |
| `rememberMe.modelName` | 字符串 | `deepseek-chat` | 模型名称 |
| `rememberMe.memoryPath` | 字符串 | `""` | 记忆存储路径（默认 `~/.remember-me`） |

### 配置示例

#### DeepSeek

```json
{
  "rememberMe.aiProvider": "deepseek",
  "rememberMe.apiKey": "sk-xxxxxxxxxxxxxxxx",
  "rememberMe.modelName": "deepseek-chat"
}
```

#### Ollama（本地）

```json
{
  "rememberMe.aiProvider": "ollama",
  "rememberMe.apiBaseUrl": "http://localhost:11434/v1",
  "rememberMe.modelName": "llama3"
}
```

#### 自定义存储路径

```json
{
  "rememberMe.memoryPath": "/path/to/your/remember-me-data"
}
```

---

## 数据存储位置

### 默认路径

| 操作系统 | 路径 |
|----------|------|
| Windows | `C:\Users\{用户名}\.remember-me\` |
| macOS | `/Users/{用户名}/.remember-me/` |
| Linux | `/home/{用户名}/.remember-me/` |

### 文件结构

```
~/.remember-me/
├── profile.json                 # 个人画像 + 做事风格（全局）
├── projects/                    # 项目目录
│   ├── teamflow/                # 项目：TeamFlow
│   │   ├── context.json         # 项目上下文
│   │   └── conversations/       # 对话历史
│   │       ├── 2026-07-08-prd-login.json
│   │       └── 2026-07-09-user-roles.json
│   └── thesis-llm/              # 项目：论文
│       ├── context.json
│       └── conversations/
└── templates/                   # 文档模板（开发中）
    ├── prd-standard.json
    ├── business-plan.json
    └── thesis-template.json
```

### 备份策略

- **自动备份**：每次写入时自动创建备份到 `.backups/` 目录
- **Git 备份**：建议将 `~/.remember-me/` 初始化为 Git 仓库
- **手动备份**：直接复制整个文件夹即可

---

## 最佳实践

### 1. 定期更新项目上下文

随着项目进展，及时将新的决策、术语更新到项目上下文中，这样 AI 能始终掌握最新信息。

### 2. 使用 Git 管理记忆数据

```bash
cd ~/.remember-me
git init
git add .
git commit -m "init: 初始化记忆数据"
```

### 3. 为不同场景创建不同项目

不要在一个项目中混合所有内容。为工作、学习、个人项目分别创建独立项目，切换更精准。

### 4. 利用特殊习惯提升效率

在设置中勾选你最常用的文档元素（如 MoSCoW、验收标准），AI 会自动在每次生成时包含这些内容，省去反复说明的麻烦。
