# Remember Me - AI 记忆管家

Remember Me 为 VS Code 中的 AI 协作提供本地、透明、可检索的长期记忆。它会保存个人画像、做事风格、项目上下文和对话历史，并在后续请求中按需注入相关背景。

## 快速开始

1. 安装扩展后运行 `Remember Me: 打开设置向导`。
2. 选择云端 AI 时，运行 `Remember Me: 安全设置 API 密钥`。密钥保存在 VS Code SecretStorage，不会写入 `settings.json`。
3. 运行 `Remember Me: 开始对话`；完成的问答会自动进入对话历史，并立即可被推荐和关键词检索。

默认情况下，记忆以 JSON 文件保存在 `~/.remember-me/`。可通过 `rememberMe.memoryPath` 修改目录，修改后需重新加载 VS Code 窗口。

语义搜索是可选能力，需要单独安装并启动 Python `memory-engine`。服务不可用时，扩展会自动保留关键词搜索能力。

完整安装、使用和开发文档请查看 [GitHub 项目](https://github.com/ltgkb/remember-me)。

## 隐私与安全

- 记忆数据默认仅保存在本机。
- 云端 AI 请求会将当前输入及构建出的记忆 Prompt 发往你选择的提供商。
- API 密钥使用 VS Code SecretStorage 保存。
- Python 引擎默认只监听 `127.0.0.1`，不接受浏览器跨域请求。

## License

[MIT](LICENSE)
