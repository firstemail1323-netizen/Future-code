/**
 * LLM Agent - Handles all communication with AI providers
 * Can switch providers dynamically based on request or capability
 */

const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');
const { EnvConfig } = require('../config/envConfig');
const { AIService } = require('../services/aiService');
const { retryWithBackoff, CircuitBreaker } = require('../utils/resilience');
const terminal = require('../utils/terminalUtils');

class LLMAgent {
  constructor() {
    this.id = 'llm-agent';
    this.capabilities = ['chat', 'code-generation', 'analysis', 'reasoning'];
    this.currentProvider = null;
    this.envConfig = new EnvConfig();
    this.aiService = null;
    this.isInitialized = false;
    this.circuitBreaker = new CircuitBreaker(2, 10000); // 2 failures, 10s cooldown
    this._setupSubscriptions();
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    if (!this.envConfig.loadFromEnv()) {
      console.warn('[LLMAgent] No API keys found. Agent will be limited.');
      return false;
    }
    this.aiService = new AIService(this.envConfig);
    this.currentProvider = this.envConfig.getProvider();
    this.isInitialized = true;
    console.log(`[LLMAgent] Initialized with provider: ${this.currentProvider.name}`);
    return true;
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // Listen for LLM requests
    bus.subscribe('agent.llm.request', async (envelope) => {
      await this._handleRequest(envelope);
    });

    // Handle provider switch requests
    bus.subscribe('agent.llm.switch-provider', (envelope) => {
      this._switchProvider(envelope.message.provider);
    });
  }

  /**
   * Handle incoming LLM request
   * @param {object} envelope - Message envelope
   */
  async _handleRequest(envelope) {
    const { prompt, systemPrompt, provider, stream, correlationId, replyTo } = envelope.message;

    try {
      // Switch provider if requested
      if (provider && provider !== this.currentProvider?.name) {
        this._switchProvider(provider);
      }

      if (!this.isInitialized) {
        throw new Error('LLM Agent not initialized - no API key available');
      }

      // Record user prompt event
      eventStore.append(EventTypes.USER_PROMPT, {
        prompt,
        systemPrompt,
        provider: this.currentProvider?.name
      });

      terminal.printInfo(`Processing request with ${this.currentProvider.name}...`);

      // Get response with resilience (retry + circuit breaker)
      const response = await retryWithBackoff(async () => {
        return await this.circuitBreaker.call(async () => {
          return await this.aiService.ask(prompt, systemPrompt || '');
        });
      }, 3, 1000);

      // Record AI response event
      const responseEvent = eventStore.append(EventTypes.AI_RESPONSE, {
        response,
        provider: this.currentProvider?.name,
        promptLength: prompt.length,
        responseLength: response?.length || 0
      });

      // Publish response
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'llm.response',
          correlationId,
          response,
          success: true,
          eventId: responseEvent.id
        });
      }

      bus.publish('agent.llm.response', {
        type: 'llm.response',
        response,
        provider: this.currentProvider?.name,
        eventId: responseEvent.id
      });

    } catch (error) {
      terminal.printError(`LLMAgent Error: ${error.message}`);
      
      // Handle specific error types
      if (error.message.includes('Circuit breaker is OPEN')) {
        terminal.printWarning('⚠️  Circuit breaker open - too many failures. Waiting for cooldown.');
      } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
        terminal.printWarning('⚠️  Rate limit or quota exceeded. Consider switching providers.');
      } else if (error.message.includes('API key')) {
        terminal.printError('❌ Missing API key. Set environment variables (e.g., OPENAI_API_KEY).');
      }

      if (replyTo) {
        bus.publish(replyTo, {
          type: 'llm.error',
          correlationId,
          error: error.message,
          success: false
        });
      }
    }
  }

  /**
   * Switch to a different provider
   * @param {string} providerName - Provider name
   */
  _switchProvider(providerName) {
    const providers = require('../config/providers').PROVIDERS;
    
    if (!providers[providerName.toLowerCase()]) {
      console.warn(`[LLMAgent] Unknown provider: ${providerName}`);
      return false;
    }

    const envKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
    if (!envKey) {
      console.warn(`[LLMAgent] No API key for ${providerName}`);
      return false;
    }

    this.envConfig = new EnvConfig();
    this.envConfig.selectedProvider = providers[providerName.toLowerCase()];
    this.envConfig.apiKey = envKey;
    this.aiService = new AIService(this.envConfig);
    this.currentProvider = this.envConfig.getProvider();

    console.log(`[LLMAgent] Switched to provider: ${providerName}`);
    
    eventStore.append(EventTypes.CONFIG_CHANGED, {
      type: 'provider_switch',
      fromProvider: this.currentProvider?.name,
      toProvider: providerName
    });

    return true;
  }

  /**
   * Direct chat method (for non-bus usage)
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @param {string} provider - Optional provider override
   * @returns {Promise<string>} AI response
   */
  async chat(prompt, systemPrompt = '', provider = null) {
    if (provider && provider !== this.currentProvider?.name) {
      this._switchProvider(provider);
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.aiService.ask(prompt, systemPrompt);
  }

  /**
   * Get current provider info
   * @returns {object|null} Provider info
   */
  getProviderInfo() {
    return this.currentProvider ? {
      name: this.currentProvider.name,
      model: this.currentProvider.model,
      url: this.currentProvider.url
    } : null;
  }

  /**
   * Get agent status
   * @returns {object} Agent status
   */
  getStatus() {
    return {
      id: this.id,
      initialized: this.isInitialized,
      currentProvider: this.currentProvider?.name,
      capabilities: this.capabilities
    };
  }
}

// Singleton instance
const llmAgent = new LLMAgent();

module.exports = { LLMAgent, llmAgent };
