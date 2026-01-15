# tty-mcp-server

MCP (Model Context Protocol) server for executing TTY/PTY commands with security validation.

## Features

- **PTY Execution**: Run commands in a pseudo-terminal environment
- **Interactive Sessions**: Support for interactive command inputs
- **Security Validation**: Command whitelist and dangerous pattern detection
- **ANSI Support**: Full color and escape code support

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server

Add to your Claude Code MCP configuration (`~/.mcp.json`):

```json
{
  "mcpServers": {
    "tty": {
      "command": "node",
      "args": ["/path/to/tty-mcp-server/build/index_minimal.js"],
      "env": {}
    }
  }
}
```

### Available Tools

#### `pty_exec`

Execute a command in PTY environment.

```json
{
  "command": "ls",
  "args": ["-la"],
  "cwd": "/home/user",
  "timeout": 30000,
  "cols": 120,
  "rows": 30
}
```

#### `pty_interactive`

Execute interactive commands with sequential inputs.

```json
{
  "command": "npm",
  "args": ["init"],
  "inputs": [
    { "wait": 1000, "send": "my-package\n" },
    { "wait": 500, "send": "\n" }
  ],
  "timeout": 60000
}
```

#### `claude_doctor`

Run Claude diagnostic checks.

## Security

### Allowed Commands

Only whitelisted commands are permitted:

- System: `ls`, `cat`, `head`, `tail`, `grep`, `find`, `ps`, `df`, `du`, `free`
- Development: `git`, `npm`, `npx`, `node`, `python`, `python3`, `cargo`, `go`
- Editors: `vim`, `nvim`, `nano`, `code`
- Network: `ping`, `curl`, `wget`, `ssh`
- Container: `docker`, `docker-compose`, `podman`
- And more...

### Blocked Patterns

Dangerous patterns are automatically blocked:

- Shell operators: `; | & $ () {} [] < >`
- Command substitution: `$()`, backticks
- Newlines and null bytes

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Run in Development

```bash
npm run dev
```

## Project Structure

```
tty-mcp-server/
├── src/
│   ├── index.ts          # Full MCP server
│   ├── index_minimal.ts  # Minimal MCP server
│   └── utils.ts          # Utility functions
├── test/
│   └── utils.test.ts     # Unit tests
├── build/                # Compiled output
├── package.json
├── tsconfig.json
└── CLAUDE.md            # AI assistant rules
```

## License

MIT

## Author

Created with Claude Code
