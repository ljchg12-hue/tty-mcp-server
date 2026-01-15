#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import { z } from "zod";
import * as path from "path";

const DANGEROUS_PATTERNS = [/[;&|`$(){}[\]<>]/, /\$\(/, /`.*`/, /\|\|/, /&&/, /\n/, /\r/, /\x00/];
const ALLOWED_COMMANDS = new Set(["claude", "htop", "top", "ps", "df", "du", "free", "uname", "whoami", "id", "uptime", "hostname", "date", "cal", "env", "printenv", "ls", "cat", "head", "tail", "less", "more", "file", "stat", "wc", "find", "grep", "awk", "sed", "sort", "uniq", "diff", "tree", "git", "npm", "npx", "node", "python", "python3", "pip", "pip3", "cargo", "rustc", "go", "java", "javac", "mvn", "gradle", "vim", "nvim", "nano", "code", "emacs", "ping", "curl", "wget", "ssh", "scp", "rsync", "docker", "docker-compose", "podman", "systemctl", "journalctl", "which", "whereis", "type", "man", "help"]);

function validateCommand(command: string): void {
  if (!command?.trim()) throw new Error("Empty command");
  const base = command.trim().split(/\s+/)[0];
  if (!ALLOWED_COMMANDS.has(base)) throw new Error(`Not allowed: ${base}`);
  for (const p of DANGEROUS_PATTERNS) if (p.test(command)) throw new Error("Dangerous pattern");
}

function validateArgs(args: string[]): string[] {
  return args.map((arg) => { for (const p of DANGEROUS_PATTERNS) if (p.test(arg)) throw new Error("Dangerous arg"); return arg; });
}

function validateCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const normalized = path.normalize(cwd);
  if (normalized.includes("..") || !path.isAbsolute(normalized)) {
    const resolved = path.resolve(cwd);
    if (!resolved.startsWith(process.env.HOME || "/home")) throw new Error("Path traversal");
  }
  return cwd;
}

const PtyExecSchema = z.object({ command: z.string(), args: z.array(z.string()).optional(), cwd: z.string().optional(), timeout: z.number().optional().default(30000), cols: z.number().optional().default(120), rows: z.number().optional().default(30) });
const PtyInteractiveSchema = z.object({ command: z.string(), args: z.array(z.string()).optional(), inputs: z.array(z.object({ wait: z.number().optional(), send: z.string() })).optional(), cwd: z.string().optional(), timeout: z.number().optional().default(60000), cols: z.number().optional().default(120), rows: z.number().optional().default(30) });

async function executePty(command: string, args: string[] = [], options: { cwd?: string; timeout?: number; cols?: number; rows?: number; inputs?: Array<{ wait?: number; send: string }> } = {}): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const { cwd = process.env.HOME || "/home/leejc5147", timeout = 30000, cols = 120, rows = 30, inputs = [] } = options;
    let output = "", inputIndex = 0;
    validateCommand(command);
    const sanitizedArgs = validateArgs(args);
    validateCwd(cwd);
    const proc = pty.spawn(command, sanitizedArgs, { name: "xterm-256color", cols, rows, cwd, env: { ...process.env, TERM: "xterm-256color" } as Record<string, string> });
    const tid = setTimeout(() => { proc.kill(); resolve({ output: output + "\n[TIMEOUT]", exitCode: 124 }); }, timeout);
    const sendNext = () => { if (inputIndex < inputs.length) { const input = inputs[inputIndex]; setTimeout(() => { proc.write(input.send); inputIndex++; sendNext(); }, input.wait || 500); } };
    if (inputs.length > 0) setTimeout(sendNext, 1000);
    proc.onData((data: string) => { output += data; });
    proc.onExit(({ exitCode }) => { clearTimeout(tid); resolve({ output: output.replace(/\x1b\[[;\d]*[A-Za-z]/g, "").replace(/\r\n/g, "\n").trim(), exitCode: exitCode ?? 0 }); });
  });
}

const server = new Server({ name: "tty-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "pty_exec", description: "Execute PTY command", inputSchema: { type: "object", properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" } }, cwd: { type: "string" }, timeout: { type: "number" }, cols: { type: "number" }, rows: { type: "number" } }, required: ["command"] } },
    { name: "pty_interactive", description: "Interactive PTY command", inputSchema: { type: "object", properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" } }, inputs: { type: "array", items: { type: "object", properties: { wait: { type: "number" }, send: { type: "string" } }, required: ["send"] } }, cwd: { type: "string" }, timeout: { type: "number" }, cols: { type: "number" }, rows: { type: "number" } }, required: ["command"] } },
    { name: "claude_doctor", description: "Run claude doctor", inputSchema: { type: "object", properties: { timeout: { type: "number" } } } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "pty_exec": { const p = PtyExecSchema.parse(args); const r = await executePty(p.command, p.args || [], { cwd: p.cwd, timeout: p.timeout, cols: p.cols, rows: p.rows }); return { content: [{ type: "text", text: `Exit: ${r.exitCode}\n${r.output}` }] }; }
      case "pty_interactive": { const p = PtyInteractiveSchema.parse(args); const r = await executePty(p.command, p.args || [], { cwd: p.cwd, timeout: p.timeout, cols: p.cols, rows: p.rows, inputs: p.inputs }); return { content: [{ type: "text", text: `Exit: ${r.exitCode}\n${r.output}` }] }; }
      case "claude_doctor": { const timeout = (args as { timeout?: number })?.timeout || 60000; const r = await executePty("claude", ["doctor"], { timeout, cols: 120, rows: 40 }); return { content: [{ type: "text", text: r.output }] }; }
      default: return { content: [{ type: "text", text: `Unknown: ${name}` }], isError: true };
    }
  } catch (error) { return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true }; }
});

async function main() { const transport = new StdioServerTransport(); await server.connect(transport); }
main().catch(() => process.exit(1));
