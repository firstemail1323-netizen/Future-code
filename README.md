# Future-Code Agent v2.0

**Multi-Agent Mesh Architecture with Event Sourcing and MCP Compatibility**

An advanced intelligent terminal agent featuring a multi-agent mesh architecture, event sourcing for full history tracking, Model Context Protocol (MCP) compatibility, real-time WebSocket streaming, vector-based semantic search, and self-learning capabilities.

## 🚀 Features

### Multi-Agent Mesh Architecture
- **Orchestrator Agent**: Routes user input to specialized agents based on intent
- **LLM Agent**: Handles all AI provider communications (OpenRouter, OpenAI, Anthropic, Gemini, Groq)
- **File System Agent**: Safe file operations with sandboxing capability
- **Code Analyzer Agent**: Parses code, detects dead code, calculates metrics
- **Project Memory Agent**: Maintains short-term and long-term project context

### Event Sourcing
- Every action stored as an immutable event
- Full time-travel capability - replay or undo any change
- Event types: UserPrompt, AIResponse, FileCreated, FileDeleted, ConfigChanged

### MCP (Model Context Protocol) Server
- Compatible with Claude Desktop, VS Code Cline, and other MCP clients
- Exposes tools: `mcp_llm_chat`, `mcp_file_read`, `mcp_file_write`, `mcp_project_analyze`
- Runs on `http://localhost:3001`

### Real-Time Streaming
- WebSocket server for token-by-token responses (`ws://localhost:3002/ws`)
- Server-Sent Events (SSE) support (`http://localhost:3002/sse`)
- Character-by-character streaming like real Claude

### Vector Search & Memory
- In-memory vector database with cosine similarity
- Semantic search of conversations and code snippets
- Simple text embeddings for quick retrieval

### Capabilities & Constraints
- Disable specific agent capabilities via CLI flags
- Example: `--capability disable fileSystemAgent` for read-only mode

### Parallel Workflow Engine
- Execute multiple agents concurrently
- Merge strategies: all, first-success, majority, concat, aggregate

### Distributed Monitoring
- Track latency, tokens used, error rates per agent
- Metrics saved to `data/metrics.json`

### Self-Learning Loop
- Learns optimal routing from user feedback
- Adjusts provider preferences based on success rates

## 📁 Folder Structure

```
future-code-agent/
├── index.js                      # Main entry point (v2.0)
├── package.json                  # Project configuration
├── README.md                     # This documentation
├── .env                          # Environment variables (API keys)
├── .env.example                  # Template for environment setup
├── .gitignore                    # Git ignore rules
├── LICENSE                       # License file
├── data/                         # Runtime data storage
│   ├── events.json               # Event store (auto-created)
│   ├── memory.json               # Project memory
│   ├── metrics.json              # Agent metrics
│   └── learning.json             # Self-learning data
└── src/
    ├── agents/                   # Specialized agents
    │   ├── orchestratorAgent.js  # Intent-based routing
    │   ├── llmAgent.js           # Multi-provider AI communication
    │   ├── fileSystemAgent.js    # Sandboxed file operations
    │   ├── codeAnalyzerAgent.js  # Code parsing & analysis
    │   └── projectMemoryAgent.js # Short/long-term memory
    ├── bus/
    │   └── messageBus.js         # Pub/sub message bus
    ├── events/
    │   └── eventStore.js         # Append-only event sourcing
    ├── mcp/
    │   └── mcpServer.js          # MCP server (port 3001)
    ├── websocket/
    │   └── wsServer.js           # WebSocket/SSE (port 3002)
    ├── vector/
    │   └── vectorDB.js           # Vector database with cosine similarity
    ├── workflow/
    │   └── workflowEngine.js     # Parallel workflow execution
    ├── monitor/
    │   └── monitor.js            # Metrics & health monitoring
    ├── selfLearning/
    │   └── selfLearning.js       # Feedback-based learning
    ├── services/
    │   ├── aiService.js          # AI API communication
    │   └── reorganizeService.js  # Project reorganization logic
    ├── config/
    │   ├── providers.js          # AI provider configurations
    │   └── envConfig.js          # Environment variable loader
    └── utils/
        ├── fileUtils.js          # File system utilities
        └── terminalUtils.js      # ANSI color utilities
```

## 🔧 Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd future-code-agent
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env and add your API keys
```

## 📖 Usage

### Standard CLI Mode
```bash
node index.js
```

### MCP Server Mode Only
```bash
node index.js --mcp
```

### CLI Only (No Servers)
```bash
node index.js --cli-only
```

### With Disabled Capabilities
```bash
# Disable file system write operations
node index.js --capability disable fileSystemAgent

# Multiple capabilities
node index.js --capability disable fileSystemAgent --capability disable llmAgent
```

### Without Colors (for terminals that don't support ANSI)
```bash
node index.js --no-color
```

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `reorganize` | Reorganize the project structure |
| `status` | Show system status for all agents |
| `memory` | Search project memory |
| `metrics` | Show agent performance metrics |
| `learning` | Show self-learning analysis |
| `events` | Show recent events from event store |
| `help` | Show available commands |
| `quit` / `exit` | Exit the application |

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | OpenRouter API key | At least one |
| `OPENAI_API_KEY` | OpenAI API key | At least one |
| `ANTHROPIC_API_KEY` | Anthropic API key | At least one |
| `GEMINI_API_KEY` | Google Gemini API key | At least one |
| `GROQ_API_KEY` | Groq API key | At least one |

## 🌐 Supported AI Providers

- **OpenRouter** - Access to multiple models (default: Claude 3.5 Sonnet)
- **OpenAI** - GPT-4o, GPT-4 Turbo
- **Anthropic** - Claude 3.5 Sonnet, Claude 3 Opus
- **Google Gemini** - Gemini 1.5 Pro, Gemini 1.5 Flash
- **Groq** - Llama3 70B, Mixtral 8x7B

## 🔌 MCP Integration

Connect MCP-compatible clients to `http://localhost:3001`:

### Available MCP Tools

1. **mcp_llm_chat(query, provider)**
   - Chat with any LLM provider
   - Dynamically switch providers

2. **mcp_file_read(path)**
   - Read content from any file

3. **mcp_file_write(path, content)**
   - Write content to files (respects sandbox)

4. **mcp_project_analyze(filePath?)**
   - Analyze project structure and code metrics

### Example: Connect with Claude Desktop

Add to your Claude Desktop config:
```json
{
  "mcpServers": {
    "future-code": {
      "url": "http://localhost:3001"
    }
  }
}
```

## 📊 WebSocket & SSE Endpoints

- **WebSocket**: `ws://localhost:3002/ws`
- **SSE**: `http://localhost:3002/sse`
- **Health Check**: `http://localhost:3002/health`

### WebSocket Message Format

```json
{
  "type": "llm.response",
  "data": {
    "response": "AI response text...",
    "provider": "openrouter"
  }
}
```

## 🏗️ Architecture Overview

### Agent Communication
All agents communicate via a central **Message Bus** using publish/subscribe pattern:
- Decoupled, asynchronous messaging
- Request/response with correlation IDs
- Wildcard subscriptions for monitoring

### Event Sourcing Flow
1. User action triggers an event
2. Event is appended to immutable event store
3. Agents react to events via message bus
4. State can be reconstructed by replaying events

### Self-Learning Loop
1. User provides feedback (explicit or implicit)
2. System records experience with rating
3. Routing weights are adjusted
4. Future requests use optimized routing

## 🛡️ Safety Features

- **Sandboxing**: Restrict file operations to specific directories
- **Capability Flags**: Disable dangerous operations at runtime
- **Path Validation**: Block access to sensitive paths (node_modules, .git, etc.)
- **Event Logging**: All actions logged for audit trail

## 📝 License

See [LICENSE](LICENSE) file for details.

---

**Future-Code Agent v2.0** - Building the future of intelligent code assistance.
