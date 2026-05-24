/**
 * MCP (Model Context Protocol) Server
 * Exposes tools for MCP-compatible clients (Claude Desktop, VS Code Cline, etc.)
 */

const http = require('http');
const { bus } = require('../bus/messageBus');
const { llmAgent } = require('../agents/llmAgent');
const { fileSystemAgent } = require('../agents/fileSystemAgent');
const { codeAnalyzerAgent } = require('../agents/codeAnalyzerAgent');
const { readFileContent } = require('../utils/fileUtils');

class MCPServer {
  constructor(port = 3001) {
    this.port = port;
    this.server = null;
    this.tools = {
      mcp_llm_chat: this._mcpLlmChat.bind(this),
      mcp_file_read: this._mcpFileRead.bind(this),
      mcp_file_write: this._mcpFileWrite.bind(this),
      mcp_project_analyze: this._mcpProjectAnalyze.bind(this)
    };
  }

  /**
   * Start the MCP server
   */
  start() {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // MCP protocol endpoint
      if (req.url === '/mcp' && req.method === 'POST') {
        this._handleMCPRequest(req, res);
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', tools: Object.keys(this.tools) }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`[MCP Server] Listening on http://localhost:${this.port}`);
      console.log(`[MCP Server] Available tools: ${Object.keys(this.tools).join(', ')}`);
    });
  }

  /**
   * Stop the MCP server
   */
  stop() {
    if (this.server) {
      this.server.close();
      console.log('[MCP Server] Stopped');
    }
  }

  /**
   * Handle MCP protocol request
   * @param {object} req - HTTP request
   * @param {object} res - HTTP response
   */
  async _handleMCPRequest(req, res) {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        const response = await this._processMCPRequest(request);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  /**
   * Process MCP protocol request
   * @param {object} request - MCP request
   * @returns {object} MCP response
   */
  async _processMCPRequest(request) {
    const { method, params } = request;

    switch (method) {
      case 'initialize':
        return this._mcpInitialize();
      
      case 'tools/list':
        return this._mcpToolsList();
      
      case 'tools/call':
        return this._mcpToolsCall(params);
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * MCP initialize response
   * @returns {object} Initialize response
   */
  _mcpInitialize() {
    return {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'future-code-agent',
          version: '2.0.0'
        }
      }
    };
  }

  /**
   * List available tools
   * @returns {object} Tools list
   */
  _mcpToolsList() {
    return {
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          {
            name: 'mcp_llm_chat',
            description: 'Chat with an LLM provider. Can switch providers dynamically.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'The query or prompt' },
                provider: { type: 'string', description: 'Optional provider name (openrouter, openai, anthropic, gemini, groq)' },
                systemPrompt: { type: 'string', description: 'Optional system prompt' }
              },
              required: ['query']
            }
          },
          {
            name: 'mcp_file_read',
            description: 'Read content from a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to the file' }
              },
              required: ['path']
            }
          },
          {
            name: 'mcp_file_write',
            description: 'Write content to a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to the file' },
                content: { type: 'string', description: 'Content to write' }
              },
              required: ['path', 'content']
            }
          },
          {
            name: 'mcp_project_analyze',
            description: 'Analyze the project structure and code',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: { type: 'string', description: 'Optional specific file to analyze' }
              }
            }
          }
        ]
      }
    };
  }

  /**
   * Call a tool
   * @param {object} params - Tool call parameters
   * @returns {object} Tool result
   */
  async _mcpToolsCall(params) {
    const { name, arguments: args } = params;

    if (!this.tools[name]) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await this.tools[name](args);

    return {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      }
    };
  }

  /**
   * MCP tool: LLM chat
   * @param {object} args - Tool arguments
   * @returns {string} LLM response
   */
  async _mcpLlmChat(args) {
    const { query, provider, systemPrompt = '' } = args;
    
    await llmAgent.initialize();
    const response = await llmAgent.chat(query, systemPrompt, provider);
    
    return response || 'No response from LLM';
  }

  /**
   * MCP tool: File read
   * @param {object} args - Tool arguments
   * @returns {string} File content
   */
  async _mcpFileRead(args) {
    const { path: filePath } = args;
    
    const content = readFileContent(filePath);
    
    if (content === null) {
      return `Error: Could not read file ${filePath}`;
    }
    
    return content;
  }

  /**
   * MCP tool: File write
   * @param {object} args - Tool arguments
   * @returns {string} Success message
   */
  async _mcpFileWrite(args) {
    const { path: filePath, content } = args;
    
    const success = fileSystemAgent.write(filePath, content);
    
    return success 
      ? `Successfully wrote to ${filePath}` 
      : `Error: Could not write to ${filePath}`;
  }

  /**
   * MCP tool: Project analyze
   * @param {object} args - Tool arguments
   * @returns {object} Analysis result
   */
  async _mcpProjectAnalyze(args) {
    const { filePath } = args || {};
    
    if (filePath) {
      return codeAnalyzerAgent.analyzeFile(filePath);
    }
    
    // Analyze entire project
    const { getProjectFiles } = require('../utils/fileUtils');
    const files = getProjectFiles('.');
    
    const analysis = {
      totalFiles: files.length,
      files: files.map(f => ({
        path: f,
        metrics: codeAnalyzerAgent.calculateMetrics(f)
      }))
    };
    
    return analysis;
  }
}

// Singleton instance
const mcpServer = new MCPServer();

module.exports = { MCPServer, mcpServer };
