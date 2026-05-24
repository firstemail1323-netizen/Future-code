/**
 * Workflow Engine - Parallel execution of multiple agents
 * Supports concurrent workflows with result merging strategies
 */

const { bus } = require('../bus/messageBus');
const { eventStore, EventTypes } = require('../events/eventStore');

class WorkflowEngine {
  constructor() {
    this.workflows = new Map();
    this.maxConcurrent = 10;
    this.activeCount = 0;
  }

  /**
   * Create and execute a workflow
   * @param {string} id - Workflow ID
   * @param {Array} steps - Workflow steps
   * @param {object} options - Options including merge strategy
   * @returns {Promise<object>} Workflow results
   */
  async execute(id, steps, options = {}) {
    const workflow = {
      id,
      steps,
      status: 'running',
      startTime: Date.now(),
      results: [],
      errors: [],
      mergeStrategy: options.mergeStrategy || 'all',
      parallel: options.parallel !== false
    };

    this.workflows.set(id, workflow);

    // Record start event
    eventStore.append(EventTypes.WORKFLOW_STARTED, {
      workflowId: id,
      stepCount: steps.length,
      parallel: workflow.parallel
    });

    console.log(`[WorkflowEngine] Starting workflow: ${id} with ${steps.length} steps`);

    try {
      if (workflow.parallel) {
        // Execute all steps in parallel
        workflow.results = await this._executeParallel(steps);
      } else {
        // Execute steps sequentially
        workflow.results = await this._executeSequential(steps);
      }

      workflow.status = 'completed';
      workflow.endTime = Date.now();

      // Record completion event
      eventStore.append(EventTypes.WORKFLOW_COMPLETED, {
        workflowId: id,
        status: 'completed',
        resultCount: workflow.results.length,
        duration: workflow.endTime - workflow.startTime
      });

      console.log(`[WorkflowEngine] Workflow completed: ${id}`);
      return this._mergeResults(workflow.results, workflow.mergeStrategy);

    } catch (error) {
      workflow.status = 'failed';
      workflow.errors.push(error.message);
      workflow.endTime = Date.now();

      console.error(`[WorkflowEngine] Workflow failed: ${id} - ${error.message}`);
      throw error;
    } finally {
      this.workflows.delete(id);
    }
  }

  /**
   * Execute steps in parallel
   * @param {Array} steps - Steps to execute
   * @returns {Promise<Array>} Results
   */
  async _executeParallel(steps) {
    const promises = steps.map(async (step, index) => {
      this.activeCount++;
      
      try {
        const result = await this._executeStep(step);
        return { index, success: true, result };
      } catch (error) {
        return { index, success: false, error: error.message };
      } finally {
        this.activeCount--;
      }
    });

    return Promise.all(promises);
  }

  /**
   * Execute steps sequentially
   * @param {Array} steps - Steps to execute
   * @returns {Promise<Array>} Results
   */
  async _executeSequential(steps) {
    const results = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      try {
        const result = await this._executeStep(step, results);
        results.push({ index: i, success: true, result });
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
        
        // Stop on error if configured
        if (step.stopOnError) {
          break;
        }
      }
    }
    
    return results;
  }

  /**
   * Execute a single step
   * @param {object} step - Step configuration
   * @param {Array} previousResults - Results from previous steps
   * @returns {Promise<any>} Step result
   */
  async _executeStep(step, previousResults = []) {
    const { agent, action, params = {}, timeout = 30000 } = step;

    console.log(`[WorkflowEngine] Executing: ${agent}.${action}`);

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Step timeout: ${agent}.${action}`));
      }, timeout);

      // Send request via message bus
      const replyTo = `workflow.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
      
      const unsubscribe = bus.subscribe(replyTo, (envelope) => {
        clearTimeout(timeoutHandle);
        unsubscribe();
        
        if (envelope.message.success) {
          resolve(envelope.message);
        } else {
          reject(new Error(envelope.message.error || 'Step failed'));
        }
      });

      // Publish request to appropriate channel
      const channel = `agent.${agent}.${action}`;
      bus.publish(channel, {
        ...params,
        previousResults,
        replyTo
      });
    });
  }

  /**
   * Merge results based on strategy
   * @param {Array} results - Results to merge
   * @param {string} strategy - Merge strategy
   * @returns {object} Merged result
   */
  _mergeResults(results, strategy) {
    switch (strategy) {
      case 'all':
        return { results };
      
      case 'first-success':
        const firstSuccess = results.find(r => r.success);
        return firstSuccess || { error: 'All steps failed' };
      
      case 'majority':
        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);
        return successes.length > failures.length 
          ? { results: successes }
          : { error: 'Majority failed', failures };
      
      case 'concat':
        return { 
          data: results
            .filter(r => r.success && r.result)
            .flatMap(r => r.result.data || r.result)
        };
      
      case 'aggregate':
        return results.reduce((acc, r) => {
          if (r.success && r.result) {
            Object.assign(acc, r.result);
          }
          return acc;
        }, {});
      
      default:
        return { results };
    }
  }

  /**
   * Get workflow status
   * @param {string} id - Workflow ID
   * @returns {object|null} Workflow status or null
   */
  getStatus(id) {
    return this.workflows.get(id) || null;
  }

  /**
   * Get all active workflows
   * @returns {Array} Active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.workflows.values()).filter(w => w.status === 'running');
  }

  /**
   * Cancel a running workflow
   * @param {string} id - Workflow ID
   * @returns {boolean} Success status
   */
  cancel(id) {
    const workflow = this.workflows.get(id);
    if (!workflow) return false;
    
    workflow.status = 'cancelled';
    workflow.endTime = Date.now();
    
    console.log(`[WorkflowEngine] Cancelled workflow: ${id}`);
    return true;
  }

  /**
   * Get engine statistics
   * @returns {object} Stats
   */
  getStats() {
    return {
      activeWorkflows: this.getActiveWorkflows().length,
      activeSteps: this.activeCount,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// Singleton instance
const workflowEngine = new WorkflowEngine();

module.exports = { WorkflowEngine, workflowEngine };
