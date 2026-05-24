/**
 * AI Service for communicating with various LLM providers
 * Handles API requests and response parsing
 */

const { EnvConfig } = require('../config/envConfig');

class AIService {
  /**
   * Create an AI service instance
   * @param {EnvConfig} envConfig - Configuration with provider and API key
   */
  constructor(envConfig) {
    this.envConfig = envConfig;
  }

  /**
   * Send a prompt to the AI and get a response
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - Optional system prompt
   * @returns {Promise<string|null>} AI response or null on error
   */
  async ask(prompt, systemPrompt = '') {
    const selectedProvider = this.envConfig.getProvider();
    const apiKey = this.envConfig.getApiKey();

    if (!selectedProvider) {
      console.error('❌ No AI provider selected (missing API key).');
      return null;
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const url = selectedProvider.name === 'Google Gemini' 
      ? selectedProvider.getUrl(apiKey) 
      : selectedProvider.url;

    const body = selectedProvider.body(selectedProvider.model, messages);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: selectedProvider.headers(apiKey),
        body: body
      });

      const data = await res.json();
      return selectedProvider.parse(data);
    } catch (err) {
      console.error(`❌ AI request failed: ${err.message}`);
      return null;
    }
  }
}

module.exports = { AIService };
