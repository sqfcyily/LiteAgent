[中文](README.md) | [English](README.en.md)

# LiteAgent

LiteAgent is a lightweight AI Agent Harness CLI framework.

This project is heavily inspired by Anthropic's official **Claude Code** Agent Harness architecture and uses the same modern stack (TypeScript + React Ink + Bun). It provides a minimal, readable learning model for developers, removing commercial complexity and helping beginners quickly understand the core mechanics of LLM conversation loops, tool use (function calling), and terminal UI rendering.

## 🌟 Key Features

- **Architectural Parity**: Uses the same React Ink virtual DOM terminal rendering approach and an async generator engine similar to Claude Code.
- **Out of the Box**: Includes a built-in chat UI, setup wizard, Markdown rendering, and hot model switching.
- **Beginner Friendly**: Clear structure and easy-to-follow codebase—ideal for learning an Agent Harness from first principles.
- **Highly Extensible**: Native support for the MCP (Model Context Protocol) ecosystem and custom Skill loading.

---

## 🚀 Getting Started

LiteAgent can be installed globally via npm, or run from source locally.

### Option 1: Install via npm (Recommended)

LiteAgent is published on npm. If you have Node.js installed, you can install it globally:

```bash
# Global install
npm install -g @sqfcy/liteagent

# Start after installation
liteagent
# or the short alias
la
```

### Option 2: Run from source with Bun

If you want to read, modify, or learn from the source code, clone the repo and run it with `Bun`.

**Bun installation (Beginner guide):**
Bun is a fast JavaScript/TypeScript runtime with a built-in package manager and bundler, and it is often significantly faster than Node.js for local development.

- **macOS / Linux**: `curl -fsSL https://bun.sh/install | bash`
- **Windows**: `powershell -c "irm bun.sh/install.ps1 | iex"` (or install via npm: `npm install -g bun`)
- **Verify**: `bun --version`

**Run from source:**

```bash
# 1. Clone repo
git clone https://github.com/sqfcyily/LiteAgent.git
cd LiteAgent

# 2. Install dependencies
bun install

# 3. Start
bun start
```

_On first run, LiteAgent will guide you to configure `BASE_URL`, `MODEL_NAME`, and `API_KEY`._

### 📁 Configuration Directory (Auto-created)

LiteAgent creates a global configuration directory in your home folder to store the model registry, global config, and Skills.

- **Global directory**
  - macOS / Linux: `~/.liteagent/`
  - Windows: `%USERPROFILE%\.liteagent\`
- **Key files**
  - `.agentrc`: default global config (BASE_URL, MODEL_NAME, API_KEY, etc.)
  - `models.json`: model registry (models shown in the `/mode` menu)
  - `AGENT.md` / `SOUL.md`: optional global persona / behavior constraints (injected into the system prompt)
  - `skills/`: skills directory (one subfolder per skill)

### 🔍 Dev Mode & Log Analysis

For developers who want to study the conversation flow, API payloads, and event routing, LiteAgent provides a dedicated Dev Mode.

- **Enable**
  - CLI flag: `bun start --dev` or `la --dev`
  - In-chat command: type `/dev` in the input box
- **Logs**
  - When enabled, LiteAgent writes `lite-agent-dev.log` to the **current working directory**.
- **Why it matters**
  - The log includes LLM requests, tool calls, context compaction, and other runtime details—useful for debugging prompts and tool execution.

---

## 📂 Project Structure

```text
LiteAgent/
├── src/
│   ├── buddy/            # React Ink terminal UI layer (rendering, input handling, setup wizard)
│   ├── commands/         # CLI command entry parsing
│   ├── config/           # Config file I/O and global model state management
│   ├── mcp/              # Model Context Protocol (MCP) clients and tool integration
│   ├── services/         # Agent core driver layer (includes the agentEngine main loop)
│   ├── skills/           # Dynamic Skill loader (reads and parses custom skill workflows)
│   ├── tools/            # Built-in system tools (Bash execution, file I/O, permissions, etc.)
│   └── main.tsx          # Application main entry point
├── package.json          # Project dependencies and NPM scripts
└── tsconfig.json         # TypeScript compiler configuration
```

---

## 🧠 Core Architecture & Logic

To help beginners understand how an Agent Harness works, LiteAgent focuses on four key architectural concepts:

### 1. Conversation Main Loop

An agent is not a single request/response interaction; it is a state-driven loop (see `src/services/agentEngine.ts`).
LiteAgent uses an async generator (`async function*`) to drive this loop:

- Stream tokens from the LLM and yield text chunks for UI rendering.
- When the model decides to call tools (`tool_calls`), the generator pauses streaming output.
- Execute the requested tools locally and collect results (stdout/stderr).
- Wrap the results as `tool_result` messages, append to the conversation context, and continue the next LLM round.
- Repeat until the model outputs the final answer.

### 2. Tool Invocation

Tools are the agent's hands to interact with the real world. LiteAgent's tool system (`src/tools/`) follows these principles:

- **Schema**: Uses `Zod` to define tool input parameters; the model must output JSON matching this schema.
- **Concurrency & Permissions**: Supports parallel execution checks and permission gates for sensitive tools (e.g., shell execution).
- **Standard Interface**: Tools share a common base interface—implement `execute` to extend with new tools.

### 3. Skill Loading

To keep the system prompt lean and avoid token waste, LiteAgent supports dynamic Skill loading:

- Scan skill definitions from specific directories (Markdown/YAML).
- Inject only relevant expert workflows, rules, and context into the system prompt on demand.
- This modular prompt design lets a lightweight agent switch roles cleanly (e.g., frontend expert vs. ops engineer).

### 4. Fork Mode Design

For complex search / trial-and-error tasks, a single-thread conversation can quickly pollute context and explode tokens.

- **Branch exploration**: Fork an invisible sub-agent process from a conversation node.
- **State isolation**: The sub-agent works in a clean, isolated context and performs heavy tool usage.
- **Result merge**: Only the final summarized conclusion is merged back, keeping the main conversation clean and cost-effective.

---

## 📄 License

MIT License

