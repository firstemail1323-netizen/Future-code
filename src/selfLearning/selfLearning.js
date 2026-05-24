/**
 * Self-Learning Module - Improves agent routing based on feedback
 * Learns which prompts and providers work best for different tasks
 */

const fs = require('fs');
const path = require('path');
const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');

class SelfLearningModule {
  constructor(learningPath = './data/learning.json') {
    this.learningPath = learningPath;
    this.experiences = [];
    this.routingWeights = {
      coding: { openrouter: 1.0, openai: 1.0, anthropic: 1.0, gemini: 1.0, groq: 1.0 },
      fileOps: { filesystem: 1.0 },
      analysis: { codeAnalyzer: 1.0 },
      reasoning: { openrouter: 1.0, openai: 1.0, anthropic: 1.0, gemini: 1.0, groq: 1.0 },
      reorganize: { llm: 1.0, filesystem: 1.0, codeAnalyzer: 1.0 }
    };
    this.maxExperiences = 1000;
    this._ensureDataDirectory();
    this._loadLearning();
    this._setupSubscriptions();
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDirectory() {
    const dir = path.dirname(this.learningPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load learning data from storage
   */
  _loadLearning() {
    try {
      if (fs.existsSync(this.learningPath)) {
        const data = JSON.parse(fs.readFileSync(this.learningPath, 'utf8'));
        this.experiences = data.experiences || [];
        this.routingWeights = data.routingWeights || this.routingWeights;
        console.log(`[SelfLearning] Loaded ${this.experiences.length} experiences`);
      }
    } catch (e) {
      console.error(`[SelfLearning] Failed to load: ${e.message}`);
    }
  }

  /**
   * Save learning data to storage
   */
  _saveLearning() {
    try {
      const data = {
        lastUpdated: Date.now(),
        experienceCount: this.experiences.length,
        experiences: this.experiences.slice(-this.maxExperiences),
        routingWeights: this.routingWeights
      };
      fs.writeFileSync(this.learningPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[SelfLearning] Failed to save: ${e.message}`);
    }
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // Listen for feedback events
    bus.subscribe('learning.feedback', (envelope) => {
      this._handleFeedback(envelope);
    });

    // Track completed workflows
    bus.subscribe('orchestrator.response', (envelope) => {
      this._trackOutcome(envelope);
    });
  }

  /**
   * Handle feedback message
   * @param {object} envelope - Message envelope
   */
  _handleFeedback(envelope) {
    const { requestId, rating, feedback, intent, agents } = envelope.message;
    
    this.recordExperience({
      requestId,
      rating,
      feedback,
      intent,
      agents,
      timestamp: Date.now()
    });

    // Update weights based on feedback
    if (rating >= 4 && intent && agents) {
      this._reinforceSuccess(intent, agents);
    } else if (rating <= 2 && intent && agents) {
      this._penalizeFailure(intent, agents);
    }

    this._saveLearning();
  }

  /**
   * Track outcome of a request
   * @param {object} envelope - Message envelope
   */
  _trackOutcome(envelope) {
    const { intent, results, success } = envelope.message;
    
    if (success && intent) {
      // Positive implicit feedback
      this._reinforceSuccess(intent, Object.keys(results || {}));
    }
  }

  /**
   * Record an experience
   * @param {object} experience - Experience data
   */
  recordExperience(experience) {
    this.experiences.push(experience);
    
    if (this.experiences.length > this.maxExperiences) {
      this.experiences.shift();
    }

    // Record as event
    eventStore.append(EventTypes.LEARNING_FEEDBACK, {
      rating: experience.rating,
      intent: experience.intent,
      agents: experience.agents
    });

    console.log(`[SelfLearning] Recorded experience: rating=${experience.rating}, intent=${experience.intent}`);
  }

  /**
   * Reinforce successful routing decisions
   * @param {string} intent - Intent category
   * @param {Array} agents - Agents used
   */
  _reinforceSuccess(intent, agents) {
    const learningRate = 0.1;
    
    for (const agent of agents) {
      if (this.routingWeights[intent]?.[agent] !== undefined) {
        this.routingWeights[intent][agent] += learningRate;
        console.log(`[SelfLearning] Reinforced ${agent} for ${intent}: ${this.routingWeights[intent][agent].toFixed(2)}`);
      }
    }
  }

  /**
   * Penalize unsuccessful routing decisions
   * @param {string} intent - Intent category
   * @param {Array} agents - Agents used
   */
  _penalizeFailure(intent, agents) {
    const learningRate = 0.05;
    
    for (const agent of agents) {
      if (this.routingWeights[intent]?.[agent] !== undefined) {
        this.routingWeights[intent][agent] = Math.max(0.1, 
          this.routingWeights[intent][agent] - learningRate);
        console.log(`[SelfLearning] Penalized ${agent} for ${intent}: ${this.routingWeights[intent][agent].toFixed(2)}`);
      }
    }
  }

  /**
   * Get recommended agents for an intent
   * @param {string} intent - Intent category
   * @returns {Array} Recommended agents sorted by weight
   */
  getRecommendedAgents(intent) {
    const weights = this.routingWeights[intent];
    
    if (!weights) {
      return [];
    }

    return Object.entries(weights)
      .sort(([, a], [, b]) => b - a)
      .map(([agent, weight]) => ({ agent, weight }));
  }

  /**
   * Get recommended provider for coding tasks
   * @returns {string} Best provider name
   */
  getBestProviderForCoding() {
    const recommendations = this.getRecommendedAgents('coding');
    return recommendations[0]?.agent || 'openrouter';
  }

  /**
   * Analyze learning patterns
   * @returns {object} Analysis results
   */
  analyzePatterns() {
    const patterns = {
      totalExperiences: this.experiences.length,
      averageRating: 0,
      ratingsByIntent: {},
      bestAgentsByIntent: {},
      recentTrend: 'stable'
    };

    if (this.experiences.length === 0) {
      return patterns;
    }

    // Calculate average rating
    const sumRatings = this.experiences.reduce((sum, e) => sum + (e.rating || 0), 0);
    patterns.averageRating = (sumRatings / this.experiences.length).toFixed(2);

    // Group by intent
    const byIntent = {};
    this.experiences.forEach(e => {
      if (!byIntent[e.intent]) {
        byIntent[e.intent] = { count: 0, totalRating: 0 };
      }
      byIntent[e.intent].count++;
      byIntent[e.intent].totalRating += e.rating || 0;
    });

    for (const [intent, data] of Object.entries(byIntent)) {
      patterns.ratingsByIntent[intent] = (data.totalRating / data.count).toFixed(2);
    }

    // Best agents by intent
    for (const intent of Object.keys(this.routingWeights)) {
      const best = this.getRecommendedAgents(intent)[0];
      if (best) {
        patterns.bestAgentsByIntent[intent] = best.agent;
      }
    }

    // Recent trend (last 10 vs previous 10)
    const recent = this.experiences.slice(-10);
    const previous = this.experiences.slice(-20, -10);
    
    if (previous.length > 0) {
      const recentAvg = recent.reduce((s, e) => s + (e.rating || 0), 0) / recent.length;
      const prevAvg = previous.reduce((s, e) => s + (e.rating || 0), 0) / previous.length;
      
      if (recentAvg > prevAvg + 0.3) {
        patterns.recentTrend = 'improving';
      } else if (recentAvg < prevAvg - 0.3) {
        patterns.recentTrend = 'declining';
      }
    }

    return patterns;
  }

  /**
   * Reset learning data
   */
  reset() {
    this.experiences = [];
    this.routingWeights = {
      coding: { openrouter: 1.0, openai: 1.0, anthropic: 1.0, gemini: 1.0, groq: 1.0 },
      fileOps: { filesystem: 1.0 },
      analysis: { codeAnalyzer: 1.0 },
      reasoning: { openrouter: 1.0, openai: 1.0, anthropic: 1.0, gemini: 1.0, groq: 1.0 },
      reorganize: { llm: 1.0, filesystem: 1.0, codeAnalyzer: 1.0 }
    };
    this._saveLearning();
    console.log('[SelfLearning] Reset all learning data');
  }

  /**
   * Export learning data
   * @returns {object} Learning data
   */
  export() {
    return {
      experiences: this.experiences,
      routingWeights: this.routingWeights,
      analysis: this.analyzePatterns()
    };
  }
}

// Singleton instance
const selfLearningModule = new SelfLearningModule();

module.exports = { SelfLearningModule, selfLearningModule };
