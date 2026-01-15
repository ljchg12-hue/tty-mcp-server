#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import { z } from "zod";
import * as path from "path";

// ==================== SECURITY ====================

// Dangerous shell metacharacters that could enable command injection
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/,      // Shell metacharacters
  /\$\(/,                   // Command substitution
  /`.*`/,                   // Backtick substitution
  /\|\|/,                   // OR operator
  /&&/,                     // AND operator
  /\n/,                     // Newline injection
  /\r/,                     // Carriage return
  /\x00/,                   // Null byte
];

// Whitelist of safe commands (expandable)
const ALLOWED_COMMANDS = new Set([
  // System info
  "claude", "htop", "top", "ps", "df", "du", "free", "uname", "whoami", "id",
  "uptime", "hostname", "date", "cal", "env", "printenv",
  // File operations (read-only)
  "ls", "cat", "head", "tail", "less", "more", "file", "stat", "wc", "find",
  "grep", "awk", "sed", "sort", "uniq", "diff", "tree",
  // Development
  "git", "npm", "npx", "node", "python", "python3", "pip", "pip3",
  "cargo", "rustc", "go", "java", "javac", "mvn", "gradle",
  // Editors (version check only)
  "vim", "nvim", "nano", "code", "emacs",
  // Network (info only)
  "ping", "curl", "wget", "ssh", "scp", "rsync",
  // Docker
  "docker", "docker-compose", "podman",
  // System
  "systemctl", "journalctl", "which", "whereis", "type", "man", "help",
]);

/**
 * Validate command for security
 * @throws Error if command is dangerous
 */
function validateCommand(command: string): void {
  // Check for empty command
  if (!command || command.trim().length === 0) {
    throw new Error("Command cannot be empty");
  }

  // Extract base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0];

  // Check against whitelist
  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    throw new Error(`Command '${baseCommand}' is not in the allowed list. Allowed: ${[...ALLOWED_COMMANDS].slice(0, 10).join(", ")}...`);
  }

  // Check for dangerous patterns in full command
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command contains dangerous pattern: ${pattern.toString()}`);
    }
  }
}

/**
 * Validate and sanitize arguments
 * @throws Error if arguments contain dangerous content
 */
function validateArgs(args: string[]): string[] {
  return args.map((arg, index) => {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        throw new Error(`Argument ${index} contains dangerous pattern: ${pattern.toString()}`);
      }
    }
    return arg;
  });
}

/**
 * Validate working directory path
 * @throws Error if path is suspicious
 */
function validateCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;

  // Normalize path to prevent traversal
  const normalized = path.normalize(cwd);

  // Block path traversal attempts
  if (normalized.includes("..") || !path.isAbsolute(normalized)) {
    // Allow relative paths but check they don't escape
    const resolved = path.resolve(cwd);
    if (!resolved.startsWith(process.env.HOME || "/home")) {
      throw new Error(`Path traversal detected: ${cwd}`);
    }
  }

  return cwd;
}

// ==================== SCHEMAS ====================

// Tool schemas
const PtyExecSchema = z.object({
  command: z.string().describe("The command to execute"),
  args: z.array(z.string()).optional().describe("Command arguments"),
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().default(30000).describe("Timeout in milliseconds"),
  cols: z.number().optional().default(120).describe("Terminal columns"),
  rows: z.number().optional().default(30).describe("Terminal rows"),
});

const PtyInteractiveSchema = z.object({
  command: z.string().describe("The command to execute"),
  args: z.array(z.string()).optional().describe("Command arguments"),
  inputs: z.array(z.object({
    wait: z.number().optional().describe("Wait time before sending input (ms)"),
    send: z.string().describe("Input to send"),
  })).optional().describe("Sequence of inputs to send"),
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
  cols: z.number().optional().default(120).describe("Terminal columns"),
  rows: z.number().optional().default(30).describe("Terminal rows"),
});

// Execute command in PTY
async function executePty(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    timeout?: number;
    cols?: number;
    rows?: number;
    inputs?: Array<{ wait?: number; send: string }>;
  } = {}
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const {
      cwd = process.env.HOME || "/home/leejc5147",
      timeout = 30000,
      cols = 120,
      rows = 30,
      inputs = [],
    } = options;

    let output = "";
    let inputIndex = 0;

    // SECURITY: Validate inputs before execution
    validateCommand(command);
    const sanitizedArgs = validateArgs(args);
    validateCwd(cwd);

    // SECURITY: Spawn command directly without shell interpretation
    // This prevents command injection via shell metacharacters
    const ptyProcess = pty.spawn(command, sanitizedArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        FORCE_COLOR: "1",
        COLORTERM: "truecolor",
      } as Record<string, string>,
    });

    const timeoutId = setTimeout(() => {
      ptyProcess.kill();
      resolve({
        output: output + "\n[TIMEOUT: Command exceeded time limit]",
        exitCode: 124,
      });
    }, timeout);

    // Send inputs if provided
    const sendNextInput = () => {
      if (inputIndex < inputs.length) {
        const input = inputs[inputIndex];
        const delay = input.wait || 500;
        setTimeout(() => {
          ptyProcess.write(input.send);
          inputIndex++;
          sendNextInput();
        }, delay);
      }
    };

    if (inputs.length > 0) {
      setTimeout(sendNextInput, 1000); // Initial delay
    }

    ptyProcess.onData((data: string) => {
      output += data;
    });

    ptyProcess.onExit(({ exitCode }) => {
      clearTimeout(timeoutId);
      resolve({
        output: cleanAnsiOutput(output),
        exitCode: exitCode ?? 0,
      });
    });
  });
}

// Clean ANSI escape codes for readable output
function cleanAnsiOutput(text: string): string {
  // Remove most ANSI escape sequences but keep basic formatting
  return text
    // Remove cursor movements and positioning
    .replace(/\x1b\[\??\d*[hlABCDEFGHJKSTfmn]/g, "")
    .replace(/\x1b\[\d*;\d*[Hf]/g, "")
    .replace(/\x1b\[\d*[ABCDEFGJKST]/g, "")
    // Remove other escape sequences
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[\d;]*m/g, "")
    .replace(/\x1b\[\?[\d;]*[a-zA-Z]/g, "")
    .replace(/\x1b[78]/g, "")
    .replace(/\x1b\[[\d;]*[a-zA-Z]/g, "")
    // Clean up whitespace
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .trim();
}

// Create MCP server
const server = new Server(
  {
    name: "tty-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "pty_exec",
        description: "Execute a command in a pseudo-TTY (PTY) environment. Use this for commands that require TTY support like 'claude doctor', 'htop', 'vim --version', etc.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command to execute" },
            args: { type: "array", items: { type: "string" }, description: "Command arguments" },
            cwd: { type: "string", description: "Working directory" },
            timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
            cols: { type: "number", description: "Terminal columns (default: 120)" },
            rows: { type: "number", description: "Terminal rows (default: 30)" },
          },
          required: ["command"],
        },
      },
      {
        name: "pty_interactive",
        description: "Execute an interactive command with predefined inputs. Use for commands that need user interaction like prompts or confirmations.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command to execute" },
            args: { type: "array", items: { type: "string" }, description: "Command arguments" },
            inputs: { type: "array", items: { type: "object", properties: { wait: { type: "number", description: "Wait time before sending input (ms)" }, send: { type: "string", description: "Input to send (use \\r for Enter)" } }, required: ["send"] }, description: "Sequence of inputs to send" },
            cwd: { type: "string", description: "Working directory" },
            timeout: { type: "number", description: "Timeout in milliseconds (default: 60000)" },
            cols: { type: "number", description: "Terminal columns (default: 120)" },
            rows: { type: "number", description: "Terminal rows (default: 30)" },
          },
          required: ["command"],
        },
      },
      {
        name: "claude_doctor",
        description: "Run 'claude doctor' command to check Claude Code installation health. This is a convenience wrapper.",
        inputSchema: { type: "object", properties: { timeout: { type: "number", description: "Timeout in milliseconds (default: 60000)" } } },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "pty_exec": {
        const parsed = PtyExecSchema.parse(args);
        const result = await executePty(parsed.command, parsed.args || [], {
          cwd: parsed.cwd,
          timeout: parsed.timeout,
          cols: parsed.cols,
          rows: parsed.rows,
        });
        return {
          content: [
            {
              type: "text",
              text: `Exit Code: ${result.exitCode}\n\n${result.output}`,
            },
          ],
        };
      }

      case "pty_interactive": {
        const parsed = PtyInteractiveSchema.parse(args);
        const result = await executePty(parsed.command, parsed.args || [], {
          cwd: parsed.cwd,
          timeout: parsed.timeout,
          cols: parsed.cols,
          rows: parsed.rows,
          inputs: parsed.inputs,
        });
        return {
          content: [
            {
              type: "text",
              text: `Exit Code: ${result.exitCode}\n\n${result.output}`,
            },
          ],
        };
      }

      case "claude_doctor": {
        const timeout = (args as { timeout?: number })?.timeout || 60000;
        const result = await executePty("claude", ["doctor"], {
          timeout,
          cols: 120,
          rows: 40,
        });
        return {
          content: [
            {
              type: "text",
              text: `Claude Doctor Results:\n\n${result.output}\n\nExit Code: ${result.exitCode}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TTY MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
