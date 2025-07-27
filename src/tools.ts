// Tool schemas and registration for MCP server

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const RESEARCH_STEP_TOOL: Tool = {
  name: "research_step",
  description: "Execute a specific step in a cyclical research workflow. This tool allows LLM-controlled sequential research where you can search, fetch, analyze, synthesize, refine queries, and assess completeness. The LLM can decide to cycle back to search for more information based on assessment results.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "fetch", "analyze", "synthesize", "refine_query", "assess_completeness"],
        description: "The research action to perform:\n- search: Search for information using a query\n- fetch: Fetch content from a specific URL\n- analyze: Analyze gathered information and extract insights\n- synthesize: Combine and synthesize all research findings\n- refine_query: Refine search query based on previous findings\n- assess_completeness: Assess if enough information has been gathered"
      },
      query_or_url: {
        type: "string",
        description: "The search query (for search/refine_query actions) or URL (for fetch action). For other actions, this can be used to provide context or focus."
      },
      step_reasoning: {
        type: "string",
        description: "Explain your reasoning for this step and what you hope to accomplish. This helps track the research logic and decision-making process."
      },
      next_step_needed: {
        type: "boolean",
        description: "Whether you anticipate needing another research step after this one. Set to false if you believe this might be the final step."
      },
      step_number: {
        type: "number",
        description: "The sequential number of this research step (starting from 1)"
      },
      session_id: {
        type: "string",
        description: "The research session ID to track this workflow. Use the same ID for all steps in a research session."
      },
      allowed_domains: {
        type: "array",
        items: { type: "string" },
        description: "Optional: List of domains to restrict search/fetch to (for search and fetch actions)"
      },
      blocked_domains: {
        type: "array",
        items: { type: "string" },
        description: "Optional: List of domains to exclude from search/fetch (for search and fetch actions)"
      },
      previous_findings: {
        type: "string",
        description: "Optional: Summary of previous research findings to inform this step (especially useful for refine_query and assess_completeness actions)"
      },
      max_cycles: {
        type: "number",
        description: "Optional: Maximum number of cyclical iterations allowed before stopping (default: 10)"
      },
      cycle_detection_window: {
        type: "number", 
        description: "Optional: Number of recent steps to check for cyclical patterns (default: 5)"
      }
    },
    required: ["action", "query_or_url", "step_reasoning", "next_step_needed", "step_number", "session_id"]
  }
};

export const TOOLS = [RESEARCH_STEP_TOOL];