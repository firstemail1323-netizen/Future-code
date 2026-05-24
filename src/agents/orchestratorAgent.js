/**
 * Orchestrator Agent - Routes user input to appropriate agents based on intent
 * Central decision maker for the multi-agent mesh
 */

const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');
const { llmAgent } = require('./llmAgent');
const { fileSystemAgent } = require('./fileSystemAgent');
const { codeAnalyzerAgent } = require('./codeAnalyzerAgent');
const terminal = require('../utils/terminalUtils');

class OrchestratorAgent {
  constructor() {
    this.id = 'orchestrator-agent';
    this.capabilities = ['route', 'analyze-intent', 'coordinate', 'merge-results'];
    this.agents = {
      llm: llmAgent,
      filesystem: fileSystemAgent,
      codeAnalyzer: codeAnalyzerAgent
    };
    this.intentPatterns = {
      coding: [/code/i, /function/i, /class/i, /implement/i, /write/i, /create.*file/i, /refactor/i],
      fileOps: [/read.*file/i, /write.*file/i, /move/i, /delete/i, /list.*files/i, /directory/i, /folder/i],
      analysis: [/analyze/i, /check/i, /find.*dead/i, /metrics/i, /complexity/i, /imports/i],
      reasoning: [/explain/i, /why/i, /how/i, /what/i, /describe/i, /summarize/i],
      reorganize: [/reorganiz/i, /restructur/i, /move.*file/i, /clean.*code/i, /modular/i]
    };
    this.routingHistory = [];
    this._setupSubscriptions();
  }

  /**
   * Initialize the orchestrator
   */
  async initialize() {
    terminal.printAgentInit('OrchestratorAgent', 'initializing');
    
    // Initialize all agents
    await llmAgent.initialize();
    fileSystemAgent.initialize();
    
    terminal.printAgentInit('OrchestratorAgent', 'ready');
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // Main user input channel
    bus.subscribe('orchestrator.input', async (envelope) => {
      await this._handleUserInput(envelope);
    });

    // Reorganization requests
    bus.subscribe('orchestrator.reorganize', async (envelope) => {
      await this._handleReorganize(envelope);
    });
  }

  /**
   * Handle user input
   * @param {object} envelope - Message envelope
   */
  async _handleUserInput(envelope) {
    const { input, correlationId, replyTo } = envelope.message;

    try {
      // Analyze intent
      const intent = this.analyzeIntent(input);
      
      // Record routing event
      eventStore.append(EventTypes.AGENT_ROUTED, {
        input: input.substring(0, 100),
        intent,
        targetAgents: intent.agents
      });

      terminal.printInfo(`Routing to: ${intent.agents.join(', ')} (intent: ${intent.category})`);

      // Route to appropriate agents
      const results = await this.routeToAgents(intent.agents, envelope.message);

      if (replyTo) {
        bus.publish(replyTo, {
          type: 'orchestrator.response',
          correlationId,
          intent,
          results,
          success: true
        });
      }

      // Store routing history for learning
      this.routingHistory.push({
        timestamp: Date.now(),
        input: input.substring(0, 50),
        intent: intent.category,
        agents: intent.agents,
        success: true
      });

    } catch (error) {
      terminal.printError(`OrchestratorAgent Error: ${error.message}`);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'orchestrator.error',
          correlationId,
          error: error.message,
          success: false
        });
      }
    }
  }

  /**
   * Handle reorganization request
   * @param {object} envelope - Message envelope
   */
  async _handleReorganize(envelope) {
    const { options = {}, correlationId, replyTo } = envelope.message;

    try {
      terminal.printHeader('🔄 Starting Reorganization Workflow');

      // Coordinate multiple agents for reorganization
      const workflow = {
        steps: [
          { agent: 'filesystem', action: 'list', params: {} },
          { agent: 'codeAnalyzer', action: 'analyze', params: { batch: true } },
          { agent: 'llm', action: 'plan', params: { context: 'reorganization' } },
          { agent: 'filesystem', action: 'execute', params: { plan: 'pending' } }
        ]
      };

      // Execute workflow
      const results = [];
      for (const step of workflow.steps) {
        terminal.printStatus('pending', `Executing: ${step.agent}.${step.action}`);
        // In a full implementation, this would use the workflow engine
      }

      if (replyTo) {
        bus.publish(replyTo, {
          type: 'orchestrator.reorganize.response',
          correlationId,
          workflow,
          results,
          success: true
        });
      }

    } catch (error) {
      terminal.printError(`Reorganization failed: ${error.message}`);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'orchestrator.reorganize.error',
          correlationId,
          error: error.message,
          success: false
        });
      }
    }
  }

  /**
   * Analyze user input intent
   * @param {string} input - User input
   * @returns {object} Intent analysis result
   */
  analyzeIntent(input) {
    const scores = {
      coding: 0,
      fileOps: 0,
      analysis: 0,
      reasoning: 0,
      reorganize: 0
    };

    // Score each category
    for (const [category, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(input)) {
          scores[category] += 2;
        }
      }
    }

    // Find best match
    let bestCategory = 'reasoning'; // default
    let bestScore = 0;
    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    // Determine target agents based on intent
    const agents = [];
    switch (bestCategory) {
      case 'coding':
        agents.push('llm');
        break;
      case 'fileOps':
        agents.push('filesystem');
        break;
      case 'analysis':
        agents.push('codeAnalyzer');
        break;
      case 'reorganize':
        agents.push('filesystem', 'codeAnalyzer', 'llm');
        break;
      case 'reasoning':
      default:
        agents.push('llm');
    }

    return {
      category: bestCategory,
      confidence: bestScore / 10,
      scores,
      agents
    };
  }

  /**
   * Route request to specific agents
   * @param {Array} agentNames - List of agent names
   * @param {object} message - Original message
   * @returns {Promise<object>} Combined results
   */
  async routeToAgents(agentNames, message) {
    const results = {};
    
    for (const agentName of agentNames) {
      const agent = this.agents[agentName];
      if (!agent) {
        terminal.printWarning(`Unknown agent: ${agentName}`);
        continue;
      }

      try {
        // Send request via message bus or direct call
        if (agent.chat) {
          results[agentName] = await agent.chat(message.input, message.systemPrompt);
        } else if (agent.getStatus) {
          results[agentName] = agent.getStatus();
        }
      } catch (error) {
        results[agentName] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Get orchestrator status
   * @returns {object} Status info
   */
  getStatus() {
    return {
      id: this.id,
      capabilities: this.capabilities,
      availableAgents: Object.keys(this.agents),
      routingHistoryLength: this.routingHistory.length,
      agentStatuses: Object.fromEntries(
        Object.entries(this.agents).map(([name, agent]) => [name, agent.getStatus?.() || 'unknown'])
      )
    };
  }
}

// Singleton instance
const orchestratorAgent = new OrchestratorAgent();

module.exports = { OrchestratorAgent, orchestratorAgent };
