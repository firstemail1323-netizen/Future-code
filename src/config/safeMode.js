/**
 * Safe mode configuration and feature flags
 * Controls execution of potentially destructive operations
 */

const fs = require('fs');
const path = require('path');

class SafeModeConfig {
  constructor() {
    this.isEnabled = process.argv.includes('--safe');
    this.isDryRun = process.argv.includes('--dry-run');
    this.noExec = process.argv.includes('--no-exec');
    this.logPath = './data/safeMode.log';
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.logPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Get safe mode status
   * @returns {object} Status flags
   */
  getSafeModeStatus() {
    return {
      enabled: this.isEnabled,
      dryRun: this.isDryRun,
      noExec: this.noExec
    };
  }

  /**
   * Check if actions should be executed
   * @returns {boolean} True if actions can be executed
   */
  shouldExecuteActions() {
    return !this.isEnabled && !this.isDryRun;
  }

  /**
   * Check if exec is disabled
   * @returns {boolean} True if exec is disabled
   */
  isExecDisabled() {
    return this.noExec || this.isEnabled || this.isDryRun;
  }

  /**
   * Log an action that would have been performed
   * @param {string} action - Action type
   * @param {object} details - Action details
   */
  logAction(action, details) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] SAFE MODE ACTION LOGGED:\n`;
    const logDetails = `${action}: ${JSON.stringify(details, null, 2)}\n\n`;
    
    try {
      fs.appendFileSync(this.logPath, logEntry + logDetails);
    } catch (error) {
      console.error(`Failed to write safe mode log: ${error.message}`);
    }
  }

  /**
   * Show safe mode banner
   */
  showBanner() {
    if (this.isEnabled) {
      console.log('\n🔒 ═══════════════════════════════════════════════════════');
      console.log('   SAFE MODE: No file changes will be made.');
      console.log('   Actions are logged to data/safeMode.log');
      console.log('═══════════════════════════════════════════════════════\n');
    } else if (this.isDryRun) {
      console.log('\n🧪 ═══════════════════════════════════════════════════════');
      console.log('   DRY RUN MODE: Simulating actions without execution.');
      console.log('═══════════════════════════════════════════════════════\n');
    }
  }
}

module.exports = new SafeModeConfig();
