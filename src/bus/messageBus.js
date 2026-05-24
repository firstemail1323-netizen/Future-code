/**
 * Message Bus - Central communication hub for all agents
 * Implements publish/subscribe pattern for agent communication
 */

const EventEmitter = require('events');

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.messageHistory = [];
    this.maxHistorySize = 1000;
    this.subscribers = new Map();
  }

  /**
   * Publish a message to a specific channel
   * @param {string} channel - Channel name
   * @param {object} message - Message payload
   */
  publish(channel, message) {
    const envelope = {
      id: this._generateId(),
      channel,
      message,
      timestamp: Date.now(),
      source: message.source || 'unknown'
    };

    // Store in history
    this.messageHistory.push(envelope);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }

    // Emit event
    this.emit(channel, envelope);
    this.emit('*', envelope); // Wildcard listener

    console.log(`[BUS] Published to ${channel}: ${message.type || 'message'}`);
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name
   * @param {function} callback - Handler function
   * @returns {function} Unsubscribe function
   */
  subscribe(channel, callback) {
    this.on(channel, callback);
    
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel).push(callback);

    // Return unsubscribe function
    return () => {
      this.removeListener(channel, callback);
      const subs = this.subscribers.get(channel);
      if (subs) {
        const index = subs.indexOf(callback);
        if (index > -1) subs.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to all channels (wildcard)
   * @param {function} callback - Handler function
   */
  subscribeAll(callback) {
    return this.subscribe('*', callback);
  }

  /**
   * Send a request-response message
   * @param {string} channel - Target channel
   * @param {object} message - Request payload
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<object>} Response
   */
  async request(channel, message, timeout = 30000) {
    const correlationId = this._generateId();
    const responseChannel = `response.${correlationId}`;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Request timeout on ${channel}`));
      }, timeout);

      const unsubscribe = this.subscribe(responseChannel, (envelope) => {
        clearTimeout(timeoutHandle);
        unsubscribe();
        resolve(envelope.message);
      });

      this.publish(channel, {
        ...message,
        correlationId,
        replyTo: responseChannel
      });
    });
  }

  /**
   * Get message history
   * @param {string} channel - Optional channel filter
   * @returns {Array} Message history
   */
  getHistory(channel = null) {
    if (channel) {
      return this.messageHistory.filter(m => m.channel === channel);
    }
    return this.messageHistory;
  }

  /**
   * Clear message history
   */
  clearHistory() {
    this.messageHistory = [];
  }

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get bus statistics
   * @returns {object} Bus stats
   */
  getStats() {
    return {
      totalMessages: this.messageHistory.length,
      activeChannels: new Set(this.messageHistory.map(m => m.channel)).size,
      subscriberCount: Array.from(this.subscribers.values()).flat().length
    };
  }
}

// Singleton instance
const bus = new MessageBus();

module.exports = { MessageBus, bus };
