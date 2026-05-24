/**
 * Static analysis and integrity scanner
 * Analyzes code without modifying it to detect issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const terminal = require('../utils/terminalUtils');

class IntegrityScanner {
  constructor() {
    this.criticalIssues = [];
    this.warnings = [];
    this.auditDir = './data/audit';
    
    // Ensure audit directory exists
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  /**
   * Scan the entire project for integrity issues
   * @param {string} projectPath - Path to scan
   */
  async scanProject(projectPath = './src') {
    this.criticalIssues = [];
    this.warnings = [];

    terminal.printHeader('🔍 Starting Integrity Scan');
    
    const files = this.getAllJavaScriptFiles(projectPath);
    terminal.printInfo(`Found ${files.length} JavaScript files to analyze`);
    
    for (const file of files) {
      await this.analyzeFile(file);
    }

    // Write reports
    this.writeReports();
    
    // Summary
    terminal.printDivider('Scan Complete');
    terminal.printSuccess(`Critical Issues: ${this.criticalIssues.length}`);
    terminal.printWarning(`Warnings: ${this.warnings.length}`);
    terminal.printInfo(`Reports written to ${this.auditDir}/`);
  }

  /**
   * Get all JavaScript files recursively
   * @param {string} dirPath - Directory to scan
   * @returns {Array<string>} List of file paths
   */
  getAllJavaScriptFiles(dirPath) {
    const files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      
      // Skip node_modules and hidden directories
      if (item === 'node_modules' || item.startsWith('.')) {
        continue;
      }
      
      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...this.getAllJavaScriptFiles(fullPath));
        } else if (item.endsWith('.js')) {
          files.push(fullPath);
        }
      } catch (error) {
        // Skip inaccessible files
      }
    }

    return files;
  }

  /**
   * Analyze a single file for issues
   * @param {string} filePath - Path to the file
   */
  async analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check syntax using Node's built-in check
      this.checkSyntax(filePath, content);
      
      // Check for missing imports
      this.checkMissingImports(filePath, content);
      
      // Check for unused variables/functions (basic static analysis)
      this.checkUnusedDeclarations(filePath, content);
      
      // Check for unhandled Promise rejections
      this.checkUnhandledPromises(filePath, content);
      
      // Check for dangerous patterns
      this.checkDangerousPatterns(filePath, content);
      
    } catch (error) {
      this.criticalIssues.push({
        file: filePath,
        type: 'READ_ERROR',
        message: `Could not read file: ${error.message}`,
        line: 'N/A'
      });
    }
  }

  /**
   * Check file syntax using Node's --check flag
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   */
  checkSyntax(filePath, content) {
    try {
      // Use Node's syntax check
      execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    } catch (error) {
      const output = error.stderr?.toString() || error.message;
      const lineMatch = output.match(/:(\d+):/);
      this.criticalIssues.push({
        file: filePath,
        type: 'SYNTAX_ERROR',
        message: output.split('\n')[0] || 'Syntax error detected',
        line: lineMatch ? lineMatch[1] : 'unknown'
      });
    }
  }

  /**
   * Check for missing import targets
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   */
  checkMissingImports(filePath, content) {
    const importRegex = /(require\(['"`](.+?)['"`]\)|import\s+.*?\s+from\s+['"`](.+?)['"`])/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[2] || match[3];
      
      // Skip node modules and absolute paths
      if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
        continue;
      }
      
      if (!this.isValidImportPath(importPath, filePath)) {
        this.criticalIssues.push({
          file: filePath,
          type: 'MISSING_IMPORT',
          message: `Missing import target: ${importPath}`,
          line: this.getLineNumber(content, match.index)
        });
      }
    }
  }

  /**
   * Validate an import path exists
   * @param {string} importPath - Import path to validate
   * @param {string} currentFile - Current file path
   * @returns {boolean} True if valid
   */
  isValidImportPath(importPath, currentFile) {
    try {
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Relative path
        const absolutePath = path.resolve(path.dirname(currentFile), importPath);
        
        // Check with .js extension
        if (fs.existsSync(absolutePath + '.js')) {
          return true;
        }
        
        // Check as directory with index.js
        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
          if (fs.existsSync(path.join(absolutePath, 'index.js'))) {
            return true;
          }
        }
        
        // Check exact path
        if (fs.existsSync(absolutePath)) {
          return true;
        }
        
        return false;
      } else {
        // Module path - assume it exists in node_modules
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check for potentially unused declarations
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   */
  checkUnusedDeclarations(filePath, content) {
    // Look for function declarations that might be unused
    const funcRegex = /function\s+(\w+)\s*\(/g;
    let funcMatch;
    
    while ((funcMatch = funcRegex.exec(content)) !== null) {
      const funcName = funcMatch[1];
      
      // Skip common patterns that are expected to be "unused"
      if (['constructor', 'initialize', 'start', 'stop'].includes(funcName)) {
        continue;
      }
      
      // Count occurrences (excluding the declaration itself)
      const allOccurrences = content.match(new RegExp(`\\b${funcName}\\b`, 'g')) || [];
      
      if (allOccurrences.length === 1) { // Only appears in declaration
        this.warnings.push({
          file: filePath,
          type: 'UNUSED_FUNCTION',
          message: `Potentially unused function: ${funcName}`,
          line: this.getLineNumber(content, funcMatch.index)
        });
      }
    }
    
    // Check for const/let variable declarations that are never used
    const varRegex = /(const|let)\s+(\w+)\s*=/g;
    let varMatch;
    
    while ((varMatch = varRegex.exec(content)) !== null) {
      const varName = varMatch[2];
      
      // Skip common patterns
      if (varName.startsWith('_') || ['i', 'j', 'k', 'index', 'count'].includes(varName)) {
        continue;
      }
      
      const allOccurrences = content.match(new RegExp(`\\b${varName}\\b`, 'g')) || [];
      
      if (allOccurrences.length === 1) { // Only appears in declaration
        this.warnings.push({
          file: filePath,
          type: 'UNUSED_VARIABLE',
          message: `Potentially unused variable: ${varName}`,
          line: this.getLineNumber(content, varMatch.index)
        });
      }
    }
  }

  /**
   * Check for unhandled Promise rejections
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   */
  checkUnhandledPromises(filePath, content) {
    // Look for .then() without corresponding .catch()
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for .then( without .catch on same or following lines
      if (line.includes('.then(') && !line.includes('.catch(')) {
        // Look ahead a few lines for .catch
        let foundCatch = false;
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].includes('.catch(')) {
            foundCatch = true;
            break;
          }
        }
        
        if (!foundCatch && !line.includes('//') && !line.includes('/*')) {
          this.warnings.push({
            file: filePath,
            type: 'UNHANDLED_PROMISE',
            message: 'Promise with .then() but no visible .catch()',
            line: i + 1
          });
        }
      }
    }
  }

  /**
   * Check for dangerous code patterns
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   */
  checkDangerousPatterns(filePath, content) {
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, type: 'DANGEROUS_EVAL', message: 'Use of eval() is dangerous' },
      { pattern: /new\s+Function\s*\(/, type: 'DANGEROUS_FUNCTION_CONSTRUCTOR', message: 'Use of Function constructor is dangerous' },
      { pattern: /child_process\.exec\s*\(/, type: 'COMMAND_INJECTION_RISK', message: 'Potential command injection risk' }
    ];
    
    for (const { pattern, type, message } of dangerousPatterns) {
      if (pattern.test(content)) {
        this.warnings.push({
          file: filePath,
          type,
          message,
          line: 'multiple'
        });
      }
    }
  }

  /**
   * Get line number from content position
   * @param {string} content - File content
   * @param {number} position - Character position
   * @returns {number} Line number
   */
  getLineNumber(content, position) {
    return content.substring(0, position).split('\n').length;
  }

  /**
   * Write audit reports to files
   */
  writeReports() {
    // Write critical issues
    const criticalContent = this.criticalIssues.length > 0
      ? this.criticalIssues.map(issue => 
          `- **${issue.file}** (${issue.type}): ${issue.message} (line: ${issue.line})`
        ).join('\n')
      : 'No critical issues found.';
    
    fs.writeFileSync(
      path.join(this.auditDir, 'CRITICAL_ISSUES.md'),
      `# Critical Issues\n\n${criticalContent}\n`
    );

    // Write warnings
    const warningsContent = this.warnings.length > 0
      ? this.warnings.map(issue => 
          `- **${issue.file}** (${issue.type}): ${issue.message} (line: ${issue.line})`
        ).join('\n')
      : 'No warnings found.';
    
    fs.writeFileSync(
      path.join(this.auditDir, 'WARNINGS.md'),
      `# Warnings\n\n${warningsContent}\n`
    );
  }

  /**
   * Get scan results
   * @returns {object} Scan results
   */
  getResults() {
    return {
      criticalIssues: this.criticalIssues,
      warnings: this.warnings,
      totalIssues: this.criticalIssues.length + this.warnings.length
    };
  }
}

module.exports = IntegrityScanner;
