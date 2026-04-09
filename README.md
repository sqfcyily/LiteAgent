# LiteAgent

LiteAgent 是一个轻量级的 AI Agent Harness（智能体运行时支架）CLI 框架。

本项目深度参考了 Anthropic 官方发布的 **Claude Code** 的架构设计，并采用了与其相同的现代前端与 Node.js 技术栈（TypeScript + React Ink + Bun）。本项目的核心目标是为开发者提供一个极简、易读的 Agent 学习模型，剥离复杂的商业化冗余代码，帮助初学者快速掌握大语言模型（LLM）对话主循环、工具调用（Tool Use/Function Calling）以及终端 UI 渲染的核心逻辑。

## 🌟 核心特性

- **架构同源**: 采用与 Claude Code 一致的 React Ink 虚拟 DOM 终端渲染方案与流式异步生成器（Async Generator）引擎。
- **开箱即用**: 内置终端对话 UI、设置向导、Markdown 渲染与多模型热切换功能。
- **极简学习**: 代码结构清晰，注释详尽，是研究 Agent Harness 底层机制的绝佳脚手架。
- **高扩展性**: 原生支持 MCP（Model Context Protocol）生态与自定义 Skill 加载。

---

## 🚀 开始使用

LiteAgent 支持作为全局 NPM 包直接运行，也可以通过源码在本地构建运行。

### 方式一：通过 NPM 直接运行（推荐）

本项目已发布至 npmjs。如果你已经安装了 Node.js 环境，可以将其安装为全局命令：

```bash
# 全局安装
npm install -g @sqfcy/liteagent

# 安装后，可通过以下命令启动
liteagent
# 或使用短命令
la
```

### 方式二：通过源码与 Bun 运行

对于希望阅读、修改和学习源码的初学者，推荐克隆本仓库并使用 `Bun` 运行。

**关于 Bun 的下载与使用（初学者指南）：**
Bun 是一个极速的 JavaScript/TypeScript 运行时，内置了包管理器和打包工具，执行速度远超传统的 Node.js。
- **macOS / Linux 安装**: 打开终端执行 `curl -fsSL https://bun.sh/install | bash`
- **Windows 安装**: 打开 PowerShell 执行 `powershell -c "irm bun.sh/install.ps1 | iex"`（或通过 npm 安装：`npm install -g bun`）
- **验证安装**: 运行 `bun --version` 确认安装成功。

**源码运行步骤：**

```bash
# 1. 克隆项目
git clone https://github.com/sqfcyily/LiteAgent.git
cd LiteAgent

# 2. 安装依赖
bun install

# 3. 启动应用
bun start
```

*首次启动时，系统会引导你配置 `BASE_URL`、`MODEL_NAME` 和 `API_KEY`。*

### 🔍 开发者模式（Dev Mode）与日志分析

对于希望深入研究 Agent 对话流程、API 请求负载（Payload）以及底层事件流转的开发者，LiteAgent 提供了专门的开发者模式。

- **开启方式**：
  - 启动时附加参数：`bun start --dev` 或 `la --dev`
  - 在对话过程中动态开启：在输入框直接输入 `/dev` 指令。
- **日志输出**：开启该模式后，系统会在**当前运行目录**下自动生成并实时写入 `lite-agent-dev.log` 文件。
- **分析价值**：该日志记录了每一次与大模型的 API 交互详情（包含完整的 Prompt、Tool Calls、上下文压缩情况等），是调试提示词和排查工具调用失败的绝佳依据。

---

## 📂 项目目录说明

```text
LiteAgent/
├── src/
│   ├── buddy/            # React Ink 终端 UI 层（负责终端渲染、输入接管、配置向导）
│   ├── commands/         # CLI 命令行入口解析
│   ├── config/           # 配置文件读写与全局模型状态管理
│   ├── mcp/              # Model Context Protocol (MCP) 客户端与工具集成
│   ├── services/         # Agent 核心驱动层（包含 agentEngine 对话主循环）
│   ├── skills/           # 动态 Skill 加载器（负责读取和解析自定义技能工作流）
│   ├── tools/            # 内置系统工具实现（Bash执行、文件读写、权限校验等）
│   └── main.tsx          # 应用程序主入口
├── package.json          # 项目依赖与 NPM 脚本
└── tsconfig.json         # TypeScript 编译配置
```

---

## 🧠 核心架构与逻辑说明

为了帮助初学者快速理解 Agent Harness 的运作原理，以下是本项目中四个最核心的技术设计：

### 1. 对话主循环 (Conversation Main Loop)
Agent 的核心并非单次的一问一答，而是一个基于状态机的**循环系统**（位于 `src/services/agentEngine.ts`）。
LiteAgent 采用了异步生成器（`async function*`）来驱动主循环：
- 引擎向大模型发起流式请求，实时 yield 文本块供 UI 渲染。
- 当大模型决定调用工具时（触发 `tool_calls`），引擎会挂起生成器，暂停文本输出。
- 引擎在本地执行大模型指定的工具，获取结果（stdout/stderr）。
- 引擎将执行结果包装为 `tool_result` 角色，**追加到上下文消息数组中**，并自动发起下一轮 LLM 请求。
- 循环直至大模型判定任务完成，输出最终文本。

### 2. 工具调用 (Tool Invocation)
工具是大模型与物理世界交互的手脚。LiteAgent 的工具系统（`src/tools/`）设计如下：
- **Schema 定义**: 强制使用 `Zod` 定义工具的输入参数结构，大模型必须严格遵循此结构输出 JSON。
- **并发与权限**: 框架层支持工具的并行执行校验，并在敏感工具（如执行 Shell 命令）调用前，通过权限管道拦截，确保系统安全。
- **标准化接口**: 所有工具继承自统一的基类，开发者只需实现 `execute` 方法，即可轻松扩展自定义工具。

### 3. Skill 加载 (Skill Loading)
为了避免系统提示词（System Prompt）过于臃肿导致 Token 浪费与指令漂移，LiteAgent 引入了动态 Skill 加载机制。
- 框架会在启动时扫描特定目录下的技能定义（Markdown/YAML）。
- 根据用户的当前输入意图，按需将相关的专家级工作流（Workflow）、规范和上下文注入到 System Prompt 中。
- 这种模块化的提示词工程，使得一个轻量级 Agent 能够灵活地在“前端专家”、“运维工程师”等多种角色间无缝切换。

### 4. Fork 模式设计 (Fork Mode Design)
在处理极其复杂的代码检索或试错性质的任务时，传统的单线对话会导致上下文迅速被垃圾信息填满（Context Pollution），进而引发 Token 爆炸和模型幻觉。
- **分支探索**: 架构支持在当前对话节点“Fork”出一个隐形的子 Agent 进程。
- **状态隔离**: 子 Agent 携带特定的目标（如：搜索某个 API 的具体用法），在独立且干净的上下文中大量调用搜索、读取工具进行试错。
- **结果归并**: 当子 Agent 找到答案后，它会对探索过程进行摘要，并仅将**最终结论**返回给主进程。这不仅保护了主线对话的纯净性，也极大降低了长期运行的成本。

---

## 📄 开源协议

MIT License
