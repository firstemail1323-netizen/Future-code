/**
 * Event Store - Immutable append-only event storage
 * Implements Event Sourcing pattern for full history and time travel
 */

const fs = require('fs');
const path = require('path');

class EventStore {
  constructor(dataPath = './data/events.json') {
    this.dataPath = dataPath;
    this.events = [];
    this.eventTypes = new Set();
    this._ensureDataDirectory();
    this._loadEvents();
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDirectory() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load events from storage
   */
  _loadEvents() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf8');
        this.events = JSON.parse(data);
        this.events.forEach(e => this.eventTypes.add(e.type));
        console.log(`[EventStore] Loaded ${this.events.length} events`);
      }
    } catch (e) {
      console.error(`[EventStore] Failed to load events: ${e.message}`);
      this.events = [];
    }
  }

  /**
   * Save events to storage
   */
  _saveEvents() {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.events, null, 2), 'utf8');
    } catch (e) {
      console.error(`[EventStore] Failed to save events: ${e.message}`);
    }
  }

  /**
   * Append a new event (immutable)
   * @param {string} type - Event type
   * @param {object} payload - Event data
   * @param {string} aggregateId - Aggregate identifier
   * @returns {object} The created event
   */
  append(type, payload, aggregateId = null) {
    const event = {
      id: this._generateId(),
      type,
      aggregateId: aggregateId || this._generateAggregateId(),
      payload,
      timestamp: Date.now(),
      version: this._getAggregateVersion(aggregateId) + 1
    };

    this.events.push(event);
    this.eventTypes.add(type);
    this._saveEvents();

    console.log(`[EventStore] Appended: ${type} (${event.id})`);
    return event;
  }

  /**
   * Get all events
   * @param {string} type - Optional type filter
   * @returns {Array} All events
   */
  getAll(type = null) {
    if (type) {
      return this.events.filter(e => e.type === type);
    }
    return this.events;
  }

  /**
   * Get events for a specific aggregate
   * @param {string} aggregateId - Aggregate ID
   * @returns {Array} Events for aggregate
   */
  getForAggregate(aggregateId) {
    return this.events.filter(e => e.aggregateId === aggregateId);
  }

  /**
   * Get events since a timestamp
   * @param {number} since - Timestamp
   * @returns {Array} Events since timestamp
   */
  getSince(since) {
    return this.events.filter(e => e.timestamp > since);
  }

  /**
   * Replay events (for rebuilding state)
   * @param {function} handler - Event handler function
   * @param {string} type - Optional type filter
   */
  replay(handler, type = null) {
    const events = type ? this.getAll(type) : this.getAll();
    events.forEach(event => {
      handler(event);
    });
  }

  /**
   * Time travel: get state at a specific point in time
   * @param {number} timestamp - Target timestamp
   * @param {function} reducer - State reducer function
   * @param {any} initialState - Initial state
   * @returns {any} State at timestamp
   */
  getStateAt(timestamp, reducer, initialState) {
    const eventsUpTo = this.events.filter(e => e.timestamp <= timestamp);
    return eventsUpTo.reduce(reducer, initialState);
  }

  /**
   * Undo the last N events
   * @param {number} count - Number of events to undo
   * @returns {Array} Undone events
   */
  undo(count = 1) {
    const undone = this.events.splice(-count, count);
    this._saveEvents();
    console.log(`[EventStore] Undid ${undone.length} events`);
    return undone;
  }

  /**
   * Get event statistics
   * @returns {object} Event stats
   */
  getStats() {
    const byType = {};
    this.events.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    return {
      totalEvents: this.events.length,
      eventTypes: Array.from(this.eventTypes),
      byType,
      firstEvent: this.events[0]?.timestamp || null,
      lastEvent: this.events[this.events.length - 1]?.timestamp || null
    };
  }

  /**
   * Clear all events (use with caution!)
   */
  clear() {
    this.events = [];
    this.eventTypes.clear();
    this._saveEvents();
    console.log('[EventStore] Cleared all events');
  }

  /**
   * Generate unique event ID
   * @returns {string} Unique ID
   */
  _generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate aggregate ID
   * @returns {string} Aggregate ID
   */
  _generateAggregateId() {
    return `agg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get version for an aggregate
   * @param {string} aggregateId - Aggregate ID
   * @returns {number} Version number
   */
  _getAggregateVersion(aggregateId) {
    if (!aggregateId) return 0;
    const aggEvents = this.getForAggregate(aggregateId);
    return aggEvents.length > 0 ? Math.max(...aggEvents.map(e => e.version)) : 0;
  }
}

// Event types
const EventTypes = {
  USER_PROMPT: 'UserPromptEvent',
  AI_RESPONSE: 'AIResponseEvent',
  FILE_CREATED: 'FileCreatedEvent',
  FILE_DELETED: 'FileDeletedEvent',
  FILE_MODIFIED: 'FileModifiedEvent',
  FILE_MOVED: 'FileMovedEvent',
  CONFIG_CHANGED: 'ConfigChangedEvent',
  AGENT_ROUTED: 'AgentRoutedEvent',
  WORKFLOW_STARTED: 'WorkflowStartedEvent',
  WORKFLOW_COMPLETED: 'WorkflowCompletedEvent',
  MEMORY_STORED: 'MemoryStoredEvent',
  LEARNING_FEEDBACK: 'LearningFeedbackEvent'
};

// Singleton instance
const eventStore = new EventStore();

module.exports = { EventStore, eventStore, EventTypes };
