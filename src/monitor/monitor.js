/**
 * Monitor - Distributed logging and metrics collection
 * Tracks latency, tokens used, error rates for each agent
 */

const fs = require('fs');
const path = require('path');
const { bus } = require('../bus/messageBus');

class Monitor {
  constructor(metricsPath = './data/metrics.json') {
    this.metricsPath = metricsPath;
    this.agentMetrics = new Map();
    this.startTime = Date.now();
    this._ensureDataDirectory();
    this._loadMetrics();
    this._setupSubscriptions();
    
    // Auto-save every 30 seconds
    setInterval(() => this._saveMetrics(), 30000);
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDirectory() {
    const dir = path.dirname(this.metricsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load metrics from storage
   */
  _loadMetrics() {
    try {
      if (fs.existsSync(this.metricsPath)) {
        const data = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
        this.agentMetrics = new Map(Object.entries(data.agentMetrics || {}));
        console.log(`[Monitor] Loaded metrics for ${this.agentMetrics.size} agents`);
      }
    } catch (e) {
      console.error(`[Monitor] Failed to load metrics: ${e.message}`);
    }
  }

  /**
   * Save metrics to storage
   */
  _saveMetrics() {
    try {
      const data = {
        lastUpdated: Date.now(),
        uptime: Date.now() - this.startTime,
        agentMetrics: Object.fromEntries(this.agentMetrics)
      };
      fs.writeFileSync(this.metricsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[Monitor] Failed to save metrics: ${e.message}`);
    }
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // Track all bus messages for metrics
    bus.subscribe('*', (envelope) => {
      this._recordMessage(envelope);
    });
  }

  /**
   * Record a message for metrics
   * @param {object} envelope - Message envelope
   */
  _recordMessage(envelope) {
    const { channel, timestamp, source } = envelope;
    const agentId = source.split('.')[0];

    this.recordMetric(agentId, {
      type: 'message',
      channel,
      timestamp
    });
  }

  /**
   * Record a metric for an agent
   * @param {string} agentId - Agent identifier
   * @param {object} data - Metric data
   */
  recordMetric(agentId, data) {
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {
        requestCount: 0,
        errorCount: 0,
        totalLatency: 0,
        tokenUsage: 0,
        messages: [],
        lastActivity: null
      });
    }

    const metrics = this.agentMetrics.get(agentId);
    metrics.lastActivity = Date.now();

    if (data.type === 'request') {
      metrics.requestCount++;
    }

    if (data.type === 'error') {
      metrics.errorCount++;
    }

    if (data.latency !== undefined) {
      metrics.totalLatency += data.latency;
    }

    if (data.tokens !== undefined) {
      metrics.tokenUsage += data.tokens;
    }

    // Keep last 100 messages
    metrics.messages.push({
      type: data.type,
      timestamp: data.timestamp || Date.now()
    });
    if (metrics.messages.length > 100) {
      metrics.messages.shift();
    }
  }

  /**
   * Record request start time
   * @param {string} requestId - Request ID
   * @param {string} agentId - Agent ID
   */
  startRequest(requestId, agentId) {
    this._requestTimers = this._requestTimers || new Map();
    this._requestTimers.set(requestId, {
      agentId,
      startTime: Date.now()
    });
  }

  /**
   * Record request end and calculate latency
   * @param {string} requestId - Request ID
   * @param {object} result - Request result
   */
  endRequest(requestId, result = {}) {
    if (!this._requestTimers || !this._requestTimers.has(requestId)) {
      return;
    }

    const timer = this._requestTimers.get(requestId);
    const latency = Date.now() - timer.startTime;

    this.recordMetric(timer.agentId, {
      type: result.success ? 'success' : 'error',
      latency,
      tokens: result.tokens || 0
    });

    this._requestTimers.delete(requestId);
  }

  /**
   * Get metrics for an agent
   * @param {string} agentId - Agent ID
   * @returns {object|null} Agent metrics or null
   */
  getAgentMetrics(agentId) {
    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return null;

    const avgLatency = metrics.requestCount > 0 
      ? metrics.totalLatency / metrics.requestCount 
      : 0;

    const errorRate = metrics.requestCount > 0
      ? metrics.errorCount / metrics.requestCount
      : 0;

    return {
      agentId,
      requestCount: metrics.requestCount,
      errorCount: metrics.errorCount,
      errorRate,
      avgLatency: Math.round(avgLatency),
      totalLatency: metrics.totalLatency,
      tokenUsage: metrics.tokenUsage,
      lastActivity: metrics.lastActivity
    };
  }

  /**
   * Get all metrics
   * @returns {object} All metrics
   */
  getAllMetrics() {
    const allMetrics = {};
    
    for (const [agentId, metrics] of this.agentMetrics.entries()) {
      allMetrics[agentId] = this.getAgentMetrics(agentId);
    }

    return {
      uptime: Date.now() - this.startTime,
      totalAgents: this.agentMetrics.size,
      agents: allMetrics
    };
  }

  /**
   * Reset metrics for an agent
   * @param {string} agentId - Agent ID
   */
  resetAgent(agentId) {
    this.agentMetrics.delete(agentId);
    console.log(`[Monitor] Reset metrics for: ${agentId}`);
  }

  /**
   * Reset all metrics
   */
  resetAll() {
    this.agentMetrics.clear();
    console.log('[Monitor] Reset all metrics');
  }

  /**
   * Get health status
   * @returns {object} Health status
   */
  getHealth() {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    const healthyAgents = [];
    const staleAgents = [];

    for (const [agentId, metrics] of this.agentMetrics.entries()) {
      if (metrics.lastActivity && now - metrics.lastActivity < staleThreshold) {
        healthyAgents.push(agentId);
      } else {
        staleAgents.push(agentId);
      }
    }

    return {
      status: healthyAgents.length > 0 ? 'healthy' : 'degraded',
      healthyAgents,
      staleAgents,
      uptime: Date.now() - this.startTime
    };
  }
}

// Singleton instance
const monitor = new Monitor();

module.exports = { Monitor, monitor };
