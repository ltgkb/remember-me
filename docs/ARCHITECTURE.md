# 架构文档

本文档介绍 Remember Me 的技术架构、设计决策和模块设计。

---

## 目录

- [架构概览](#架构概览)
- [项目结构](#项目结构)
- [存储层](#存储层)
- [记忆管理](#记忆管理)
- [AI 适配层](#ai-适配层)
- [UI 层](#ui-层)
- [数据流](#数据流)
- [设计决策](#设计决策)
- [扩展指南](#扩展指南)

---

## 架构概览

Remember Me 采用分层架构设计，核心设计原则：

1. **透明优先**：所有用户数据以纯 JSON 存储，用户完全掌控
2. **零依赖**：核心功能不依赖外部数据库或服务
3. **可扩展**：统一接口设计，便于添加新 AI 提供商
4. **类型安全**：TypeScript 严格模式，全链路类型覆盖

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code 宿主                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   状态栏     │  │   侧边栏     │  │      Webview        │  │
│  │ statusBar.ts │  │ sidebar.ts   │  │ 设置/向导/编辑器     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └─────────────────┴────────────────────┘             │
│                           │                                  │
│                    ┌──────┴──────┐                          │
│                    │  extension.ts │  命令注册、生命周期管理   │
│                    └──────┬──────┘                          │
│                           │                                  │
│  ┌────────────────────────┼────────────────────────┐        │
│  │                        ▼                        │        │
│  │  ┌────────────┐  ┌───────────┐  ┌────────────┐ │        │
│  │  │   memory/   │  │    ai/     │  │   utils/    │ │        │
│  │  │  记忆管理    │  │ AI 适配层  │  │  工具函数   │ │        │
│  │  └────────────┘  └───────────┘  └────────────┘ │        │
│  │                        │                        │        │
│  │                   ┌────┴────┐                   │        │
│  │                   │  types.ts │  核心类型定义     │        │
│  │                   └────┬────┘                   │        │
│  └────────────────────────┼────────────────────────┘        │
│                           │                                  │
│                    ┌──────┴──────┐                          │
│                    │  JsonStorage │  纯 JSON 文件读写        │
│                    │  storage.ts  │  ~/.remember-me/         │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
packages/vscode-extension/src/
├── extension.ts              # 插件主入口（410行）
│   ├── activate()            # 插件激活：初始化 UI、注册命令、检查首次使用
│   ├── registerCommands()    # 注册 11 个 VS Code 命令
│   ├── checkFirstRun()       # 首次使用引导
│   ├── buildMemoryPrompt()   # 构建记忆注入 Prompt
│   └── searchInStorage()     # 存储内关键词搜索
│
├── types.ts                  # 核心类型定义（117行）
│   ├── Message / ChatOptions / AIProvider    # AI 通信类型
│   ├── Profile / IdentityInfo / StyleInfo    # 用户画像类型
│   ├── ProjectContext / Decision / TermDefinition  # 项目类型
│   ├── Conversation / ChatMessage / Insight  # 对话类型
│   └── StorageConfig / WriteMode             # 存储类型
│
├── memory/                   # 记忆管理模块
│   ├── storage.ts            # JSON 存储基础层（161行）
│   ├── profile.ts            # 用户画像管理（~220行）
│   ├── project.ts            # 项目上下文管理（~350行）
│   └── conversation.ts       # 对话历史管理（~520行）
│
├── ai/                       # AI 提供商适配层
│   ├── provider.ts           # Provider 工厂 + 单例管理（234行）
│   ├── base-openai.ts        # OpenAI 兼容基类（101行）
│   ├── deepseek.ts           # DeepSeek 适配（20行）
│   ├── qwen.ts               # 通义千问适配（20行）
│   ├── ernie.ts              # 文心一言适配（20行）
│   ├── chatglm.ts            # 智谱适配（20行）
│   ├── ollama.ts             # Ollama 本地适配（22行）
│   └── index.ts              # 统一导出（16行）
│
├── ui/                       # 用户界面模块
│   ├── statusBar.ts          # 状态栏管理（275行）
│   ├── sidebarProvider.ts    # 侧边栏树形数据（~150行）
│   └── webview/              # Webview 面板
│       ├── baseWebview.ts    # Webview 基础抽象（478行）
│       ├── onboarding.ts     # 首次使用向导（396行）
│       ├── settingsPanel.ts  # 设置面板（518行）
│       ├── memoryEditor.ts   # 记忆编辑器（470行）
│       └── index.ts          # 统一导出（7行）
│
└── utils/
    └── promptBuilder.ts      # 记忆注入 Prompt 构建器（111行）
```

---

## 存储层

### 设计原则

采用**纯 JSON 文件存储**，原因如下：

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| JSON 文件 | 透明、零依赖、Git 友好 | 无索引、大数据量性能下降 | ✅ 采用 |
| SQLite | 性能好、轻量 | 非技术用户不易理解 | ❌ 不采用 |
| PostgreSQL | 功能强大 | 需要 Docker、太重 | ❌ 不采用 |
| 云端存储 | 多设备同步 | 隐私顾虑、需要网络 | ⚠️ Pro 版 |

### JsonStorage 类

`src/memory/storage.ts` 提供统一的文件操作接口：

```typescript
class JsonStorage {
  // 读写操作
  read<T>(...pathSegments: string[]): T | null;
  write(data: unknown, ...pathSegments: string[]): boolean;
  merge<T>(data: Partial<T>, ...pathSegments: string[]): T | null;
  
  // 目录操作
  listDir(...pathSegments: string[]): string[];
  readAllInDir<T>(...pathSegments: string[]): Array<{ name: string; data: T }>;
  
  // 版本控制
  backup(...pathSegments: string[]): boolean;
}
```

### 文件布局

```
~/.remember-me/
├── profile.json              # 个人画像 + 做事风格（全局唯一）
├── projects/                 # 项目目录
│   └── {project-name}/       # 每个项目一个文件夹
│       ├── context.json      # 项目上下文
│       └── conversations/    # 对话历史
│           └── {date}-{topic}.json
└── templates/                # 文档模板（Phase 3）
    ├── prd-standard.json
    ├── business-plan.json
    └── thesis-template.json
```

### 备份策略

- 每次 `write()` 前自动调用 `backup()`
- 备份命名：`{文件名}.{ISO时间戳}`
- 保留策略：最近 20 个版本
- 存储位置：文件同级目录的 `.backups/` 文件夹

---

## 记忆管理

### 四层记忆模型

```
┌─────────────────────────────────────────┐
│         对话历史 (Conversation)            │
│  你们聊过什么？动态变化，每次对话积累       │
├─────────────────────────────────────────┤
│         项目上下文 (Project Context)       │
│  你在做什么？按项目隔离，随项目进展更新      │
├─────────────────────────────────────────┤
│         做事风格 (Style)                   │
│  你怎么做？相对稳定的个人偏好               │
├─────────────────────────────────────────┤
│         个人画像 (Profile)                 │
│  你是谁？基础身份信息                      │
└─────────────────────────────────────────┘
```

### 记忆注入流程

```
用户点击"开始对话"
       │
       ▼
┌──────────────┐
│ extension.ts │
│ buildMemory  │
│ Prompt()     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ PromptBuilder│
│ .build()     │
└──────┬───────┘
       │
       ├── 读取 profile.json ──→ 身份 + 风格
       │
       ├── 读取当前项目 context.json ──→ 项目上下文
       │
       └── 组装为 Markdown Prompt
       │
       ▼
创建新文档，注入 Prompt
       │
       ▼
用户继续与 AI 对话
```

### Prompt 模板

严格遵循 PRD §10.1 模板格式：

```markdown
你是用户的 AI 协作助手。以下是关于这位用户的背景信息：

【身份】
- 角色：{role}
- 经验：{experience}
- 领域：{industry}
- 专业背景：{background}

【做事风格】
- 文档结构：{structure}
- 详细程度：{detail_level}
- 语言：{language}
- 语气：{tone}
- 特殊习惯：{special_habits}
- 回复风格：{response_style}

【当前项目】{project_name}
- 目标用户：{target_users}
- 核心功能：{core_features}
- 已确定决策：...
- 术语定义：...

请基于以上信息协助用户，确保回复符合用户的风格和项目上下文。
```

---

## AI 适配层

### 统一接口

```typescript
interface AIProvider {
  readonly name: string;
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
  validateConfig(): Promise<boolean>;
}
```

### 类层次

```
AIProvider (接口)
    │
    ├── BaseOpenAIProvider (抽象类)
    │       ├── DeepSeekProvider
    │       ├── QwenProvider
    │       ├── ErnieProvider
    │       ├── ChatGLMProvider
    │       └── LMStudioProvider
    │
    └── OllamaProvider (独立实现)
```

### Provider 工厂

`src/ai/provider.ts` 实现工厂模式：

```typescript
class AIProviderFactory {
  createProvider(type: string, config: ProviderConfig): AIProvider;
  getInstance(): AIProvider | null;  // 单例管理
}
```

### 流式对话

所有 Provider 使用 `AsyncIterable<string>` 返回流式响应，支持逐字显示：

```typescript
async function* chat(messages, options) {
  const stream = await api.chat.completions.create({
    model,
    messages,
    stream: true
  });
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}
```

---

## UI 层

### 状态栏 (StatusBarManager)

职责：
- 显示当前记忆激活状态
- 提供快捷菜单入口
- 显示记忆提示（新信息检测、风格检查、相关推荐）

状态栏文本格式：
```
🧠 {身份角色} | 项目：{项目名} | {特殊习惯1}
```

### 侧边栏 (RememberMeSidebarProvider)

实现 `vscode.TreeDataProvider` 接口：
- 根节点：当前项目概览
- 子节点：最近对话列表
- 叶节点：快捷操作按钮

### Webview 面板

基于 `BaseWebview` 抽象类：

```typescript
abstract class BaseWebview {
  protected abstract getHtmlContent(): string;
  protected abstract handleMessage(message: any): void;
  
  show(): void;
  postMessage(message: any): void;
}
```

三个具体实现：

| Webview | 功能 | 文件 |
|---------|------|------|
| OnboardingWebview | 5 步问卷式设置向导 | `onboarding.ts` |
| SettingsPanelWebview | 三标签页设置面板（画像/项目/风格） | `settingsPanel.ts` |
| MemoryEditorWebview | 可视化记忆编辑 + 搜索 | `memoryEditor.ts` |

---

## 数据流

### 首次使用流程

```
安装插件
    │
    ▼
activate() ──→ 注册命令、初始化 UI
    │
    ▼
checkFirstRun() ──→ 检测 profile.json 是否存在
    │
    ├── 不存在 ──→ 3秒后弹出欢迎提示
    │                  │
    │                  ▼
    │           用户点击"开始设置"
    │                  │
    │                  ▼
    │           OnboardingWebview
    │                  │
    │                  ▼
    │           5步问卷收集信息
    │                  │
    │                  ▼
    │           写入 profile.json + 项目 context.json
    │                  │
    │                  ▼
    │           触发 profileUpdated 命令
    │                  │
    │                  ▼
    │           更新状态栏、刷新侧边栏
    │
    └── 存在 ──→ 恢复上次状态
```

### 日常对话流程

```
用户点击"开始对话"
    │
    ▼
startChat 命令
    │
    ▼
buildMemoryPrompt()
    │
    ├── 读取 profile.json
    ├── 读取当前项目 context.json
    └── PromptBuilder.build()
    │
    ▼
创建 Markdown 文档，注入 Prompt
    │
    ▼
用户输入需求
    │
    ▼
AI 基于记忆生成回复
    │
    ▼
检测新信息？──→ 提示用户更新项目上下文
```

---

## 设计决策

### 1. 为什么使用纯 JSON 存储？

**核心原因**：目标用户是非技术人员。JSON 文件可以被任何文本编辑器打开和修改，不需要学习数据库或命令行工具。

**权衡**：
- 性能：对于个人使用场景（< 1000 条对话），JSON 完全够用
- 扩展：Phase 3 引入语义搜索时，会叠加 SQLite 向量索引（可选）
- 同步：Pro 版通过云端同步解决多设备问题

### 2. 为什么采用 OpenAI 兼容 API？

国内主流 AI 提供商（DeepSeek、智谱等）都提供 OpenAI 兼容接口，统一基类后各适配器只需配置不同的 endpoint 和默认模型：

```typescript
// 每个适配器仅需 ~20 行代码
class DeepSeekProvider extends BaseOpenAIProvider {
  constructor(config: ProviderConfig) {
    super({
      name: 'DeepSeek',
      baseURL: config.baseURL || 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat'
    });
  }
}
```

### 3. 为什么使用 Webview 而非原生 UI？

VS Code 原生 UI（QuickPick、InputBox）交互能力有限，无法满足复杂的表单填写需求（如 5 步向导、三标签页设置面板）。Webview 提供：
- 完整的 HTML/CSS/JS 能力
- 更友好的用户体验
- 更容易实现设计稿

代价是需要手动处理 VS Code 主题适配（明暗模式）。

### 4. 单例模式的存储层

`JsonStorage` 采用单例模式：

```typescript
let storageInstance: JsonStorage | null = null;

export function getStorage(config?: StorageConfig): JsonStorage {
  if (!storageInstance) {
    storageInstance = new JsonStorage(config);
  }
  return storageInstance;
}
```

原因：
- 避免多个模块持有不同实例导致数据不一致
- 文件句柄复用，减少 I/O 开销
- 简化模块间的依赖注入

---

## 扩展指南

### 添加新的记忆类型

如需扩展记忆模型，步骤如下：

1. **更新类型定义**（`src/types.ts`）：
   ```typescript
   export interface NewMemoryType {
     id: string;
     // ... 字段定义
   }
   ```

2. **创建管理模块**（`src/memory/newType.ts`）：
   ```typescript
   import { getStorage } from './storage';
   import type { NewMemoryType } from '../types';
   
   export class NewTypeManager {
     private storage = getStorage();
     
     read(): NewMemoryType | null {
       return this.storage.read<NewMemoryType>('new-type.json');
     }
     
     write(data: NewMemoryType): boolean {
       return this.storage.write(data, 'new-type.json');
     }
   }
   ```

3. **在 UI 中暴露**：在设置面板或记忆编辑器中添加对应的编辑界面

4. **更新 Prompt 构建器**（如需注入到 AI 对话中）

### 添加新的命令

1. 在 `package.json` 的 `contributes.commands` 中声明：
   ```json
   {
     "command": "rememberMe.newCommand",
     "title": "新命令",
     "icon": "$(new-icon)"
   }
   ```

2. 在 `extension.ts` 的 `registerCommands()` 中注册：
   ```typescript
   const newCmd = vscode.commands.registerCommand(
     'rememberMe.newCommand',
     async () => {
       // 命令逻辑
     }
   );
   context.subscriptions.push(newCmd);
   ```

3. （可选）在状态栏菜单或侧边栏中添加入口

---

## 性能考量

| 场景 | 当前方案 | 优化方向 |
|------|----------|----------|
| 单文件读取 | 同步 `fs.readFileSync` | 保持同步，文件很小 |
| 大量对话搜索 | 全量 JSON 遍历 | Phase 2 添加索引缓存 |
| Webview 加载 | 内联 HTML 字符串 | 考虑分离为 HTML 模板文件 |
| 备份清理 | 每次写入时清理 | 延迟到空闲时清理 |

---

## 安全考虑

| 层面 | 措施 |
|------|------|
| 数据存储 | 纯本地 JSON，不上传服务器 |
| API 密钥 | 使用 VS Code SecretStorage 加密存储 |
| 文件访问 | 限制在 `~/.remember-me/` 目录内 |
| 代码注入 | Webview 使用 `vscode-resource:` 协议，禁用外部脚本 |
