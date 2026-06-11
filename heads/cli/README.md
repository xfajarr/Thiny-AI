# @thiny/cli

> Beautiful TUI agent CLI with interactive chat and tool execution

[![npm](https://img.shields.io/npm/v/@thiny/cli)](https://www.npmjs.com/package/@thiny/cli)

## Install

```bash
pnpm add -g @thiny/cli
```

## Usage

```bash
# Start interactive chat
thiny

# With specific model
thiny --model openai/gpt-4o

# Non-interactive query
thiny run "What is the ETH price?"
```

## Features

- Interactive TUI with ASCII art header
- Streaming SSE responses
- Multi-session support
- Tool call visualization
- EVM + Solana wallet integration

[📖 Full docs →](https://github.com/thiny-ai/thiny/tree/main/heads/cli)

---

*Part of the [Thiny AI](https://github.com/thiny-ai/thiny) framework*
