/**
 * File system utility functions
 * Handles reading, writing, moving, and deleting files
 */

const fs = require('fs');
const path = require('path');

/**
 * Read content from a file
 * @param {string} filePath - Path to the file
 * @returns {string|null} File content or null if error
 */
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Write content to a file, creating directories if needed
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to write
 * @returns {boolean} true on success, false on error
 */
function writeFileContent(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (e) {
    console.error(`❌ Failed to write ${filePath}: ${e.message}`);
    return false;
  }
}

/**
 * Move a file from one location to another
 * @param {string} from - Source path
 * @param {string} to - Destination path
 * @returns {boolean} true on success, false on error
 */
function moveFile(from, to) {
  try {
    const dir = path.dirname(to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.renameSync(from, to);
    return true;
  } catch (e) {
    console.error(`❌ Move failed from ${from} to ${to}: ${e.message}`);
    return false;
  }
}

/**
 * Delete a file
 * @param {string} filePath - Path to the file
 * @returns {boolean} true on success, false on error
 */
function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    console.error(`❌ Delete failed ${filePath}: ${e.message}`);
    return false;
  }
}

/**
 * Get all project files recursively, excluding common ignored directories
 * @param {string} dir - Starting directory
 * @param {string} baseDir - Base directory for relative paths
 * @returns {string[]} Array of relative file paths
 */
function getProjectFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .git, .env, etc.
      if (['node_modules', '.git', '.env', 'dist', 'build'].includes(file)) {
        continue;
      }
      results = results.concat(getProjectFiles(fullPath, baseDir));
    } else {
      // Ignore binary files, .gitignore, etc.
      if (['.gitignore', '.env', 'package-lock.json', 'yarn.lock'].includes(file)) {
        continue;
      }
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}

/**
 * Update import/require statements in a file
 * @param {string} filePath - Path to the file to update
 * @param {Array<{fromPath: string, toPath: string}>} importChanges - Array of import changes
 */
function updateImportsInFile(filePath, importChanges) {
  if (!importChanges || importChanges.length === 0) return;
  
  let content = readFileContent(filePath);
  if (!content) return;

  let modified = content;
  for (const change of importChanges) {
    const { fromPath, toPath } = change;
    // Simple regex replacement for import/require statements
    const importRegex = new RegExp(`(import\\s+.*from\\s+['"])${fromPath}(['"])`, 'g');
    const requireRegex = new RegExp(`(require\\(['"])${fromPath}(['"]\\))`, 'g');
    modified = modified.replace(importRegex, `$1${toPath}$2`);
    modified = modified.replace(requireRegex, `$1${toPath}$2`);
  }
  
  if (modified !== content) {
    writeFileContent(filePath, modified);
    console.log(`📝 Updated imports in: ${filePath}`);
  }
}

/**
 * Split a file into multiple parts
 * @param {string} filePath - Path to the original file
 * @param {Array<{content: string}>} parts - Array of part contents
 * @returns {Array<{original: string, part: string, index: number}>} Array of new file info
 */
function splitFile(filePath, parts) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);

  const newFiles = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const newFileName = `${baseName}_part${i + 1}${ext}`;
    const newPath = path.join(dir, newFileName);
    writeFileContent(newPath, part.content);
    newFiles.push({ original: filePath, part: newPath, index: i });
  }
  return newFiles;
}

module.exports = {
  readFileContent,
  writeFileContent,
  moveFile,
  deleteFile,
  getProjectFiles,
  updateImportsInFile,
  splitFile
};
