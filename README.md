# Web Tools MCP Server

A TypeScript MCP (Model Context Protocol) server that provides web search and content fetching capabilities through Claude CLI integration.

## Features

- **web_search**: Search the web for real-time information with domain filtering support
- **web_fetch**: Fetch content from specific URLs
- **Intelligent Research Workflows**: Autonomous research capabilities with automatic URL extraction and fetching
- **Session Management**: Persistent research state tracking across multiple tool calls
- **Configurable Research Limits**: Control research depth with maxCalls and completeness thresholds
- Uses Claude CLI backend for actual web operations
- Full TypeScript implementation with proper error handling
- Compatible with Claude Desktop and other MCP clients

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link globally for Claude Desktop access
npm link
```

## Claude Desktop Integration

Add the following configuration to your Claude Desktop config file:

**Config File Locations:**
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Basic Configuration

```json
{
  "mcpServers": {
    "web-tools": {
      "command": "web-tools-mcp"
    }
  }
}
```

### Custom Claude CLI Path

If you need to specify a custom Claude CLI path:

```json
{
  "mcpServers": {
    "web-tools": {
      "command": "web-tools-mcp",
      "args": ["--claude-cli-path", "C:\\Users\\PRESTO~1\\AppData\\Roaming\\npm\\claude.cmd"]
    }
  }
}
```

### Intelligent Research Configuration

Enable autonomous research workflows with configurable parameters:

```json
{
  "mcpServers": {
    "web-tools": {
      "command": "web-tools-mcp",
      "args": [
        "--max-calls", "15",
        "--auto-research", "true",
        "--research-threshold", "0.8"
      ]
    }
  }
}
```

**Configuration Parameters:**
- `--max-calls`: Maximum number of tool calls per research session (default: 10)
- `--auto-research`: Enable automatic URL fetching and research continuation (default: false)
- `--research-threshold`: Completeness score threshold for stopping research (0.0-1.0, default: 0.7)
- `--claude-cli-path`: Custom path to Claude CLI executable

**Common Claude CLI Paths:**
- Windows NPM Global: `C:\\Users\\USERNAME\\AppData\\Roaming\\npm\\claude.cmd`
- macOS/Linux: Usually just `claude` if installed globally

## Tool Usage

### web_search
Search the web for information with optional domain filtering and intelligent research capabilities.

**Parameters:**
- `query` (required): The search query string
- `allowed_domains` (optional): Array of domains to include in results
- `blocked_domains` (optional): Array of domains to exclude from results
- `session_id` (optional): Research session ID for continuing previous research
- `auto_research` (optional): Enable automatic URL fetching and research continuation

**Intelligent Research Features:**
- Automatic URL extraction from search results
- Relevance scoring and top URL auto-fetching
- Session-based research state management
- Completeness scoring and intelligent stopping conditions

### web_fetch
Fetch and extract content from a specific URL.

**Parameters:**
- `url` (required): The URL to fetch content from

## Intelligent Research Workflow

The web-tools-mcp server includes advanced autonomous research capabilities that can automatically:

1. **Extract URLs** from search results using intelligent parsing
2. **Score relevance** based on position, title quality, and query matching
3. **Auto-fetch content** from the most promising URLs (top 3 with score ≥ 0.4)
4. **Continue research** based on information completeness assessment
5. **Track session state** across multiple research iterations

### How It Works

When `auto_research` is enabled, the server:

1. Performs initial web search for your query
2. Extracts and scores URLs from search results
3. Automatically fetches content from top-ranked URLs
4. Analyzes information completeness and diversity
5. Decides whether to continue research or stop
6. Maintains session state for research continuity

### Research Session Management

Each research session maintains:
- **Session ID**: Unique identifier for tracking research state
- **Query History**: Original query and research progression
- **Cumulative Information**: All gathered content and insights
- **Call Tracking**: Number of tool calls vs. configured maximum
- **Completeness Score**: Heuristic assessment of information adequacy

### Usage Examples

**Basic Autonomous Research:**
```json
{
  "tool": "web_search",
  "arguments": {
    "query": "latest developments in quantum computing 2024",
    "auto_research": true
  }
}
```

**Continuing Previous Research:**
```json
{
  "tool": "web_search",
  "arguments": {
    "query": "quantum computing applications in cryptography",
    "session_id": "research_session_12345",
    "auto_research": true
  }
}
```

**Research with Domain Filtering:**
```json
{
  "tool": "web_search",
  "arguments": {
    "query": "machine learning breakthroughs",
    "auto_research": true,
    "allowed_domains": ["arxiv.org", "nature.com", "science.org"]
  }
}
```

## Requirements

- Node.js >= 18.0.0
- Claude CLI installed and accessible
- Compatible with MCP client applications

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Run the server
npm start
```

## Research Algorithm Details

### URL Extraction and Scoring

The intelligent research system uses sophisticated algorithms to identify and prioritize content:

**URL Extraction:**
- Parses JSON search results from Claude CLI
- Uses regex patterns to identify URLs in search content
- Validates URL format and accessibility

**Relevance Scoring Components:**
- **Position Weight (30%)**: Earlier results scored higher
- **Title Quality (20%)**: Length and descriptiveness assessment
- **Query Matching (30%)**: Exact and partial term matching in titles/descriptions
- **Domain Credibility (15%)**: Known authoritative domains get bonus points
- **Content Length (5%)**: Substantial content preferred over snippets

**Auto-Fetch Criteria:**
- Top 3 URLs with relevance score ≥ 0.4
- Excludes previously fetched URLs in the session
- Respects domain filtering (allowed/blocked domains)

### Completeness Assessment

The system evaluates research completeness using:
- **Information Volume**: Total content length and diversity
- **Source Variety**: Number of unique domains and URL types
- **Query Coverage**: How well gathered information addresses the original query
- **Redundancy Detection**: Identifies when additional sources provide diminishing returns

## Troubleshooting

### Common Issues

**Claude CLI Not Found:**
```
Error: spawn claude ENOENT
```
- Ensure Claude CLI is installed globally: `npm install -g @anthropic-ai/claude-3-cli`
- Or specify custom path with `--claude-cli-path` argument

**Research Session Errors:**
```
Error: Research session limit exceeded
```
- Increase `--max-calls` parameter (default: 10)
- Check if research threshold is too low (default: 0.7)

**No URLs Found in Search Results:**
```
Warning: No URLs extracted from search results
```
- Search query may be too specific or abstract
- Try broader search terms or different phrasing
- Check if domain filtering is too restrictive

### Debug Mode

Enable verbose logging by setting the `DEBUG` environment variable:
```bash
DEBUG=web-tools-mcp npm start
```

## Architecture

This server uses Node.js child_process to call Claude CLI with synthetic tool_use messages, parsing the stream-json output to extract results. The implementation maintains compatibility with the original Python web_tool.py functionality while providing a native TypeScript MCP server interface.

### Key Components

- **ResearchSessionManager**: Handles persistent research state and session tracking
- **URL Extraction Engine**: Parses search results and identifies relevant URLs
- **Relevance Scoring Algorithm**: Multi-factor scoring system for URL prioritization
- **Completeness Assessment**: Heuristic evaluation of research adequacy
- **Configuration Parser**: Command-line argument processing for research parameters