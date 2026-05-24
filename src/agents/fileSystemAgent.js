/**
 * File System Agent - Handles all file operations with sandboxing capability
 * Provides safe file read, write, move, delete operations
 */

const fs = require('fs');
const path = require('path');
const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');
const { 
  readFileContent, 
  writeFileContent, 
  moveFile, 
  deleteFile,
  getProjectFiles 
} = require('../utils/fileUtils');

const { retryWithBackoff, CircuitBreaker } = require('../utils/resilience');
const safeMode = require('../config/safeMode');
const terminal = require('../utils/terminalUtils');
class FileSystemAgent {
  constructor() {
    this.id = 'filesystem-agent';
    this.capabilities = ['read', 'write', 'move', 'delete', 'list', 'analyze'];
    this.sandboxRoot = null;
    this.allowedPatterns = [];
    this.deniedPatterns = ['node_modules', '.git', 'node', 'npm', 'yarn', 'pnpm'];
    this.isSandboxed = false;
    this.operationCount = 0;
    this.circuitBreaker = new CircuitBreaker(2, 10000); // 2 failures, 10s cooldown
    this._setupSubscriptions();
  }

  /**
   * Initialize the agent
   * @param {object} options - Configuration options
   */
  initialize(options = {}) {
    if (options.sandboxRoot) {
      this.sandboxRoot = path.resolve(options.sandboxRoot);
      this.isSandboxed = true;
      console.log(`[FileSystemAgent] Sandboxed to: ${this.sandboxRoot}`);
    }
    
    if (options.allowedPatterns) {
      this.allowedPatterns = options.allowedPatterns;
    }

    if (options.disabledCapabilities) {
      options.disabledCapabilities.forEach(cap => {
        const index = this.capabilities.indexOf(cap);
        if (index > -1) this.capabilities.splice(index, 1);
      });
    }

    console.log(`[FileSystemAgent] Initialized. Capabilities: ${this.capabilities.join(', ')}`);
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    // File read requests
    bus.subscribe('agent.filesystem.read', async (envelope) => {
      await this._handleRead(envelope);
    });

    // File write requests
    bus.subscribe('agent.filesystem.write', async (envelope) => {
      await this._handleWrite(envelope);
    });

    // File move requests
    bus.subscribe('agent.filesystem.move', async (envelope) => {
      await this._handleMove(envelope);
    });

    // File delete requests
    bus.subscribe('agent.filesystem.delete', async (envelope) => {
      await this._handleDelete(envelope);
    });

    // List files requests
    bus.subscribe('agent.filesystem.list', async (envelope) => {
      await this._handleList(envelope);
    });
  }

  /**
   * Validate path is within sandbox
   * @param {string} filePath - Path to validate
   * @returns {boolean} True if valid
   */
  _validatePath(filePath) {
    const resolved = path.resolve(filePath);

    // Check denied patterns
    for (const pattern of this.deniedPatterns) {
      if (resolved.includes(pattern)) {
        console.warn(`[FileSystemAgent] Denied access to path containing "${pattern}": ${filePath}`);
        return false;
      }
    }

    // Check sandbox root
    if (this.isSandboxed && !resolved.startsWith(this.sandboxRoot)) {
      console.warn(`[FileSystemAgent] Path outside sandbox: ${filePath}`);
      return false;
    }

    // Check allowed patterns if specified
    if (this.allowedPatterns.length > 0) {
      const isAllowed = this.allowedPatterns.some(pattern => 
        resolved.includes(pattern) || new RegExp(pattern).test(resolved)
      );
      if (!isAllowed) {
        console.warn(`[FileSystemAgent] Path not matching allowed patterns: ${filePath}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Handle file read request
   * @param {object} envelope - Message envelope
   */
  async _handleRead(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      if (!this.capabilities.includes('read')) {
        throw new Error('Read capability disabled');
      }

      if (!this._validatePath(filePath)) {
        throw new Error('Path validation failed');
      }

      const content = readFileContent(filePath);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.read.response',
          correlationId,
          success: true,
          content,
          filePath
        });
      }

      this.operationCount++;
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.read.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle file write request
   * @param {object} envelope - Message envelope
   */
  async _handleWrite(envelope) {
    const { filePath, content, correlationId, replyTo } = envelope.message;

    try {
      if (!this.capabilities.includes('write')) {
        throw new Error('Write capability disabled');
      }

      if (!this._validatePath(filePath)) {
        throw new Error('Path validation failed');
      }

      const exists = fs.existsSync(filePath);
      const success = writeFileContent(filePath, content);

      if (success) {
        // Record event
        eventStore.append(exists ? EventTypes.FILE_MODIFIED : EventTypes.FILE_CREATED, {
          filePath,
          contentLength: content.length,
          operation: exists ? 'modified' : 'created'
        });

        if (replyTo) {
          bus.publish(replyTo, {
            type: 'filesystem.write.response',
            correlationId,
            success: true,
            filePath,
            existed: exists
          });
        }

        this.operationCount++;
      } else {
        throw new Error('Failed to write file');
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.write.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle file move request
   * @param {object} envelope - Message envelope
   */
  async _handleMove(envelope) {
    const { fromPath, toPath, correlationId, replyTo } = envelope.message;

    try {
      if (!this.capabilities.includes('move')) {
        throw new Error('Move capability disabled');
      }

      if (!this._validatePath(fromPath) || !this._validatePath(toPath)) {
        throw new Error('Path validation failed');
      }

      const success = moveFile(fromPath, toPath);

      if (success) {
        eventStore.append(EventTypes.FILE_MOVED, {
          fromPath,
          toPath
        });

        if (replyTo) {
          bus.publish(replyTo, {
            type: 'filesystem.move.response',
            correlationId,
            success: true,
            fromPath,
            toPath
          });
        }

        this.operationCount++;
      } else {
        throw new Error('Failed to move file');
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.move.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle file delete request
   * @param {object} envelope - Message envelope
   */
  async _handleDelete(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      if (!this.capabilities.includes('delete')) {
        throw new Error('Delete capability disabled');
      }

      if (!this._validatePath(filePath)) {
        throw new Error('Path validation failed');
      }

      const exists = fs.existsSync(filePath);
      if (!exists) {
        throw new Error('File does not exist');
      }

      const success = deleteFile(filePath);

      if (success) {
        eventStore.append(EventTypes.FILE_DELETED, {
          filePath
        });

        if (replyTo) {
          bus.publish(replyTo, {
            type: 'filesystem.delete.response',
            correlationId,
            success: true,
            filePath
          });
        }

        this.operationCount++;
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.delete.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle list files request
   * @param {object} envelope - Message envelope
   */
  async _handleList(envelope) {
    const { dirPath = '.', correlationId, replyTo } = envelope.message;

    try {
      if (!this.capabilities.includes('list')) {
        throw new Error('List capability disabled');
      }

      const files = getProjectFiles(dirPath);

      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.list.response',
          correlationId,
          success: true,
          files,
          count: files.length
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'filesystem.list.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Direct read method (for non-bus usage)
   * @param {string} filePath - Path to file
   * @returns {string|null} File content
   */
  read(filePath) {
    if (!this._validatePath(filePath)) return null;
    return readFileContent(filePath);
  }

  /**
   * Direct write method (for non-bus usage)
   * @param {string} filePath - Path to file
   * @param {string} content - Content to write
   * @returns {boolean} Success status
   */
  write(filePath, content) {
    if (!this._validatePath(filePath)) return false;
    
    const exists = fs.existsSync(filePath);
    const success = writeFileContent(filePath, content);
    
    if (success) {
      eventStore.append(exists ? EventTypes.FILE_MODIFIED : EventTypes.FILE_CREATED, {
        filePath,
        contentLength: content.length
      });
      this.operationCount++;
    }
    
    return success;
  }

  /**
   * Get agent status
   * @returns {object} Agent status
   */
  getStatus() {
    return {
      id: this.id,
      isSandboxed: this.isSandboxed,
      sandboxRoot: this.sandboxRoot,
      capabilities: this.capabilities,
      operationCount: this.operationCount
    };
  }
}

// Singleton instance
const fileSystemAgent = new FileSystemAgent();

module.exports = { FileSystemAgent, fileSystemAgent };
