const https = require('https');
const readline = require('readline');

const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter (Claude, GPT-4, Gemini)',
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    model: 'anthropic/claude-3-5-sonnet',
    requiresKey: true,
    buildBody: (model, messages, key) => ({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1024
      })
    }),
    parseResponse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  },
  openai: {
    name: 'OpenAI (GPT-4o)',
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    model: 'gpt-4o',
    requiresKey: true,
    buildBody: (model, messages, key) => ({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1024
      })
    }),
    parseResponse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  },
  anthropic: {
    name: 'Anthropic (Claude 3.5 Sonnet)',
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    model: 'claude-3-5-sonnet-20240620',
    requiresKey: true,
    buildBody: (model, messages, key) => ({
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        messages: messages
      })
    }),
    parseResponse: (data) => data?.content?.[0]?.text || 'Error'
  },
  gemini: {
    name: 'Google Gemini (Gemini 1.5 Pro)',
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models/gemini-1.5-pro:generateContent',
    model: null,
    requiresKey: true,
    buildBody: (model, messages, key) => ({
      method: 'POST',
      path: `/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: messages[messages.length - 1].content }] }]
      })
    }),
    parseResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Error'
  },
  groq: {
    name: 'Groq (Llama 3 70B)',
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    model: 'llama3-70b-8192',
    requiresKey: true,
    buildBody: (model, messages, key) => ({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1024
      })
    }),
    parseResponse: (data) => data?.choices?.[0]?.message?.content || 'Error'
  }
};

console.log('=== Future-code (Pure Node.js - No Dependencies) ===');
console.log('Choose a provider:');

const providerKeys = Object.keys(PROVIDERS);
providerKeys.forEach((key, idx) => {
  const p = PROVIDERS[key];
  console.log(`${idx + 1}. ${p.name} ${p.requiresKey ? '[Key required]' : '[No key]'}`);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let selected = null;
let selectedKey = null;

function chooseProvider() {
  return new Promise((resolve) => {
    rl.question('Enter number (1-5): ', (answer) => {
      const idx = parseInt(answer) - 1;
      if (idx >= 0 && idx < providerKeys.length) {
        const key = providerKeys[idx];
        selected = PROVIDERS[key];
        console.log(`Selected: ${selected.name}`);
        resolve();
      } else {
        console.log('Invalid choice. Try again.');
        resolve(chooseProvider());
      }
    });
  });
}

function getKey() {
  if (!selected.requiresKey) return null;
  const envVar = providerKeys.find(k => PROVIDERS[k] === selected);
  const key = process.env[`${envVar.toUpperCase()}_API_KEY`];
  if (!key) {
    console.log(`❌ Missing API key for ${selected.name}`);
    console.log(`Set environment variable: ${envVar.toUpperCase()}_API_KEY`);
    process.exit(1);
  }
  return key;
}

function askLLM(prompt) {
  return new Promise((resolve) => {
    const messages = [{ role: 'user', content: prompt }];
    const bodyData = selected.buildBody(selected.model, messages, selectedKey);
    
    let options = {
      hostname: selected.hostname,
      path: bodyData.path || selected.path,
      method: 'POST',
      headers: bodyData.headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = selected.parseResponse(parsed);
          resolve(content);
        } catch (e) {
          resolve(`Error parsing response: ${e.message}`);
        }
      });
    });

    req.on('error', (e) => {
      resolve(`Error: ${e.message}`);
    });

    req.write(bodyData.body);
    req.end();
  });
}

async function main() {
  await chooseProvider();
  selectedKey = getKey();

  console.log('\n🚀 Future-code is ready. Type "exit" to quit.\n');

  const loop = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }
      const answer = await askLLM(input);
      console.log(`\n${selected.name}: ${answer}\n`);
      loop();
    });
  };
  loop();
}

main();
