// Node.js built-ins
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

// Local modules
import { logger } from './logger.js';
import { ToolResult } from './types.js';

// Function to get Claude CLI path - requires explicit configuration
export function getClaudeCLIPath(): string {
  // 1. Check for CLAUDE_CLI_PATH environment variable
  if (process.env.CLAUDE_CLI_PATH) {
    return process.env.CLAUDE_CLI_PATH;
  }
  
  // 2. Check for command line argument (--claude-cli-path)
  const args = process.argv;
  const cliPathIndex = args.indexOf('--claude-cli-path');
  if (cliPathIndex !== -1 && cliPathIndex + 1 < args.length) {
    return args[cliPathIndex + 1];
  }
  
  // No path provided - force user to specify
  console.error('ERROR: Claude CLI path not specified!');
  console.error('You must provide the Claude CLI path using one of these methods:');
  console.error('  - Environment variable: CLAUDE_CLI_PATH=/path/to/claude');
  console.error('  - Command line argument: --claude-cli-path /path/to/claude');
  console.error('');
  console.error('Examples:');
  console.error('  CLAUDE_CLI_PATH=/usr/local/bin/claude web-tools-mcp');
  console.error('  web-tools-mcp --claude-cli-path /usr/local/bin/claude');
  console.error('  web-tools-mcp --claude-cli-path "C:\\Users\\Username\\AppData\\Roaming\\npm\\claude.cmd"');
  process.exit(1);
}

// Function to validate Claude CLI path exists
export function validateClaudeCLIPath(cliPath: string): boolean {
  try {
    const cleanPath = cliPath.replace(/^"(.*)"$/, '$1');
    return existsSync(cleanPath);
  } catch (error) {
    return false;
  }
}

// Claude CLI configuration with customization support
const isWindows = platform() === "win32";
const CLAUDE_CLI = getClaudeCLIPath();

// Validate Claude CLI path exists
if (!validateClaudeCLIPath(CLAUDE_CLI)) {
  const cleanPath = CLAUDE_CLI.replace(/^"(.*)"$/, '$1');
  console.error(`ERROR: Claude CLI path does not exist: ${cleanPath}`);
  console.error('Please verify the path is correct and the file exists.');
  process.exit(1);
}

const OUTPUT_FORMAT = "stream-json";

export function buildSyntheticMessage(toolName: string, parameters: any): any {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_use",
          name: toolName,
          input: parameters,
          id: "tool_use_1"
        }
      ]
    }
  };
}

export function parseStreamJsonOutput(output: string): string | null {
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      
      // Look for the user message containing tool results
      if (msg.type === "user" && 
          msg.message && 
          msg.message.content) {
        
        const content = msg.message.content;
        for (const item of content) {
          if (item.type === "tool_result" && item.content) {
            return item.content;
          }
        }
      }
    } catch (error) {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  return null;
}

// Unified Claude CLI execution interface
interface ClaudeExecutionConfig {
  toolName?: string;
  allowedTools?: string;
  parameters?: any;
  outputFormat?: 'stream-json' | 'text';
  prompt?: string;
  debug?: boolean;
}

export async function executeClaudeCLI(config: ClaudeExecutionConfig): Promise<ToolResult> {
  const { toolName, allowedTools, parameters, outputFormat = 'stream-json', prompt, debug = false } = config;
  
  return new Promise((resolve, reject) => {
    let stdinPayload: string;
    let cmd: string[];
    
    if (prompt) {
      // Direct prompt mode
      stdinPayload = prompt;
      cmd = [
        "--print",
        "--output-format", "text",
        "--max-turns", "1"
      ];
    } else if (toolName && allowedTools && parameters) {
      // Tool execution mode
      const syntheticMessage = buildSyntheticMessage(toolName, parameters);
      stdinPayload = JSON.stringify(syntheticMessage) + '\n';
      cmd = [
        "--print",
        "--output-format", outputFormat,
        "--allowedTools", allowedTools,
        "--max-turns", "1",
        "--verbose"
      ];
    } else {
      reject(new Error('Invalid configuration: either prompt or (toolName + allowedTools + parameters) must be provided'));
      return;
    }
    
    if (debug) {
      logger.debug(`Running: ${CLAUDE_CLI} ${cmd.join(' ')}`, 'executeClaudeCLI');
    }
    
    const proc = spawn(CLAUDE_CLI, cmd, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: isWindows
    });
    
    let stdout = '';
    let stderr = '';
    let isResolved = false;
    
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        
        if (!proc.killed) {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 2000);
        }
        
        const operation = prompt ? 'prompt' : toolName || 'operation';
        reject(new Error(`Claude CLI ${operation} timed out after 120 seconds. This may indicate Claude CLI is unresponsive.`));
      }
    }, 120000);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        
        if (debug && stderr.trim()) {
          logger.debug(`CLI stderr: ${stderr}`, 'executeClaudeCLI');
        }
        
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        
        let result: ToolResult;
        
        if (prompt) {
          // Direct prompt result
          result = {
            results: stdout.trim(),
            raw_content: stdout.trim()
          };
        } else {
          // Tool execution result
          const toolContent = parseStreamJsonOutput(stdout);
          
          if (!toolContent) {
            reject(new Error(`No ${toolName} results found in Claude CLI output`));
            return;
          }
          
          result = {
            results: toolContent,
            raw_content: toolContent
          };
          
          if (toolName === "web_search") {
            result.query = parameters.query;
          } else if (toolName === "web_fetch") {
            result.url = parameters.url;
          }
        }
        
        resolve(result);
      }
    });
    
    proc.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      }
    });
    
    proc.stdin.write(stdinPayload);
    proc.stdin.end();
  });
}
