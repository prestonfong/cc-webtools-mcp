#!/usr/bin/env node

console.error('DEBUG: Starting module initialization');

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
import { randomUUID } from 'crypto';

// Import our modular components
import { ResearchStep, ResearchStepParams, ToolResult, WebSearchParams, WebFetchParams } from './types.js';


import { extractKeyFindings, analyzeSearchResults, analyzeFetchResults, assessInformationCompleteness, calculateConfidenceScore } from './helpers.js';
import { TOOLS } from './tools.js';

config();

interface ExtractedUrl {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

// Configuration parsing for intelligent research
interface ResearchConfig {
  maxCalls: number;
  autoResearch: boolean;
  researchThreshold: number;
}

function parseResearchConfig(): ResearchConfig {
  const args = process.argv;
  
  let maxCalls = 10; // Default value
  let autoResearch = false; // Default value
  let researchThreshold = 0.7; // Default value
  
  // Parse --max-calls argument
  const maxCallsIndex = args.indexOf('--max-calls');
  if (maxCallsIndex !== -1 && maxCallsIndex + 1 < args.length) {
    const parsedMaxCalls = parseInt(args[maxCallsIndex + 1], 10);
    if (!isNaN(parsedMaxCalls) && parsedMaxCalls > 0) {
      maxCalls = parsedMaxCalls;
    }
  }
  
  // Parse --auto-research argument
  const autoResearchIndex = args.indexOf('--auto-research');
  if (autoResearchIndex !== -1 && autoResearchIndex + 1 < args.length) {
    autoResearch = args[autoResearchIndex + 1].toLowerCase() === 'true';
  }
  
  // Parse --research-threshold argument
  const thresholdIndex = args.indexOf('--research-threshold');
  if (thresholdIndex !== -1 && thresholdIndex + 1 < args.length) {
    const parsedThreshold = parseFloat(args[thresholdIndex + 1]);
    if (!isNaN(parsedThreshold) && parsedThreshold >= 0 && parsedThreshold <= 1) {
      researchThreshold = parsedThreshold;
    }
  }
  
  return { maxCalls, autoResearch, researchThreshold };
}

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

// Parse the response to extract URLs and additional search terms
function parseWebSearchResponse(response: string): {
  urls: string[];
  additionalSearchTerms: string[];
} {
  const urls: string[] = [];
  const additionalSearchTerms: string[] = [];
  
  try {
    // Parse the response as JSON
    const parsed = JSON.parse(response);
    
    // Extract URLs from the parsed response
    if (parsed.results && Array.isArray(parsed.results)) {
      for (const result of parsed.results) {
        if (result.url && typeof result.url === 'string') {
          urls.push(result.url);
        }
      }
    }
    
    // Extract additional search terms (you can customize this logic)
    if (parsed.suggestedQueries && Array.isArray(parsed.suggestedQueries)) {
      additionalSearchTerms.push(...parsed.suggestedQueries);
    }
  } catch (error) {
    console.error('Error parsing search response:', error);
  }
  
  return { urls, additionalSearchTerms };
}

// Extract URLs from Claude CLI search results
function extractUrlsFromSearchResults(results: string): Array<{url: string, title: string, snippet: string}> {
  const extractedUrls: Array<{url: string, title: string, snippet: string}> = [];
  
  try {
    // Look for the Links: [JSON] pattern in the results
    const linksMatch = results.match(/Links:\s*(\[.*?\])/s);
    
    if (linksMatch) {
      const linksJson = linksMatch[1];
      const parsedResults = JSON.parse(linksJson);
      
      if (parsedResults && Array.isArray(parsedResults)) {
        parsedResults.forEach(result => {
          if (result.url && result.title) {
            extractedUrls.push({
              url: result.url,
              title: result.title || 'No title',
              snippet: result.snippet || 'No description available'
            });
          }
        });
      }
    }
  } catch (error) {
    console.error('Error extracting URLs from search results:', error);
  }
  
  return extractedUrls;
}

// Score URL relevance based on various factors
function scoreUrlRelevance(url: string, title: string, snippet: string, position: number, originalQuery: string): number {
  let score = 0;
  
  // Position factor (earlier results are generally more relevant)
  score += Math.max(0, (10 - position) / 10) * 0.3;
  
  // Title length factor (reasonable length titles are often better)
  const titleLength = title.length;
  if (titleLength >= 20 && titleLength <= 80) {
    score += 0.2;
  }
  
  // Query term presence in title
  const queryTerms = originalQuery.toLowerCase().split(' ');
  const titleLower = title.toLowerCase();
  const matchingTerms = queryTerms.filter(term => titleLower.includes(term)).length;
  score += (matchingTerms / queryTerms.length) * 0.3;
  
  // Domain credibility (simple heuristic)
  const domain = url.split('/')[2] || '';
  if (domain.includes('wikipedia') || domain.includes('gov') || domain.includes('edu')) {
    score += 0.15;
  }
  
  // Avoid obviously commercial or low-quality patterns
  if (domain.includes('ads') || title.toLowerCase().includes('buy now') || title.toLowerCase().includes('click here')) {
    score -= 0.2;
  }
  
  return Math.max(0, Math.min(1, score));
}

// Initialize global config and session manager
const researchConfig = parseResearchConfig();


// Removed auto-research functionality - using LLM-controlled sequential workflow instead



const RESEARCH_STEP_TOOL: Tool = {
  name: "research_step",
  description: "Perform a single step in a cyclical, LLM-controlled research workflow. This tool enables sequential thinking for research where the LLM decides each next action (search, fetch, analyze, synthesize, refine_query, assess_completeness). The LLM can cycle back to search for more information until a complete answer is found.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "fetch", "analyze", "synthesize", "refine_query", "assess_completeness"],
        description: "The research action to perform: 'search' (web search), 'fetch' (get URL content), 'analyze' (analyze gathered info), 'synthesize' (create final answer), 'refine_query' (improve search terms), 'assess_completeness' (evaluate if more info needed)"
      },
      query_or_url: {
        type: "string",
        description: "For 'search'/'refine_query': the search query. For 'fetch': the URL to retrieve. For 'analyze'/'assess_completeness'/'synthesize': description of what to focus on."
      },
      step_reasoning: {
        type: "string",
        description: "Explain why this research step is needed and what you hope to accomplish with it."
      },
      next_step_needed: {
        type: "boolean",
        description: "Whether another research step will be needed after this one. The LLM controls the research flow by setting this appropriately."
      },
      step_number: {
        type: "integer",
        description: "Current step number in the research sequence (starts at 1)."
      },
      total_steps_estimated: {
        type: "integer",
        description: "Your current estimate of total steps needed. Can be adjusted as research progresses."
      },
      session_id: {
        type: "string",
        description: "Research session identifier. Use the same session_id across all steps in a research sequence to maintain context and enable cyclical research."
      },
      is_revision: {
        type: "boolean",
        description: "Whether this step revises or reconsidera previous research step."
      },
      revises_step: {
        type: "integer",
        description: "If is_revision=true, which step number is being reconsidered or revised."
      },
      synthesis_focus: {
        type: "string",
        description: "For 'synthesize' action: what aspect of the research to focus the final synthesis on."
      },
      allowed_domains: {
        type: "array",
        items: {
          type: "string"
        },
        description: "For 'search' action: only include results from these domains."
      },
      blocked_domains: {
        type: "array",
        items: {
          type: "string"
        },
        description: "For 'search' action: never include results from these domains."
      }
    },
    required: ["action", "query_or_url", "step_reasoning", "next_step_needed", "step_number", "session_id"]
  }
};

// Research Step Action Types
type ResearchAction = 'search' | 'fetch' | 'analyze' | 'synthesize' | 'refine_query' | 'assess_completeness';

interface ResearchStepResult {
  action_taken: ResearchAction;
  step_number: number;
  session_id: string;
  raw_results: any;
  analysis: string;
  information_completeness: 'insufficient' | 'partial' | 'sufficient' | 'complete';
  suggested_next_action?: ResearchAction;
  suggested_next_query?: string;
  cycle_count: number;
  total_steps: number;
  reasoning: string;
  key_findings: string[];
  confidence_score: number;
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
  
  // Execute the base search
  const searchResult = await runClaudeCLI("web_search", "web_search", toolParams, debug);
  
  // Handle intelligent research workflow if enabled
  if (params.session_id || params.auto_research) {
    const sessionId = params.session_id || randomUUID();
    const timestamp = new Date().toISOString();
    
    // Simplified - no session management needed for stateless operation
    return searchResult;
  }
  
  // Return standard search result if no intelligent research
  return searchResult;
}

async function runWebFetch(params: WebFetchParams, debug: boolean = false): Promise<ToolResult> {
  const toolParams = { url: params.url };
  return runClaudeCLI("web_fetch", "WebFetch", toolParams, debug);
}
// Simplified Research Step Implementation (Stateless)
async function executeResearchStep(params: ResearchStepParams): Promise<ResearchStepResult> {
  console.error('DEBUG: executeResearchStep START with params:', {
    action: params.action,
    query_or_url: params.query_or_url,
    step_number: params.step_number,
    session_id: params.session_id
  });
  
  let rawResults: any;
  let analysis: string;
  let keyFindings: string[] = [];
  let informationCompleteness: 'insufficient' | 'partial' | 'sufficient' | 'complete' = 'insufficient';
  let confidenceScore: number = 0;
  
  let suggestedNextAction: ResearchAction | undefined;
  let suggestedNextQuery: string | undefined;
  
  // Route to appropriate action handler (simplified - no session manager)
  switch (params.action) {
    case 'search':
      const searchParams: WebSearchParams = {
        query: params.query_or_url,
        allowed_domains: params.allowed_domains,
        blocked_domains: params.blocked_domains,
        session_id: params.session_id,
        auto_research: false
      };
      rawResults = await runWebSearch(searchParams);
      const searchAnalysis = analyzeSearchResults(rawResults);
      analysis = searchAnalysis.summary;
      keyFindings = extractKeyFindings(rawResults, params.query_or_url);
      console.error('DEBUG: keyFindings before assessInformationCompleteness (search):', {
        type: typeof keyFindings,
        isArray: Array.isArray(keyFindings),
        value: keyFindings
      });
      informationCompleteness = assessInformationCompleteness(keyFindings, params.query_or_url);
      break;
      
    case 'fetch':
      const fetchParams: WebFetchParams = {
        url: params.query_or_url,
        session_id: params.session_id
      };
      rawResults = await runWebFetch(fetchParams);
      const fetchAnalysis = analyzeFetchResults(rawResults);
      analysis = fetchAnalysis.summary;
      keyFindings = extractKeyFindings(rawResults, params.query_or_url);
      console.error('DEBUG: keyFindings before assessInformationCompleteness (fetch):', {
        type: typeof keyFindings,
        isArray: Array.isArray(keyFindings),
        value: keyFindings
      });
      informationCompleteness = assessInformationCompleteness(keyFindings, params.query_or_url);
      break;
      
    case 'analyze':
      // Simple analysis based on the focus provided
      analysis = `Analysis of gathered information focusing on: ${params.query_or_url}`;
      keyFindings = [`Analysis step completed for: ${params.query_or_url}`];
      informationCompleteness = 'partial';
      rawResults = { analysis, focus: params.query_or_url };
      break;
      
    case 'synthesize':
      // Simple synthesis step
      analysis = `Synthesis of research findings with focus: ${params.query_or_url || 'general summary'}`;
      keyFindings = [`Research synthesis completed`];
      informationCompleteness = 'complete';
      rawResults = { synthesis: analysis, focus: params.query_or_url };
      break;
      
    case 'assess_completeness':
      // Simple completeness assessment
      analysis = `Assessment of information completeness for: ${params.query_or_url}`;
      keyFindings = [`Completeness assessment completed`];
      informationCompleteness = 'sufficient';
      rawResults = { assessment: analysis };
      break;
      
    case 'refine_query':
      // Simple query refinement
      analysis = `Refined search query based on: ${params.query_or_url}`;
      keyFindings = [`Query refinement completed`];
      informationCompleteness = 'insufficient';
      suggestedNextQuery = `refined: ${params.query_or_url}`;
      suggestedNextAction = 'search';
      rawResults = { refinedQuery: suggestedNextQuery };
      break;
      
    default:
      throw new Error(`Unknown research action: ${params.action}`);
  }
  
  // Determine next action based on completeness
  if (!suggestedNextAction && informationCompleteness === 'insufficient') {
    suggestedNextAction = 'search';
    suggestedNextQuery = params.query_or_url;
  } else if (informationCompleteness === 'partial') {
    suggestedNextAction = 'fetch';
  }
  
  // Calculate confidence score
  confidenceScore = calculateConfidenceScore(keyFindings, params.step_number);
  
  // No session management needed for stateless operation
  
  return {
    action_taken: params.action,
    step_number: params.step_number,
    session_id: params.session_id,
    raw_results: rawResults,
    analysis,
    information_completeness: informationCompleteness,
    suggested_next_action: suggestedNextAction,
    suggested_next_query: suggestedNextQuery,
    cycle_count: params.step_number, // Use step number as cycle count
    total_steps: params.step_number,
    reasoning: params.step_reasoning,
    key_findings: keyFindings,
    confidence_score: confidenceScore
  };
}




function formatResearchStepResults(result: ResearchStepResult): string {
  return `
## Research Step ${result.step_number} - ${result.action_taken.toUpperCase()}

**Session:** ${result.session_id}
**Reasoning:** ${result.reasoning}

**Analysis:** ${result.analysis}

**Information Completeness:** ${result.information_completeness}
**Confidence Score:** ${(result.confidence_score * 100).toFixed(1)}%

**Key Findings:**
${Array.isArray(result.key_findings)
  ? result.key_findings.map(finding => `- ${finding}`).join('\n')
  : `- ${result.key_findings || 'No findings available'}`}

**Research Progress:**
- Current Step: ${result.step_number}
- Total Steps: ${result.total_steps}
- Search Cycles: ${result.cycle_count}

${result.suggested_next_action ? `**Suggested Next Action:** ${result.suggested_next_action}${result.suggested_next_query ? ` with query: "${result.suggested_next_query}"` : ''}` : ''}

---
`.trim();
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
    tools: [RESEARCH_STEP_TOOL]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    console.error('DEBUG: Tool handler START with request.params:', request.params);
    const { name, arguments: args } = request.params;
    console.error('DEBUG: Extracted name:', name, 'args:', args);

    if (!args || typeof args !== 'object') {
      throw new Error("No arguments provided");
    }

    let result: ToolResult;

    if (name === "research_step") {
      console.error('DEBUG: Processing research_step tool');
      const params = args as ResearchStepParams;
      console.error('DEBUG: Params cast to ResearchStepParams:', params);
      
      if (!params.action || !params.query_or_url || !params.step_reasoning || !params.session_id) {
        throw new Error("Missing required parameters: action, query_or_url, step_reasoning, session_id");
      }
      
      console.error('DEBUG: About to call executeResearchStep');
      const researchResult = await executeResearchStep(params);
      
      return {
        content: [{ type: "text", text: formatResearchStepResults(researchResult) }]
      };
      
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    
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
