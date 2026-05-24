/**
 * Project Memory Agent - Maintains short-term and long-term memory of project context
 * Stores file hashes, AI suggestions, and conversation history
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');
const { readFileContent } = require('../utils/fileUtils');

class ProjectMemoryAgent {
  constructor() {
    this.id = 'project-memory-agent';
    this.capabilities = ['store', 'retrieve', 'search', 'forget', 'summarize'];
    this.memoryPath = './data/memory.json';
    this.shortTermMemory = [];
    this.longTermMemory = [];
    this.fileHashes = new Map();
    this.maxShortTermSize = 100;
    this.maxLongTermSize = 1000;
    this._ensureDataDirectory();
    this._loadMemory();
    this._setupSubscriptions();
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDirectory() {
    const dir = path.dirname(this.memoryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load memory from storage
   */
  _loadMemory() {
    try {
      if (fs.existsSync(this.memoryPath)) {
        const data = fs.readFileSync(this.memoryPath, 'utf8');
        const parsed = JSON.parse(data);
        this.longTermMemory = parsed.longTerm || [];
        this.fileHashes = new Map(parsed.fileHashes || []);
        console.log(`[ProjectMemoryAgent] Loaded ${this.longTermMemory.length} long-term memories`);
      }
    } catch (e) {
      console.error(`[ProjectMemoryAgent] Failed to load memory: ${e.message}`);
    }
  }

  /**
   * Save memory to storage
   */
  _saveMemory() {
    try {
      const data = {
        shortTerm: this.shortTermMemory,
        longTerm: this.longTermMemory,
        fileHashes: Array.from(this.fileHashes.entries()),
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.memoryPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[ProjectMemoryAgent] Failed to save memory: ${e.message}`);
    }
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // Store memory requests
    bus.subscribe('agent.memory.store', async (envelope) => {
      await this._handleStore(envelope);
    });

    // Retrieve memory requests
    bus.subscribe('agent.memory.retrieve', async (envelope) => {
      await this._handleRetrieve(envelope);
    });

    // Search memory requests
    bus.subscribe('agent.memory.search', async (envelope) => {
      await this._handleSearch(envelope);
    });

    // File change tracking
    bus.subscribe('filesystem.write.response', (envelope) => {
      if (envelope.message.success) {
        this.trackFileChange(envelope.message.filePath);
      }
    });
  }

  /**
   * Handle store request
   * @param {object} envelope - Message envelope
   */
  async _handleStore(envelope) {
    const { type, content, metadata = {}, correlationId, replyTo } = envelope.message;

    try {
      const memory = this.store(type, content, metadata);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.store.response',
          correlationId,
          success: true,
          memoryId: memory.id
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.store.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle retrieve request
   * @param {object} envelope - Message envelope
   */
  async _handleRetrieve(envelope) {
    const { memoryId, correlationId, replyTo } = envelope.message;

    try {
      const memory = this.retrieve(memoryId);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.retrieve.response',
          correlationId,
          success: true,
          memory
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.retrieve.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle search request
   * @param {object} envelope - Message envelope
   */
  async _handleSearch(envelope) {
    const { query, limit = 10, correlationId, replyTo } = envelope.message;

    try {
      const results = this.search(query, limit);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.search.response',
          correlationId,
          success: true,
          results,
          count: results.length
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'memory.search.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Store a memory
   * @param {string} type - Memory type
   * @param {any} content - Memory content
   * @param {object} metadata - Additional metadata
   * @returns {object} Stored memory
   */
  store(type, content, metadata = {}) {
    const memory = {
      id: this._generateId(),
      type,
      content,
      metadata,
      timestamp: Date.now(),
      importance: metadata.importance || 1
    };

    // Add to short-term memory
    this.shortTermMemory.push(memory);
    if (this.shortTermMemory.length > this.maxShortTermSize) {
      // Consolidate oldest short-term to long-term
      const oldest = this.shortTermMemory.shift();
      if (oldest.importance >= 2) {
        this.longTermMemory.push(oldest);
        if (this.longTermMemory.length > this.maxLongTermSize) {
          this.longTermMemory.shift();
        }
      }
    }

    // Record event
    eventStore.append(EventTypes.MEMORY_STORED, {
      memoryId: memory.id,
      type,
      importance: memory.importance
    });

    this._saveMemory();
    return memory;
  }

  /**
   * Retrieve a memory by ID
   * @param {string} memoryId - Memory ID
   * @returns {object|null} Memory or null
   */
  retrieve(memoryId) {
    return this.shortTermMemory.find(m => m.id === memoryId) ||
           this.longTermMemory.find(m => m.id === memoryId) || null;
  }

  /**
   * Search memories by query
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} Search results
   */
  search(query, limit = 10) {
    const allMemories = [...this.shortTermMemory, ...this.longTermMemory];
    const queryLower = query.toLowerCase();

    const results = allMemories.filter(m => {
      const contentStr = JSON.stringify(m.content).toLowerCase();
      const typeMatch = m.type.toLowerCase().includes(queryLower);
      const contentMatch = contentStr.includes(queryLower);
      return typeMatch || contentMatch;
    });

    // Sort by relevance (importance and recency)
    results.sort((a, b) => {
      const scoreA = a.importance * 1000000 + a.timestamp;
      const scoreB = b.importance * 1000000 + b.timestamp;
      return scoreB - scoreA;
    });

    return results.slice(0, limit);
  }

  /**
   * Track file changes
   * @param {string} filePath - File path
   */
  trackFileChange(filePath) {
    const content = readFileContent(filePath);
    if (!content) return;

    const hash = crypto.createHash('md5').update(content).digest('hex');
    const previousHash = this.fileHashes.get(filePath);

    this.fileHashes.set(filePath, {
      hash,
      previousHash,
      changedAt: Date.now()
    });

    // Store as memory if significant
    if (previousHash && previousHash !== hash) {
      this.store('file_change', {
        filePath,
        hash,
        previousHash
      }, { importance: 2 });
    }

    this._saveMemory();
  }

  /**
   * Get file hash
   * @param {string} filePath - File path
   * @returns {string|null} Hash or null
   */
  getFileHash(filePath) {
    const entry = this.fileHashes.get(filePath);
    return entry?.hash || null;
  }

  /**
   * Get file change history
   * @param {string} filePath - File path
   * @returns {Array} Change history
   */
  getFileHistory(filePath) {
    return this.longTermMemory.filter(m => 
      m.type === 'file_change' && m.content.filePath === filePath
    );
  }

  /**
   * Forget old memories
   * @param {number} beforeTimestamp - Forget memories before this time
   */
  forget(beforeTimestamp) {
    const shortTermCount = this.shortTermMemory.length;
    const longTermCount = this.longTermMemory.length;

    this.shortTermMemory = this.shortTermMemory.filter(m => m.timestamp > beforeTimestamp);
    this.longTermMemory = this.longTermMemory.filter(m => m.timestamp > beforeTimestamp);

    const forgotten = (shortTermCount - this.shortTermMemory.length) + 
                      (longTermCount - this.longTermMemory.length);

    this._saveMemory();
    console.log(`[ProjectMemoryAgent] Forgot ${forgotten} old memories`);
    return forgotten;
  }

  /**
   * Get summary of project state
   * @returns {object} Summary
   */
  getSummary() {
    const recentChanges = this.longTermMemory
      .filter(m => m.type === 'file_change' && m.timestamp > Date.now() - 3600000)
      .length;

    return {
      shortTermCount: this.shortTermMemory.length,
      longTermCount: this.longTermMemory.length,
      trackedFiles: this.fileHashes.size,
      recentChanges,
      lastUpdated: this.longTermMemory[this.longTermMemory.length - 1]?.timestamp || null
    };
  }

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  _generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get agent status
   * @returns {object} Agent status
   */
  getStatus() {
    return {
      id: this.id,
      capabilities: this.capabilities,
      ...this.getSummary()
    };
  }
}

// Singleton instance
const projectMemoryAgent = new ProjectMemoryAgent();

module.exports = { ProjectMemoryAgent, projectMemoryAgent };
