# 安装指南

本文档详细介绍 Remember Me 插件的各种安装方式及环境要求。

---

## 目录

- [系统要求](#系统要求)
- [从扩展市场安装](#从扩展市场安装)
- [从 VSIX 安装](#从-vsix-安装)
- [源码安装](#源码安装)
- [安装后验证](#安装后验证)
- [故障排除](#故障排除)

---

## 系统要求

### 必需

| 软件 | 最低版本 | 说明 |
|------|----------|------|
| VS Code | 1.85.0 | 必须，插件运行环境 |
| Node.js | 18.0.0 | 仅源码安装时需要 |

### 可选（用于本地 AI 模型）

| 软件 | 版本 | 说明 |
|------|------|------|
| Ollama | 最新版 | 本地运行开源大模型 |
| LM Studio | 最新版 | 本地模型图形化管理 |

---

## 从扩展市场安装

### 步骤

1. 打开 VS Code
2. 点击左侧活动栏的 **扩展** 图标（四个方块组成的图标），或按以下快捷键：
   - Windows / Linux: `Ctrl+Shift+X`
   - macOS: `Cmd+Shift+X`
3. 在搜索框中输入 `"Remember Me"` 或 `"AI 记忆管家"`
4. 找到 **"Remember Me - AI记忆管家"** 插件
5. 点击 **安装** 按钮
6. 安装完成后，点击 **重新加载** 激活插件

### 安装后自动触发

插件激活后会自动检查是否为首次使用：
- **首次使用**：3 秒后弹出欢迎提示，引导你完成设置向导
- **已有数据**：自动恢复上次的记忆状态

---

## 从 VSIX 安装

适用于测试预发布版本或内网环境无法访问扩展市场的情况。

### 步骤

1. 从以下渠道获取 `.vsix` 文件：
   - [GitHub Releases](https://github.com/ltgkb/remember-me/releases)
   - 内部测试群 / 邮件分发

2. 在 VS Code 中打开命令面板：
   - Windows / Linux: `Ctrl+Shift+P`
   - macOS: `Cmd+Shift+P`

3. 输入并选择：**"扩展：从 VSIX 安装"**（Extensions: Install from VSIX）

4. 在文件选择器中，找到并选择下载的 `.vsix` 文件

5. 等待安装完成，点击 **重新加载** 激活插件

---

## 源码安装

适用于开发者参与贡献或需要自定义功能。

### 环境准备

```bash
# 确认已安装 Node.js 18+
node --version

# 确认已安装 Git
git --version

# 确认已安装 VS Code
code --version
```

### 克隆与构建

```bash
# 1. 克隆仓库
git clone https://github.com/ltgkb/remember-me.git
cd remember-me

# 2. 进入插件目录
cd packages/vscode-extension

# 3. 安装依赖
npm install

# 4. 编译 TypeScript
npm run compile

# 5. （可选）启动监听模式，自动编译修改
npm run watch
```

### 启动调试

在 VS Code 中打开 `packages/vscode-extension` 文件夹，然后：

1. 按 `F5` 或点击左侧调试图标
2. 这会打开一个新的 **Extension Development Host** 窗口
3. 在新窗口中测试插件功能

### 打包为 VSIX

```bash
# 安装 vsce 工具（如未安装）
npm install -g @vscode/vsce

# 打包
cd packages/vscode-extension
vsce package

# 生成的 .vsix 文件可用于分发
```

---

## 安装后验证

安装完成后，请按以下步骤验证插件是否正常工作：

### 1. 检查状态栏

VS Code 底部状态栏应出现 **🧠 Remember Me** 图标。点击图标应弹出菜单：
- 打开设置
- 开始对话
- 切换项目
- 搜索记忆

### 2. 检查侧边栏

左侧活动栏应出现 **⏱ 历史图标**。点击后侧边栏应显示：
- "欢迎使用 Remember Me！"
- "开始设置" 按钮

### 3. 检查命令

打开命令面板（`Ctrl+Shift+P`），搜索 `"Remember Me"`，应看到全部 10+ 个命令。

### 4. 运行设置向导

执行命令 **"Remember Me: 打开设置向导"**，确认向导页面能正常加载。

---

## 故障排除

### 插件未激活

**现象**：状态栏未出现 🧠 图标，命令面板搜索不到 Remember Me 命令。

**排查步骤**：
1. 确认 VS Code 版本 ≥ 1.85.0（帮助 > 关于）
2. 检查插件是否已启用：扩展面板 > 搜索 Remember Me > 确认未禁用
3. 查看输出面板（`Ctrl+Shift+U`）> 选择 "扩展宿主" 日志
4. 尝试重新加载窗口：命令面板 > "重新加载窗口"

### 设置向导无法打开

**现象**：点击"开始设置"后无反应或显示空白页。

**排查步骤**：
1. 检查 VS Code 是否有网络限制（Webview 需要加载本地 HTML）
2. 查看开发者工具：帮助 > 切换开发人员工具 > Console 标签
3. 确认 `out/` 目录下已生成编译后的 `.js` 文件

### 编译失败

**现象**：运行 `npm run compile` 时报错。

**常见原因**：

| 错误信息 | 原因 | 解决 |
|----------|------|------|
| `Cannot find module 'vscode'` | 缺少 VS Code 类型定义 | `npm install` |
| `error TS2307` | 导入路径错误 | 检查 `tsconfig.json` 的 `rootDir` 和 `outDir` |
| `error TS2345` | 类型不匹配 | 确保使用 TypeScript 5.3+ |

### AI 对话无响应

**现象**：点击"开始对话"后，AI 未返回内容。

**排查步骤**：
1. 检查 AI 提供商配置：设置 > Remember Me > API 密钥
2. 确认网络连接正常（云端模型）
3. 确认 Ollama / LM Studio 已启动（本地模型）
4. 查看输出面板 > "Remember Me" 日志

---

## 获取帮助

如以上步骤无法解决问题，请：

1. 查看 [常见问题](../README.md#-常见问题)
2. 在 [GitHub Issues](https://github.com/ltgkb/remember-me/issues) 搜索类似问题
3. 提交新 Issue，附上：
   - VS Code 版本
   - 插件版本
   - 操作系统
   - 复现步骤
   - 相关日志（输出面板 > Remember Me）
