# Web Tools MCP Server

A TypeScript MCP (Model Context Protocol) server that provides web search and intelligent research capabilities through Claude CLI integration.

## Features

- **research_agent**: Intelligent research agent that answers questions by searching and analyzing web sources
- **web_search**: Search the web for real-time information with domain filtering support  
- **web_fetch**: Fetch content from specific URLs
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

## Tool Usage

### research_agent
Intelligent research agent that automatically searches, fetches, and analyzes web sources to answer research questions.

**Parameters:**
- `objectives` (required): Array of research questions to answer
- `starting_query` (required): Initial search query to begin research
- `max_calls` (optional): Maximum research iterations (default: 5)
- `allowed_domains` (optional): Array of domains to include in results
- `blocked_domains` (optional): Array of domains to exclude from results

**Features:**
- Automatically searches the web and fetches top 3 most relevant sources
- Extracts comprehensive quotes from web content
- Continues research until objectives are met or max iterations reached
- Provides organized results with source citations

### web_search
Search the web for information with optional domain filtering.

**Parameters:**
- `query` (required): The search query string
- `allowed_domains` (optional): Array of domains to include in results
- `blocked_domains` (optional): Array of domains to exclude from results

### web_fetch
Fetch and extract content from a specific URL.

**Parameters:**
- `url` (required): The URL to fetch content from

## Usage Examples

### Basic Research
```json
{
  "tool": "research_agent",
  "arguments": {
    "objectives": ["What is Claude AI and what are its main capabilities?"],
    "starting_query": "Claude AI capabilities features"
  }
}
```

### Research with Domain Filtering
```json
{
  "tool": "research_agent", 
  "arguments": {
    "objectives": ["Latest quantum computing breakthroughs in 2024"],
    "starting_query": "quantum computing 2024 breakthroughs",
    "allowed_domains": ["arxiv.org", "nature.com", "science.org"],
    "max_calls": 3
  }
}
```

### Basic Web Search
```json
{
  "tool": "web_search",
  "arguments": {
    "query": "latest developments in quantum computing 2024"
  }
}
```

## How Research Agent Works

1. **Search**: Performs web searches for the research objectives
2. **Fetch**: Automatically retrieves content from the top 3 most relevant sources  
3. **Analyze**: Extracts comprehensive quotes that answer research questions
4. **Continue**: Iterates until objectives are met or max iterations reached

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
