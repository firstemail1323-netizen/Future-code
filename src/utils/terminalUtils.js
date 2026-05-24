/**
 * Terminal Utils - ANSI color utilities for structured CLI output
 * Provides consistent, colorful terminal output with structured sections
 */

const chalk = require('chalk');

// Global flag for color support
let colorsEnabled = true;

/**
 * Check if colors should be enabled
 * @returns {boolean} True if colors are enabled
 */
function areColorsEnabled() {
  return colorsEnabled && process.stdout.isTTY;
}

/**
 * Set color enable/disable state
 * @param {boolean} enabled - Enable or disable colors
 */
function setColorsEnabled(enabled) {
  colorsEnabled = enabled;
}

/**
 * Print a header with blue bold text and lines above/below
 * @param {string} text - Header text
 */
function printHeader(text) {
  const line = '═'.repeat(Math.max(text.length + 4, 50));
  const headerText = colorsEnabled ? chalk.blue.bold(`  ${text}  `) : `  ${text}  `;
  
  console.log(colorsEnabled ? chalk.blue.bold(line) : line);
  console.log(headerText);
  console.log(colorsEnabled ? chalk.blue.bold(line) : line);
  console.log();
}

/**
 * Print success message with green text and checkmark
 * @param {string} text - Success message
 */
function printSuccess(text) {
  const icon = '✅';
  const message = colorsEnabled ? chalk.green(`${icon} ${text}`) : `${icon} ${text}`;
  console.log(message);
}

/**
 * Print error message with red text and X icon
 * @param {string} text - Error message
 */
function printError(text) {
  const icon = '❌';
  const message = colorsEnabled ? chalk.red(`${icon} ${text}`) : `${icon} ${text}`;
  console.error(message);
}

/**
 * Print info message with cyan text and info icon
 * @param {string} text - Info message
 */
function printInfo(text) {
  const icon = 'ℹ️';
  const message = colorsEnabled ? chalk.cyan(`${icon} ${text}`) : `${icon} ${text}`;
  console.log(message);
}

/**
 * Print warning message with yellow text and warning icon
 * @param {string} text - Warning message
 */
function printWarning(text) {
  const icon = '⚠️';
  const message = colorsEnabled ? chalk.yellow(`${icon} ${text}`) : `${icon} ${text}`;
  console.warn(message);
}

/**
 * Print AI response with magenta text
 * @param {string} text - AI response text
 */
function printAIResponse(text) {
  const message = colorsEnabled ? chalk.magenta(text) : text;
  console.log(message);
}

/**
 * Print code block with gray background and border
 * @param {string} code - Code to display
 */
function printCodeBlock(code) {
  const lines = code.split('\n');
  const maxWidth = Math.max(...lines.map(l => l.length), 40);
  const border = '─'.repeat(maxWidth + 4);
  
  console.log(colorsEnabled ? chalk.gray(`┌${border}┐`) : `┌${border}┐`);
  
  for (const line of lines) {
    const padded = line.padEnd(maxWidth);
    console.log(colorsEnabled ? chalk.gray(`│ ${padded} │`) : `│ ${padded} │`);
  }
  
  console.log(colorsEnabled ? chalk.gray(`└${border}┘`) : `└${border}┘`);
  console.log();
}

/**
 * Print execution command highlight
 * @param {string} command - Command to execute
 */
function printExec(command) {
  const label = 'EXEC';
  const borderChar = colorsEnabled ? chalk.yellow('█') : '█';
  const topBorder = borderChar.repeat(60);
  const bottomBorder = borderChar.repeat(60);
  
  console.log();
  console.log(colorsEnabled ? chalk.yellow(topBorder) : topBorder);
  console.log(colorsEnabled ? chalk.yellow.bold(`  ${label}: ${command}`) : `  ${label}: ${command}`);
  console.log(colorsEnabled ? chalk.yellow(bottomBorder) : bottomBorder);
  console.log();
}

/**
 * Print section divider
 * @param {string} title - Optional section title
 */
function printDivider(title = '') {
  const line = '─'.repeat(60);
  if (title) {
    const titleLine = colorsEnabled ? chalk.white.bold(` ── ${title} ── `) : ` ── ${title} ── `;
    console.log(colorsEnabled ? chalk.gray(line) : line);
    console.log(titleLine);
    console.log(colorsEnabled ? chalk.gray(line) : line);
  } else {
    console.log(colorsEnabled ? chalk.gray(line) : line);
  }
}

/**
 * Print status indicator
 * @param {string} status - Status type (ok, pending, error)
 * @param {string} text - Status text
 */
function printStatus(status, text) {
  let icon, colorFn;
  
  switch (status) {
    case 'ok':
    case 'success':
      icon = '✓';
      colorFn = colorsEnabled ? chalk.green : (t) => t;
      break;
    case 'pending':
    case 'loading':
      icon = '…';
      colorFn = colorsEnabled ? chalk.yellow : (t) => t;
      break;
    case 'error':
    case 'fail':
      icon = '✗';
      colorFn = colorsEnabled ? chalk.red : (t) => t;
      break;
    default:
      icon = '•';
      colorFn = colorsEnabled ? chalk.white : (t) => t;
  }
  
  const message = colorFn(`[${icon}] ${text}`);
  console.log(message);
}

/**
 * Print agent initialization message
 * @param {string} agentName - Agent name
 * @param {string} status - Initialization status
 */
function printAgentInit(agentName, status = 'initializing') {
  const prefix = '[AGENT]';
  const name = colorsEnabled ? chalk.cyan.bold(agentName) : agentName;
  const statusColor = status === 'ready' ? chalk.green : chalk.yellow;
  const statusText = statusColor(status);
  
  console.log(`${prefix} ${name}: ${statusText}`);
}

/**
 * Print event log entry
 * @param {string} eventType - Event type
 * @param {object} data - Event data
 */
function printEvent(eventType, data = {}) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const timeStr = colorsEnabled ? chalk.gray(`[${timestamp}]`) : `[${timestamp}]`;
  const typeStr = colorsEnabled ? chalk.blue.bold(eventType) : eventType;
  const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
  
  console.log(`${timeStr} ${typeStr}${dataStr ? ': ' + dataStr : ''}`);
}

module.exports = {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printAIResponse,
  printCodeBlock,
  printExec,
  printDivider,
  printStatus,
  printAgentInit,
  printEvent,
  areColorsEnabled,
  setColorsEnabled
};
