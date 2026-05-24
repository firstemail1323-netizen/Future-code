/**
 * Environment variable configuration loader
 * Handles loading and validating API keys from environment
 */

const { PROVIDERS } = require('./providers');

class EnvConfig {
  constructor() {
    this.providerKeys = Object.keys(PROVIDERS);
    this.selectedProvider = null;
    this.apiKey = null;
  }

  /**
   * Search for available API keys in environment variables
   * @returns {boolean} true if a valid provider was found
   */
  loadFromEnv() {
    for (const key of this.providerKeys) {
      const envKey = process.env[`${key.toUpperCase()}_API_KEY`];
      if (envKey && envKey.length > 10) {
        this.selectedProvider = PROVIDERS[key];
        this.apiKey = envKey;
        console.log(`🔑 Found API Key for: ${this.selectedProvider.name}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get the selected provider configuration
   * @returns {object|null} The provider config or null if not set
   */
  getProvider() {
    return this.selectedProvider;
  }

  /**
   * Get the API key for the selected provider
   * @returns {string|null} The API key or null if not set
   */
  getApiKey() {
    return this.apiKey;
  }

  /**
   * Check if a provider is configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.selectedProvider !== null && this.apiKey !== null;
  }
}

module.exports = { EnvConfig };
