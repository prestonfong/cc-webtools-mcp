# Web Tools MCP Server

A TypeScript MCP (Model Context Protocol) server that provides web search and content fetching capabilities through Claude CLI integration.

## Features

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

**Common Claude CLI Paths:**
- Windows NPM Global: `C:\\Users\\USERNAME\\AppData\\Roaming\\npm\\claude.cmd`
- macOS/Linux: Usually just `claude` if installed globally

## Tool Usage

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

## Architecture

This server uses Node.js child_process to call Claude CLI with synthetic tool_use messages, parsing the stream-json output to extract results. The implementation maintains compatibility with the original Python web_tool.py functionality while providing a native TypeScript MCP server interface.