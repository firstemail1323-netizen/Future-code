/**
 * Resilience utilities for error correction and recovery
 * Implements retry with exponential backoff and circuit breaker patterns
 */

class CircuitBreaker {
  /**
   * Create a circuit breaker instance
   * @param {number} failureThreshold - Number of failures before opening circuit
   * @param {number} cooldown - Cooldown period in ms before trying again
   */
  constructor(failureThreshold = 2, cooldown = 10000) {
    this.failureThreshold = failureThreshold;
    this.cooldown = cooldown;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.cachedError = null;
  }

  /**
   * Execute a function through the circuit breaker
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result of the function
   */
  async call(fn) {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.cooldown) {
        this.state = 'HALF_OPEN';
        console.log('🔌 Circuit breaker entering HALF_OPEN state');
      } else {
        const remainingCooldown = Math.ceil((this.cooldown - (now - this.lastFailureTime)) / 1000);
        throw new Error(`Circuit breaker is OPEN. Retry in ${remainingCooldown}s`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.cachedError = null;
  }

  /**
   * Handle failed execution
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.cachedError = error;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`⚠️  Circuit breaker OPENED after ${this.failureCount} failures`);
    }
  }

  /**
   * Check if circuit is open
   * @returns {boolean} True if circuit is open
   */
  isOpen() {
    return this.state === 'OPEN';
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
    this.cachedError = null;
  }

  /**
   * Get circuit breaker status
   * @returns {object} Status information
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      cachedError: this.cachedError?.message || null
    };
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, retries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === retries) {
        break;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const waitTime = delay * Math.pow(2, i);
      console.log(`⚠️  Attempt ${i + 1} failed: ${error.message}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
}

/**
 * Alias for retryWithBackoff (for consistency)
 */
const exponentialBackoffRetry = retryWithBackoff;

module.exports = {
  retryWithBackoff,
  exponentialBackoffRetry,
  CircuitBreaker
};
