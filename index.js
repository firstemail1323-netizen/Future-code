#!/usr/bin/env node

/**
 * Future-Code Agent v2.0 - Main Entry Point
 * Multi-Agent Mesh Architecture with Event Sourcing and MCP compatibility
 * 
 * Features:
 * - Agent Mesh (Orchestrator, LLM, FileSystem, CodeAnalyzer, ProjectMemory)
 * - Event Sourcing for full history and time travel
 * - MCP Server for AI tool compatibility
 * - WebSocket/SSE streaming
 * - Vector search for semantic memory
 * - Self-learning routing optimization
 */

const readline = require('readline');
const { bus } = require('./src/bus/messageBus');
const { eventStore, EventTypes } = require('./src/events/eventStore');
const { orchestratorAgent } = require('./src/agents/orchestratorAgent');
const { mcpServer } = require('./src/mcp/mcpServer');
const { webSocketServer } = require('./src/websocket/wsServer');
const { vectorDB, textEmbedder } = require('./src/vector/vectorDB');
const { projectMemoryAgent } = require('./src/agents/projectMemoryAgent');
const { workflowEngine } = require('./src/workflow/workflowEngine');
const { monitor } = require('./src/monitor/monitor');
const { selfLearningModule } = require('./src/selfLearning/selfLearning');
const { fileSystemAgent } = require('./src/agents/fileSystemAgent');
const { ReorganizeService } = require('./src/services/reorganizeService');
const terminal = require('./src/utils/terminalUtils');

// Parse command line arguments
const args = process.argv.slice(2);
const disableCapabilities = [];
let noColor = false;

// Parse --capability and --no-color flags
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--capability' && args[i + 1] === 'disable') {
    const cap = args[i + 2];
    if (cap) {
      disableCapabilities.push(cap);
      i += 2;
    }
  } else if (args[i] === '--no-color') {
    noColor = true;
    terminal.setColorsEnabled(false);
  }
}

async function main() {
  terminal.printHeader('🚀 Future-Code Agent v2.0 - Multi-Agent Mesh Architecture');

  // Initialize core systems
  terminal.printInfo('Loading environment and initializing agents...');

  await orchestratorAgent.initialize();

  // Apply capability constraints
  if (disableCapabilities.length > 0) {
    terminal.printWarning(`Disabling capabilities: ${disableCapabilities.join(', ')}`);
    fileSystemAgent.initialize({ disabledCapabilities: disableCapabilities });
  } else {
    fileSystemAgent.initialize();
  }

  // Start servers based on mode
  const mcpMode = args.includes('--mcp');
  const noServers = args.includes('--cli-only');

  if (!noServers) {
    // Start MCP server
    mcpServer.start();

    // Start WebSocket server for streaming
    webSocketServer.start();
  }

  // Store conversation in vector DB and memory
  bus.subscribe('agent.llm.response', (envelope) => {
    const { response, provider } = envelope.message;

    // Create embedding and store in vector DB
    const embedding = textEmbedder.embed(response || '');
    vectorDB.add(`llm_${Date.now()}`, embedding, {
      type: 'llm_response',
      provider,
      timestamp: Date.now()
    });

    // Store in project memory
    projectMemoryAgent.store('conversation', {
      response,
      provider
    }, { importance: 3 });
  });

  // If MCP mode, just run servers
  if (mcpMode) {
    console.log('\n[MCP Mode] Server running. Connect with MCP-compatible clients.');
    console.log('Press Ctrl+C to stop.\n');
    return;
  }

  // CLI mode - original functionality preserved
  terminal.printSuccess('CLI Mode Ready for input.');
  terminal.printDivider('Available Commands');

  const commands = [
    '  reorganize     - Reorganize the project',
    '  status         - Show system status',
    '  memory         - Search project memory',
    '  metrics        - Show agent metrics',
    '  learning       - Show learning analysis',
    '  events         - Show recent events',
    '  help           - Show this help',
    '  quit/exit      - Exit the application'
  ];
  commands.forEach(cmd => console.log(cmd));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('> ', handleCommand);

  function handleCommand(input) {
    const cmd = input.trim().toLowerCase();

    switch (cmd) {
      case 'quit':
      case 'exit':
        terminal.printInfo('Goodbye!');
        cleanup();
        process.exit(0);
        break;

      case 'reorganize':
        terminal.printHeader('🔄 Starting Project Reorganization');
        bus.publish('orchestrator.reorganize', { options: {} });
        rl.question('> ', handleCommand);
        break;

      case 'status':
        const status = {
          orchestrator: orchestratorAgent.getStatus(),
          filesystem: fileSystemAgent.getStatus(),
          memory: projectMemoryAgent.getStatus(),
          vectorDB: vectorDB.getStats(),
          workflow: workflowEngine.getStats(),
          monitor: monitor.getHealth(),
          learning: selfLearningModule.analyzePatterns()
        };
        terminal.printHeader('📊 System Status');
        terminal.printCodeBlock(JSON.stringify(status, null, 2));
        rl.question('> ', handleCommand);
        break;

      case 'memory':
        rl.question('Search query: ', (query) => {
          const results = projectMemoryAgent.search(query);
          terminal.printHeader(`🔍 Memory Results (${results.length})`);
          results.forEach((r, i) => {
            console.log(`  ${i + 1}. [${r.type}] ${JSON.stringify(r.content).substring(0, 100)}...`);
          });
          rl.question('> ', handleCommand);
        });
        break;

      case 'metrics':
        const metrics = monitor.getAllMetrics();
        terminal.printHeader('📈 Agent Metrics');
        terminal.printCodeBlock(JSON.stringify(metrics, null, 2));
        rl.question('> ', handleCommand);
        break;

      case 'learning':
        const analysis = selfLearningModule.analyzePatterns();
        terminal.printHeader('🧠 Learning Analysis');
        terminal.printCodeBlock(JSON.stringify(analysis, null, 2));
        rl.question('> ', handleCommand);
        break;

      case 'events':
        const events = eventStore.getAll();
        const recent = events.slice(-10);
        terminal.printHeader('📜 Recent Events');
        recent.forEach(e => {
          console.log(`  [${e.type}] ${new Date(e.timestamp).toLocaleTimeString()}`);
        });
        rl.question('> ', handleCommand);
        break;

      case 'help':
        terminal.printDivider('Available Commands');
        commands.forEach(cmd => console.log(cmd));
        console.log();
        rl.question('> ', handleCommand);
        break;

      default:
        // Send to orchestrator for processing
        terminal.printInfo('Processing...');
        bus.publish('orchestrator.input', {
          input,
          replyTo: `cli.${Date.now()}`
        });

        // Wait for response
        setTimeout(() => {
          rl.question('> ', handleCommand);
        }, 1000);
    }
  }

  function cleanup() {
    terminal.printInfo('Cleaning up...');
    mcpServer.stop();
    webSocketServer.stop();
    eventStore._saveEvents();
    projectMemoryAgent._saveMemory();
    monitor._saveMetrics();
    terminal.printSuccess('Shutdown Complete');
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
}

// Run the application
main();
