/**
 * Code Analyzer Agent - Parses code, understands imports, detects dead code
 * Provides static analysis capabilities for JavaScript/TypeScript and Python
 */

const fs = require('fs');
const path = require('path');
const { bus } = require('../bus/messageBus');
const { readFileContent } = require('../utils/fileUtils');

class CodeAnalyzerAgent {
  constructor() {
    this.id = 'code-analyzer-agent';
    this.capabilities = ['parse', 'analyze-imports', 'detect-dead-code', 'metrics', 'complexity'];
    this.supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.mjs', '.cjs'];
    this._setupSubscriptions();
  }

  /**
   * Set up message bus subscriptions
   */
  _setupSubscriptions() {
    bus.subscribe('agent.code-analyzer.analyze', async (envelope) => {
      await this._handleAnalyze(envelope);
    });

    bus.subscribe('agent.code-analyzer.imports', async (envelope) => {
      await this._handleImports(envelope);
    });

    bus.subscribe('agent.code-analyzer.dead-code', async (envelope) => {
      await this._handleDeadCode(envelope);
    });

    bus.subscribe('agent.code-analyzer.metrics', async (envelope) => {
      await this._handleMetrics(envelope);
    });
  }

  /**
   * Handle analyze request
   * @param {object} envelope - Message envelope
   */
  async _handleAnalyze(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      const analysis = this.analyzeFile(filePath);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.analyze.response',
          correlationId,
          success: true,
          analysis
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.analyze.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle imports analysis request
   * @param {object} envelope - Message envelope
   */
  async _handleImports(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      const imports = this.extractImports(filePath);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.imports.response',
          correlationId,
          success: true,
          imports
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.imports.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle dead code detection request
   * @param {object} envelope - Message envelope
   */
  async _handleDeadCode(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      const deadCode = this.detectDeadCode(filePath);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.dead-code.response',
          correlationId,
          success: true,
          deadCode
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.dead-code.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle metrics request
   * @param {object} envelope - Message envelope
   */
  async _handleMetrics(envelope) {
    const { filePath, correlationId, replyTo } = envelope.message;

    try {
      const metrics = this.calculateMetrics(filePath);
      
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.metrics.response',
          correlationId,
          success: true,
          metrics
        });
      }
    } catch (error) {
      if (replyTo) {
        bus.publish(replyTo, {
          type: 'code-analyzer.metrics.response',
          correlationId,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Analyze a file
   * @param {string} filePath - Path to file
   * @returns {object} Analysis result
   */
  analyzeFile(filePath) {
    const content = readFileContent(filePath);
    if (!content) return null;

    const ext = path.extname(filePath).toLowerCase();
    if (!this.supportedExtensions.includes(ext)) {
      return { error: 'Unsupported file type' };
    }

    return {
      filePath,
      extension: ext,
      lineCount: content.split('\n').length,
      charCount: content.length,
      imports: this.extractImports(filePath),
      exports: this.extractExports(content, ext),
      functions: this.extractFunctions(content, ext),
      classes: this.extractClasses(content, ext),
      complexity: this.estimateComplexity(content)
    };
  }

  /**
   * Extract imports from a file
   * @param {string} filePath - Path to file
   * @returns {Array} List of imports
   */
  extractImports(filePath) {
    const content = readFileContent(filePath);
    if (!content) return [];

    const ext = path.extname(filePath).toLowerCase();
    const imports = [];

    if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      // JavaScript/TypeScript imports
      const importRegex = /import\s+(?:[\w{}\s,*]+\s+from\s+)?['"]([^'"]+)['"]/g;
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push({ type: 'import', path: match[1] });
      }
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push({ type: 'require', path: match[1] });
      }
    } else if (ext === '.py') {
      // Python imports
      const importRegex = /^import\s+([\w.]+)/gm;
      const fromImportRegex = /^from\s+([\w.]+)\s+import/gm;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push({ type: 'import', path: match[1] });
      }
      while ((match = fromImportRegex.exec(content)) !== null) {
        imports.push({ type: 'from', path: match[1] });
      }
    }

    return imports;
  }

  /**
   * Extract exports from content
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @returns {Array} List of exports
   */
  extractExports(content, ext) {
    const exports = [];

    if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class|async function)\s+(\w+)/g;
      const moduleExports = /module\.exports\s*=\s*(\{[^}]+\})/g;
      
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push({ name: match[1], type: 'named' });
      }
      while ((match = moduleExports.exec(content)) !== null) {
        exports.push({ content: match[1], type: 'commonjs' });
      }
    }

    return exports;
  }

  /**
   * Extract functions from content
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @returns {Array} List of functions
   */
  extractFunctions(content, ext) {
    const functions = [];

    if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      const funcRegex = /(?:async\s+)?function\s*\*?\s*(\w+)\s*\([^)]*\)/g;
      const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
      const methodRegex = /(\w+)\s*\([^)]*\)\s*\{/g;
      
      let match;
      while ((match = funcRegex.exec(content)) !== null) {
        functions.push({ name: match[1], type: 'function' });
      }
      while ((match = arrowRegex.exec(content)) !== null) {
        functions.push({ name: match[1], type: 'arrow' });
      }
    } else if (ext === '.py') {
      const funcRegex = /def\s+(\w+)\s*\(/g;
      let match;
      while ((match = funcRegex.exec(content)) !== null) {
        functions.push({ name: match[1], type: 'function' });
      }
    }

    return functions;
  }

  /**
   * Extract classes from content
   * @param {string} content - File content
   * @param {string} ext - File extension
   * @returns {Array} List of classes
   */
  extractClasses(content, ext) {
    const classes = [];

    if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        classes.push({ name: match[1], extends: match[2] || null });
      }
    } else if (ext === '.py') {
      const classRegex = /class\s+(\w+)(?:\s*\([^)]+\))?/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        classes.push({ name: match[1] });
      }
    }

    return classes;
  }

  /**
   * Estimate code complexity
   * @param {string} content - File content
   * @returns {object} Complexity metrics
   */
  estimateComplexity(content) {
    const lines = content.split('\n');
    
    // Count control structures
    const ifCount = (content.match(/\bif\s*\(/g) || []).length;
    const elseCount = (content.match(/\belse\b/g) || []).length;
    const forCount = (content.match(/\bfor\s*\(/g) || []).length;
    const whileCount = (content.match(/\bwhile\s*\(/g) || []).length;
    const switchCount = (content.match(/\bswitch\s*\(/g) || []).length;
    const tryCount = (content.match(/\btry\s*\{/g) || []).length;
    const catchCount = (content.match(/\bcatch\s*\(/g) || []).length;

    // Nesting depth estimation (simplified)
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of content) {
      if (char === '{' || char === '(') currentDepth++;
      if (char === '}' || char === ')') currentDepth--;
      maxDepth = Math.max(maxDepth, currentDepth);
    }

    const cyclomaticComplexity = 1 + ifCount + elseCount + forCount + whileCount + switchCount + catchCount;

    return {
      cyclomaticComplexity,
      maxNestingDepth: maxDepth,
      controlStructures: {
        if: ifCount,
        else: elseCount,
        for: forCount,
        while: whileCount,
        switch: switchCount,
        try: tryCount,
        catch: catchCount
      },
      riskLevel: cyclomaticComplexity > 20 ? 'high' : cyclomaticComplexity > 10 ? 'medium' : 'low'
    };
  }

  /**
   * Detect potential dead code
   * @param {string} filePath - Path to file
   * @returns {Array} Potential dead code locations
   */
  detectDeadCode(filePath) {
    const content = readFileContent(filePath);
    if (!content) return [];

    const deadCode = [];
    const lines = content.split('\n');

    // Look for commented-out code blocks
    let inBlockComment = false;
    let blockCommentStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Block comments
      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
        blockCommentStart = i;
      }
      if (inBlockComment && trimmed.endsWith('*/')) {
        if (i - blockCommentStart > 5) {
          deadCode.push({
            type: 'large_comment_block',
            startLine: blockCommentStart + 1,
            endLine: i + 1,
            reason: 'Large comment block may contain dead code'
          });
        }
        inBlockComment = false;
      }

      // Long single-line comments with code-like content
      if (trimmed.startsWith('//') && trimmed.length > 50) {
        const codePattern = /[a-zA-Z]\s*\(|=>|function|class|import|require/;
        if (codePattern.test(trimmed)) {
          deadCode.push({
            type: 'commented_code',
            line: i + 1,
            content: trimmed.substring(0, 80) + '...',
            reason: 'Comment may contain code'
          });
        }
      }

      // Unused variables (simple heuristic)
      const varDeclMatch = trimmed.match(/^(?:const|let|var)\s+(\w+)\s*=/);
      if (varDeclMatch) {
        const varName = varDeclMatch[1];
        const usageCount = (content.match(new RegExp(`\\b${varName}\\b`, 'g')) || []).length;
        if (usageCount === 1) {
          deadCode.push({
            type: 'possibly_unused_variable',
            line: i + 1,
            variable: varName,
            reason: 'Variable declared but may not be used'
          });
        }
      }
    }

    return deadCode;
  }

  /**
   * Calculate file metrics
   * @param {string} filePath - Path to file
   * @returns {object} Metrics
   */
  calculateMetrics(filePath) {
    const content = readFileContent(filePath);
    if (!content) return null;

    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('/*'));

    return {
      totalLines: lines.length,
      nonEmptyLines: nonEmptyLines.length,
      commentLines: commentLines.length,
      codeLines: nonEmptyLines.length - commentLines.length,
      commentRatio: commentLines.length / (lines.length || 1),
      averageLineLength: content.length / (lines.length || 1),
      ...this.estimateComplexity(content)
    };
  }

  /**
   * Get agent status
   * @returns {object} Agent status
   */
  getStatus() {
    return {
      id: this.id,
      capabilities: this.capabilities,
      supportedExtensions: this.supportedExtensions
    };
  }
}

// Singleton instance
const codeAnalyzerAgent = new CodeAnalyzerAgent();

module.exports = { CodeAnalyzerAgent, codeAnalyzerAgent };
