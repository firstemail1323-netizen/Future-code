const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ======================= הגדרות =======================
const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3-5-sonnet-20240620',
    requiresKey: true,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://future-code.local',
      'X-Title': 'Future-Code-Agent'
    }),
    body: (model, messages) => JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 8192,
      temperature: 0.1
    }),
    parse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    requiresKey: true,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    body: (model, messages) => JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 8192,
      temperature: 0.1
    }),
    parse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  },
  anthropic: {
    name: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20240620',
    requiresKey: true,
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }),
    body: (model, messages) => {
      const formatted = messages.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }));
      return JSON.stringify({
        model: model,
        max_tokens: 8192,
        messages: formatted
      });
    },
    parse: (data) => data?.content?.[0]?.text || 'Error'
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    model: null,
    requiresKey: true,
    headers: (key) => ({ 'Content-Type': 'application/json' }),
    body: (model, messages) => {
      const prompt = messages[messages.length - 1].content;
      return JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      });
    },
    parse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Error',
    getUrl: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama3-70b-8192',
    requiresKey: true,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    body: (model, messages) => JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 8192,
      temperature: 0.1
    }),
    parse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  }
};

// ======================= שליפת API Key =======================
const providerKeys = Object.keys(PROVIDERS);
let selectedProvider = null;
let apiKey = null;

function chooseProviderFromEnv() {
  for (const key of providerKeys) {
    const envKey = process.env[`${key.toUpperCase()}_API_KEY`];
    if (envKey && envKey.length > 10) {
      selectedProvider = PROVIDERS[key];
      apiKey = envKey;
      console.log(`🔑 Found API Key for: ${selectedProvider.name}`);
      return true;
    }
  }
  return false;
}

// ======================= כלי עזר =======================
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

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

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    console.error(`❌ Delete failed ${filePath}: ${e.message}`);
    return false;
  }
}

function getProjectFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip node_modules, .git, .env, etc.
      if (file === 'node_modules' || file === '.git' || file === '.env' || file === 'dist' || file === 'build') continue;
      results = results.concat(getProjectFiles(fullPath, baseDir));
    } else {
      // Ignore binary files, .gitignore, etc.
      if (file === '.gitignore' || file === '.env' || file === 'package-lock.json' || file === 'yarn.lock') continue;
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}

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

// ======================= תקשורת עם AI =======================
async function askAI(prompt, systemPrompt = '') {
  if (!selectedProvider) {
    console.error('❌ No AI provider selected (missing API key).');
    return null;
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const url = selectedProvider.name === 'Google Gemini' 
    ? selectedProvider.getUrl(apiKey) 
    : selectedProvider.url;

  const body = selectedProvider.body(selectedProvider.model, messages);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: selectedProvider.headers(apiKey),
      body: body
    });

    const data = await res.json();
    return selectedProvider.parse(data);
  } catch (err) {
    console.error(`❌ AI request failed: ${err.message}`);
    return null;
  }
}

// ======================= פונקציית הסידור האוטונומית =======================
async function reorganizeProject() {
  console.log('🔍 Scanning project directory...');
  const files = getProjectFiles('.');
  console.log(`📁 Found ${files.length} files.`);

  if (files.length === 0) {
    console.log('❌ No files found to organize.');
    return;
  }

  // Build the project structure string for AI
  const fileTree = files.join('\n');

  // הגדרת הפרומפט לסידור
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
  const response = await askAI(userPrompt, systemPrompt);
  
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

// ======================= main =======================
async function main() {
  // 1. טיפול ב-Environment Variables
  if (!chooseProviderFromEnv()) {
    console.log('❌ No valid API keys found in environment variables.');
    console.log('Add one of: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY');
    process.exit(1);
  }

  // 2. בקשת אישור למשתמש
  console.log(`🚀 Future-Code AGENT (using ${selectedProvider.name}) is about to reorganize your project.`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Proceed? (y/n): ', (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      rl.close();
      process.exit(0);
    }
    rl.close();
    reorganizeProject();
  });
}

// הפעלה
main();
