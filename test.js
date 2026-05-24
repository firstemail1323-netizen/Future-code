/**
 * Standalone sanity check script
 * Verifies core functionality without network calls
 */

const fs = require('fs');
const path = require('path');

// Create audit directory if it doesn't exist
if (!fs.existsSync('./data/audit')) {
  fs.mkdirSync('./data/audit', { recursive: true });
}

async function runSanityChecks() {
  console.log('\n🧪 ═══════════════════════════════════════════════════════');
  console.log('   Running standalone sanity checks...');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Message Bus functionality
  try {
    const { bus } = require('./src/bus/messageBus.js');
    
    // Test sending and receiving a test message
    let receivedMessage = null;
    bus.subscribe('test-channel', (message) => {
      receivedMessage = message;
    });
    
    bus.publish('test-channel', { test: 'message' });
    
    // Small delay to allow message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (receivedMessage && receivedMessage.test === 'message') {
      console.log('[✅] Message Bus functionality verified');
      passed++;
    } else {
      console.log('[❌] Message Bus test failed - message not received');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Message Bus test failed: ${error.message}`);
    failed++;
  }

  // Test 2: Event Store functionality
  try {
    const { eventStore } = require('./src/events/eventStore.js');
    
    // Write a dummy event
    const testEvent = { 
      id: 'test-' + Date.now(), 
      type: 'TEST_EVENT', 
      data: { test: true },
      timestamp: new Date() 
    };
    await eventStore.append(testEvent);
    
    // Read back and verify
    const events = eventStore.getAll();
    const foundEvent = events.find(e => e.id === testEvent.id);
    
    if (foundEvent && foundEvent.data.test === true) {
      console.log('[✅] Event Store functionality verified');
      passed++;
    } else {
      console.log('[❌] Event Store test failed - event not found');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Event Store test failed: ${error.message}`);
    failed++;
  }

  // Test 3: Agent loading
  try {
    const agentsDir = './src/agents/';
    const agentFiles = fs.readdirSync(agentsDir).filter(file => file.endsWith('.js'));
    
    let allLoaded = true;
    const loadedAgents = [];
    for (const file of agentFiles) {
      try {
        const agent = require(path.join(agentsDir, file));
        loadedAgents.push(file.replace('.js', ''));
      } catch (loadError) {
        console.error(`Failed to load agent ${file}:`, loadError.message);
        allLoaded = false;
      }
    }
    
    if (allLoaded) {
      console.log(`[✅] All ${agentFiles.length} agents loaded successfully (${loadedAgents.join(', ')})`);
      passed++;
    } else {
      console.log('[❌] Agent loading failed - some agents could not be loaded');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Agent loading test failed: ${error.message}`);
    failed++;
  }

  // Test 4: MCP Server function signatures
  try {
    const { mcpServer } = require('./src/mcp/mcpServer.js');
    
    // Check required methods exist
    const requiredMethods = ['start', 'stop'];
    let hasAllMethods = true;
    for (const method of requiredMethods) {
      if (typeof mcpServer[method] !== 'function') {
        hasAllMethods = false;
        break;
      }
    }
    
    if (hasAllMethods) {
      console.log('[✅] MCP Server function signatures verified');
      passed++;
    } else {
      console.log('[❌] MCP Server verification failed - missing methods');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] MCP Server test failed: ${error.message}`);
    failed++;
  }

  // Test 5: Environment configuration
  try {
    const envConfig = require('./src/config/envConfig.js');
    // Just verify the module loads without throwing
    if (envConfig && envConfig.EnvConfig) {
      console.log('[✅] Configuration module loaded successfully');
      passed++;
    } else {
      console.log('[❌] Configuration check failed - invalid module');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Configuration test failed: ${error.message}`);
    failed++;
  }

  // Test 6: Resilience utilities
  try {
    const resilience = require('./src/utils/resilience.js');
    if (resilience.retryWithBackoff && resilience.CircuitBreaker) {
      console.log('[✅] Resilience utilities loaded successfully');
      passed++;
    } else {
      console.log('[❌] Resilience utilities failed - missing exports');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Resilience utilities test failed: ${error.message}`);
    failed++;
  }

  // Test 7: Safe mode configuration
  try {
    const safeMode = require('./src/config/safeMode.js');
    if (safeMode.getSafeModeStatus && safeMode.shouldExecuteActions) {
      console.log('[✅] Safe mode configuration loaded successfully');
      passed++;
    } else {
      console.log('[❌] Safe mode configuration failed - missing methods');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Safe mode configuration test failed: ${error.message}`);
    failed++;
  }

  // Test 8: Terminal utilities
  try {
    const terminal = require('./src/utils/terminalUtils.js');
    if (terminal.printHeader && terminal.printSuccess && terminal.printError) {
      console.log('[✅] Terminal utilities loaded successfully');
      passed++;
    } else {
      console.log('[❌] Terminal utilities failed - missing methods');
      failed++;
    }
  } catch (error) {
    console.log(`[❌] Terminal utilities test failed: ${error.message}`);
    failed++;
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSanityChecks().catch(console.error);
