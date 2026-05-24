/**
 * Heartbeat agent for system health monitoring
 * Runs periodic checks on all critical components
 */

const fs = require('fs');
const path = require('path');
const terminal = require('../utils/terminalUtils');

class HeartbeatAgent {
  /**
   * Create a heartbeat agent instance
   * @param {object} messageBus - Message bus instance
   * @param {object} eventStore - Event store instance
   * @param {object} mcpServer - MCP server instance
   */
  constructor(messageBus, eventStore, mcpServer) {
    this.messageBus = messageBus;
    this.eventStore = eventStore;
    this.mcpServer = mcpServer;
    this.intervalId = null;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
    this.lastCheckTime = null;
    this.healthStatus = {
      mcpServer: 'unknown',
      eventStore: 'unknown',
      messageBus: 'unknown',
      lastCheck: null
    };
  }

  /**
   * Start the heartbeat monitoring
   */
  start() {
    terminal.printInfo('💓 Heartbeat agent started, checking system health every 5 minutes...');
    
    // Run initial check
    this.performHealthCheck();
    
    // Schedule recurring checks every 5 minutes
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);
  }

  /**
   * Stop the heartbeat monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      terminal.printInfo('💓 Heartbeat agent stopped');
    }
  }

  /**
   * Perform a full health check on all components
   */
  async performHealthCheck() {
    const checkTime = new Date().toISOString();
    terminal.printInfo(`[${checkTime}] Performing system health check...`);
    
    this.lastCheckTime = checkTime;

    const checks = await Promise.allSettled([
      this.checkMCPServer(),
      this.checkEventStore(),
      this.checkMessageBus()
    ]);

    const results = {
      mcpServer: checks[0],
      eventStore: checks[1],
      messageBus: checks[2]
    };

    // Update health status
    this.healthStatus.mcpServer = checks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy';
    this.healthStatus.eventStore = checks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy';
    this.healthStatus.messageBus = checks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy';
    this.healthStatus.lastCheck = checkTime;

    // Report any failed checks
    let hasIssues = false;
    Object.entries(results).forEach(([component, result]) => {
      if (result.status === 'rejected') {
        hasIssues = true;
        terminal.printWarning(`⚠️  Health check failed for ${component}: ${result.reason?.message || result.reason}`);
      }
    });

    if (hasIssues) {
      terminal.printError('❌ System health check detected issues!');
    } else {
      terminal.printSuccess('✅ All system components healthy');
    }
  }

  /**
   * Check MCP server health
   * @returns {Promise<boolean>} True if healthy
   */
  async checkMCPServer() {
    if (!this.mcpServer) {
      throw new Error('MCP server not available');
    }

    // Check if MCP server methods exist
    if (typeof this.mcpServer.start !== 'function') {
      throw new Error('MCP server start method not found');
    }

    // Try to get server status if available
    if (typeof this.mcpServer.getStatus === 'function') {
      const status = this.mcpServer.getStatus();
      if (status && status.running === false) {
        throw new Error('MCP server is not running');
      }
    }

    return true;
  }

  /**
   * Check Event Store health
   * @returns {Promise<boolean>} True if healthy
   */
  async checkEventStore() {
    if (!this.eventStore) {
      throw new Error('Event store not available');
    }

    try {
      // Try to write a temporary test event
      const testEvent = {
        id: `health-check-${Date.now()}`,
        type: 'HEALTH_CHECK',
        data: { timestamp: Date.now(), check: 'event_store_write' },
        timestamp: new Date()
      };

      await this.eventStore.append(testEvent);

      // Note: We don't clean up the test event due to append-only nature
      // but we've verified write capability
      return true;
    } catch (error) {
      throw new Error(`Event store write failed: ${error.message}`);
    }
  }

  /**
   * Check Message Bus health
   * @returns {Promise<boolean>} True if healthy
   */
  async checkMessageBus() {
    if (!this.messageBus) {
      throw new Error('Message bus not available');
    }

    try {
      // Test message publishing and receiving
      let receivedMessage = false;
      const testChannel = `health-check-${Date.now()}`;
      
      const unsubscribe = this.messageBus.subscribe(testChannel, () => {
        receivedMessage = true;
      });

      this.messageBus.publish(testChannel, { health: 'ok' });
      
      // Give it a small amount of time to process
      await new Promise(resolve => setTimeout(resolve, 50));

      unsubscribe();

      if (!receivedMessage) {
        throw new Error('Message bus did not receive test message');
      }

      return true;
    } catch (error) {
      throw new Error(`Message bus test failed: ${error.message}`);
    }
  }

  /**
   * Get current health status
   * @returns {object} Health status information
   */
  getStatus() {
    return {
      ...this.healthStatus,
      intervalMs: this.checkInterval,
      isRunning: this.intervalId !== null
    };
  }
}

module.exports = HeartbeatAgent;
