# AGENTS.md - TTY MCP Server
<!-- 범용 규칙: ~/AGENTS.md | MCP 원칙: ~/AGENTS.md#MCP-Development-Principles -->

## Codex CLI (Global)

- Config: `~/.codex/config.toml`
- Skills: `~/.codex/skills`
- Inherits: `~/AGENTS.md`

## Project

| Stack | TypeScript, Node.js, node-pty |
|-------|-------------------------------|
| Build | `npm run build` |
| Test | `npm test` |

## Local Rules (PTY 특화)

### Must Do
- PTY 라이프사이클 관리
- 터미널 기본값: 120x30
- 종료 시 PTY 정리
- ANSI 이스케이프 처리

### Must Not
- 좀비 PTY 프로세스 금지
- 무제한 버퍼 금지
- stdout 블로킹 금지

## Tools

| Tool | Description |
|------|-------------|
| `pty_exec` | PTY 명령 실행 |
| `pty_interactive` | 대화형 실행 |
| `claude_doctor` | 상태 확인 |
