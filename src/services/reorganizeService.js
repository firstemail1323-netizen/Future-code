/**
 * Project Reorganization Service
 * Analyzes project structure and executes reorganization plan
 */

const fs = require('fs');
const { readFileContent, writeFileContent, moveFile, deleteFile, splitFile, getProjectFiles, updateImportsInFile } = require('../utils/fileUtils');
const { AIService } = require('./aiService');

class ReorganizeService {
  /**
   * Create a reorganization service instance
   * @param {AIService} aiService - AI service for analysis
   */
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Execute the full project reorganization
   */
  async reorganizeProject() {
    console.log('🔍 Scanning project directory...');
    const files = getProjectFiles('.');
    console.log(`📁 Found ${files.length} files.`);

    if (files.length === 0) {
      console.log('❌ No files found to organize.');
      return;
    }

    // Build the project structure string for AI
    const fileTree = files.join('\n');

    // Define the prompt for reorganization
    const systemPrompt = `You are an expert code architect and file organizer. 
You will receive a file list of a project. Your task is to analyze it and output a JSON plan. 
The JSON must have the following structure:
{
  "fileMoves": [{"from": "path/to/file.js", "to": "src/controllers/file.js"}],
  "importChanges": [{"file": "path/to/module.js", "fromPath": "../old/location", "toPath": "../new/location"}],
  "newFiles": [{"path": "src/utils/helper.js", "content": "// content of new file"}],
  "deletedFiles": ["path/to/dead/file.js"],
  "splitFiles": [{"file": "path/to/large.js", "parts": [{"name": "part1", "content": "code..."}, {"name": "part2", "content": "code..."}]}],
  "readme": "# Project Name\\n\\n## Structure\\n...",
  "packageChanges": {"dependencies": {"express": "^4.18.0"}, "scripts": {"start": "node index.js"}}
}
Do NOT use Markdown code fences in the JSON. Return ONLY valid JSON. 
Analyze the code structure deeply, propose a clean modular architecture (MVC, service layer, etc.), and split files if needed. 
For each move, update imports accordingly. Create new files if missing, delete dead code if safe. 
Generate a full README. Output only the JSON.`;

    const userPrompt = `Here is the list of files:\n${fileTree}\n\nOrganize this project completely.`;

    console.log('🤖 Sending to AI for analysis...');
    const response = await this.aiService.ask(userPrompt, systemPrompt);
    
    if (!response) {
      console.log('❌ AI analysis failed.');
      return;
    }

    // Parse JSON
    let plan;
    try {
      const start = response.indexOf('{');
      const end = response.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      const jsonString = response.substring(start, end + 1);
      plan = JSON.parse(jsonString);
    } catch (e) {
      console.log('❌ Could not parse AI response as JSON. Raw response:');
      console.log(response);
      return;
    }

    console.log('📋 AI Plan received. Executing...\n');

    // 1. Create new files
    if (plan.newFiles) {
      for (const file of plan.newFiles) {
        writeFileContent(file.path, file.content);
        console.log(`✅ Created: ${file.path}`);
      }
    }

    // 2. Move files
    if (plan.fileMoves) {
      for (const move of plan.fileMoves) {
        if (fs.existsSync(move.from)) {
          moveFile(move.from, move.to);
          console.log(`✅ Moved: ${move.from} → ${move.to}`);
        }
      }
    }

    // 3. Update imports (after moves, before split/deletes)
    if (plan.importChanges) {
      const importsByFile = {};
      for (const change of plan.importChanges) {
        if (!importsByFile[change.file]) importsByFile[change.file] = [];
        importsByFile[change.file].push(change);
      }
      for (const [filePath, changes] of Object.entries(importsByFile)) {
        updateImportsInFile(filePath, changes);
      }
    }

    // 4. Split files
    if (plan.splitFiles) {
      for (const split of plan.splitFiles) {
        if (fs.existsSync(split.file)) {
          splitFile(split.file, split.parts);
          console.log(`✅ Split: ${split.file} into ${split.parts.length} parts`);
        }
      }
    }

    // 5. Delete files (only if safe)
    if (plan.deletedFiles) {
      for (const del of plan.deletedFiles) {
        if (fs.existsSync(del)) {
          deleteFile(del);
          console.log(`🗑️ Deleted: ${del}`);
        }
      }
    }

    // 6. Write README
    if (plan.readme) {
      writeFileContent('README.md', plan.readme);
      console.log('📖 README.md created');
    }

    // 7. Update package.json if needed
    if (plan.packageChanges) {
      const pkgPath = 'package.json';
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileContent(pkgPath) || '{}');
        if (plan.packageChanges.dependencies) {
          pkg.dependencies = { ...pkg.dependencies, ...plan.packageChanges.dependencies };
        }
        if (plan.packageChanges.scripts) {
          pkg.scripts = { ...pkg.scripts, ...plan.packageChanges.scripts };
        }
        writeFileContent(pkgPath, JSON.stringify(pkg, null, 2));
        console.log('📦 Updated package.json');
      }
    }

    console.log('\n✅ All tasks completed! Project reorganized.');
  }
}

module.exports = { ReorganizeService };
