#!/usr/bin/env node

// External packages
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';

// Local modules
import { logger } from './logger.js';
import { executeResearchAgent, formatResearchAgentResults } from './research-agent.js';
import { ResearchAgentParams } from './types.js';

// Tool schemas (consolidated from tools.ts)
const RESEARCH_AGENT_TOOL: Tool = {
  name: "research_agent",
  description: "Execute objective-driven research with information accumulation. Provide a list of objectives/questions to be answered and a starting query. The agent will search, auto-fetch relevant content, use Claude to extract quotes that answer objectives, and continue until all objectives are complete or max calls reached.",
  inputSchema: {
    type: "object",
    properties: {
      objectives: {
        type: "array",
        items: { type: "string" },
        description: "Array of research objectives/questions that need to be answered with quotes from online sources"
      },
      starting_query: {
        type: "string",
        description: "Initial search query to start the research process"
      },
      max_calls: {
        type: "number",
        description: "Maximum number of research iterations allowed (default: 5)"
      },
      allowed_domains: {
        type: "array",
        items: { type: "string" },
        description: "Optional: List of domains to restrict search/fetch to"
      },
      blocked_domains: {
        type: "array",
        items: { type: "string" },
        description: "Optional: List of domains to exclude from search/fetch"
      }
    },
    required: ["objectives", "starting_query"]
  }
};

const TOOLS = [RESEARCH_AGENT_TOOL];

config();

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
    tools: TOOLS
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args || typeof args !== 'object') {
      throw new Error("No arguments provided");
    }

    if (name === "research_agent") {
      const params = args as ResearchAgentParams;
      
      if (!params.objectives || !Array.isArray(params.objectives) || params.objectives.length === 0) {
        throw new Error("Missing required parameter: objectives (must be non-empty array)");
      }
      
      if (!params.starting_query || typeof params.starting_query !== 'string') {
        throw new Error("Missing required parameter: starting_query (must be string)");
      }
      
      const agentResult = await executeResearchAgent(params);
      
      // Format the research agent results for display
      const formattedResult = formatResearchAgentResults(agentResult);
      
      return {
        content: [{ type: "text", text: formattedResult }]
      };
      
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    
  } catch (error) {
    logger.error('Error executing tool', 'handleToolCall', error instanceof Error ? error : new Error(String(error)));
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
  logger.info("Web Tools MCP Server running on stdio", 'runServer');
}

runServer().catch((error) => {
  logger.error("Fatal error running server", 'main', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});
