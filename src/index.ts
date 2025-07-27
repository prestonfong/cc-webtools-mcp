#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { platform, homedir } from "os";
import { join } from "path";
import { config } from 'dotenv';
import { existsSync } from 'fs';

config();

// Function to get Claude CLI path with customization support
function getClaudeCLIPath(): string {
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
  
  const platformType = platform();
  if (platformType === "win32") {
    const npmPath = join(homedir(), "AppData", "Roaming", "npm", "claude.cmd");
    return `"${npmPath}"`;
  } else {
    return "claude";
  }
}

// Function to validate Claude CLI path exists
function validateClaudeCLIPath(cliPath: string): boolean {
  try {
    
    const cleanPath = cliPath.replace(/^"(.*)"$/, '$1');
    
    
    if (cleanPath === 'claude') {
      return true;
    }
    
    
    return existsSync(cleanPath);
  } catch (error) {
    return false;
  }
}

// Claude CLI configuration with customization support
const isWindows = platform() === "win32";
const CLAUDE_CLI = getClaudeCLIPath();

// Validate Claude CLI path
if (!validateClaudeCLIPath(CLAUDE_CLI)) {
  const cleanPath = CLAUDE_CLI.replace(/^"(.*)"$/, '$1');
  if (cleanPath !== 'claude') {
    console.error(`Warning: Claude CLI path may not exist: ${cleanPath}`);
    console.error('You can specify a custom path using:');
    console.error('  - Environment variable: CLAUDE_CLI_PATH=/path/to/claude');
    console.error('  - Command line argument: --claude-cli-path /path/to/claude');
  }
}

const OUTPUT_FORMAT = "stream-json";


const WEB_SEARCH_TOOL: Tool = {
  name: "web_search",
  description: "Search the web for real-time information about any topic. Use this tool when you need up-to-date information that might not be available in your training data, or when you need to verify current facts.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up on the web"
      },
      allowed_domains: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Only include results from these domains"
      },
      blocked_domains: {
        type: "array", 
        items: {
          type: "string"
        },
        description: "Never include results from these domains"
      }
    },
    required: ["query"]
  }
};

const WEB_FETCH_TOOL: Tool = {
  name: "web_fetch",
  description: "Fetch content from a specific URL. Use this tool when you need to retrieve the content of a specific webpage.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch content from"
      }
    },
    required: ["url"]
  }
};

// Claude CLI wrapper functions
interface WebSearchParams {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

interface WebFetchParams {
  url: string;
}

interface ToolResult {
  query?: string;
  url?: string;
  results: string;
  raw_content: string;
}

function formatSearchResults(resultData: ToolResult, outputFormat: string = "clean"): string {
  if (outputFormat === "json") {
    return JSON.stringify(resultData, null, 2);
  }
  
  if (outputFormat === "verbose") {
    return JSON.stringify(resultData, null, 2);
  }
  
  // Clean format (default)
  const query = resultData.query || "";
  const results = resultData.results || "";
  
  if (!results) {
    return `No search results found for: ${query}`;
  }
  
  // Try to parse and format the results content
  try {
    if (typeof results === 'string') {
      // Look for the Links: [JSON] pattern in the results
      const linksMatch = results.match(/Links:\s*(\[.*?\])/s);
      
      if (linksMatch) {
        try {
          // Extract and parse the JSON links data
          const linksJson = linksMatch[1];
          const parsedResults = JSON.parse(linksJson);
          
          if (parsedResults && Array.isArray(parsedResults)) {
            const output = [`Search results for: ${query}\n`];
            parsedResults.forEach((result, i) => {
              const title = result.title || 'No title';
              const url = result.url || 'No URL';
              const snippet = `Link to ${title}` === title ? 'No description available' : `Link to ${title}`;
              
              output.push(`${i + 1}. ${title}`);
              output.push(`   URL: ${url}`);
              output.push(`   ${snippet}`);
              output.push('');
            });
            
            return output.join('\n');
          }
        } catch (error) {
          // Fall back to raw content if JSON parsing fails
        }
      }
      
      // Clean up the raw content
      let cleanContent = results;
      cleanContent = cleanContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      cleanContent = cleanContent.replace(/^\s+/gm, '');
      
      return `Search results for: ${query}\n\n${cleanContent}`;
    }
  } catch (error) {
    // Fallback to showing raw results if parsing fails
  }
  
  return `Search results for: ${query}\n\n${results}`;
}

function formatFetchResults(resultData: ToolResult, outputFormat: string = "clean"): string {
  if (outputFormat === "json") {
    return JSON.stringify(resultData, null, 2);
  }
  
  if (outputFormat === "verbose") {
    return JSON.stringify(resultData, null, 2);
  }
  
  // Clean format (default)
  const url = resultData.url || "";
  const content = resultData.results || "";
  
  if (!content) {
    return `No content found for: ${url}`;
  }
  
  // Try to extract title and clean content
  try {
    if (typeof content === 'string') {
      const lines = content.split('\n');
      let title = "";
      const mainContent: string[] = [];
      
      // Look for title patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Check if this looks like a title
        if (!title && (line.includes('**') || line.includes('##') || line.includes('<h1>') || line.includes('<title>') ||
                      (i < 5 && line.length > 10 && line.length < 100))) {
          // Clean up title markup
          title = line.replace(/\*\*/g, '').replace(/##/g, '').trim();
          title = title.replace(/<[^>]+>/g, ''); // Remove HTML tags
          title = title.replace(/&[^;]+;/g, ''); // Remove HTML entities (simple)
        } else {
          // Add to main content if it's substantial
          if (line.length > 20) {
            mainContent.push(line);
          }
        }
      }
      
      // Format the output
      const output: string[] = [];
      if (title) {
        output.push(`Title: ${title}`);
        output.push(`URL: ${url}`);
        output.push('-'.repeat(50));
        output.push('');
      } else {
        output.push(`Content from: ${url}`);
        output.push('-'.repeat(50));
        output.push('');
      }
      
      // Add content
      if (mainContent.length > 0) {
        const contentText = mainContent.join('\n\n');
        const cleanContentText = contentText.replace(/\n\s*\n\s*\n/g, '\n\n')
                                           .replace(/<[^>]+>/g, '')
                                           .replace(/^\s+/gm, '');
        output.push(cleanContentText);
      }
      
      return output.join('\n');
    }
    
    // Fallback if content is not a string
    return `Content from: ${url}\n${'-'.repeat(50)}\n\n${content}`;
  } catch (error) {
    // Fallback to showing raw results if parsing fails
    return `Content from: ${url}\n${'-'.repeat(50)}\n\n${content}`;
  }
}


function buildSyntheticMessage(toolName: string, parameters: any): any {
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

function parseStreamJsonOutput(output: string): string | null {
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

async function runClaudeCLI(toolName: string, allowedTools: string, parameters: any, debug: boolean = false): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const syntheticMessage = buildSyntheticMessage(toolName, parameters);
    const stdinPayload = JSON.stringify(syntheticMessage) + '\n';
    
    const cmd = [
      "--print",
      "--output-format", OUTPUT_FORMAT,
      "--allowedTools", allowedTools,
      "--max-turns", "1",
      "--verbose"
    ];
    
    if (debug) {
      console.error(`Running: ${CLAUDE_CLI} ${cmd.join(' ')}`);
    }
    
    const proc = spawn(CLAUDE_CLI, cmd, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: isWindows  // Required for .cmd files on Windows
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (debug && stderr.trim()) {
        console.error('CLI stderr:', stderr);
      }
      
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      
      const toolContent = parseStreamJsonOutput(stdout);
      
      if (!toolContent) {
        reject(new Error(`No ${toolName} results found in Claude CLI output`));
        return;
      }
      
      const result: ToolResult = {
        results: toolContent,
        raw_content: toolContent
      };
      
      if (toolName === "web_search") {
        result.query = parameters.query;
      } else if (toolName === "web_fetch") {
        result.url = parameters.url;
      }
      
      resolve(result);
    });
    
    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
    });
    
    // Send the synthetic message to stdin
    proc.stdin.write(stdinPayload);
    proc.stdin.end();
  });
}

async function runWebSearch(params: WebSearchParams, debug: boolean = false): Promise<ToolResult> {
  const toolParams: any = { query: params.query };
  
  if (params.allowed_domains) {
    toolParams.allowed_domains = params.allowed_domains;
  }
  
  if (params.blocked_domains) {
    toolParams.blocked_domains = params.blocked_domains;
  }
  
  return runClaudeCLI("web_search", "web_search", toolParams, debug);
}

async function runWebFetch(params: WebFetchParams, debug: boolean = false): Promise<ToolResult> {
  const toolParams = { url: params.url };
  return runClaudeCLI("web_fetch", "WebFetch", toolParams, debug);
}

// Create the MCP server
const server = new Server(
  {
    name: "Web Tools MCP",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {},
    }
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args || typeof args !== 'object') {
      throw new Error("No arguments provided");
    }

    let result: ToolResult;

    if (name === "web_search") {
      const { query, allowed_domains, blocked_domains } = args as WebSearchParams;
      
      if (!query || typeof query !== 'string') {
        throw new Error("Invalid query parameter");
      }
      
      result = await runWebSearch({ query, allowed_domains, blocked_domains });
      
    } else if (name === "web_fetch") {
      const { url } = args as WebFetchParams;
      
      if (!url || typeof url !== 'string') {
        throw new Error("Invalid url parameter");
      }
      
      result = await runWebFetch({ url });
      
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Return the formatted results using appropriate formatter
    let formattedText: string;
    if (name === "web_search") {
      formattedText = formatSearchResults(result, "clean");
    } else if (name === "web_fetch") {
      formattedText = formatFetchResults(result, "clean");
    } else {
      formattedText = result.results;
    }
    
    return {
      content: [{ type: "text", text: formattedText }]
    };
    
  } catch (error) {
    console.error(`Error executing tool:`, error);
    return {
      content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      isError: true
    };
  }
});

// Run the server via stdio
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Web Tools MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
