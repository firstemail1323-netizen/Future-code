require('dotenv').config();
const readline = require('readline');

const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter (Claude, GPT-4, Gemini, Llama)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3-5-sonnet',
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI (GPT-4o)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    requiresKey: true,
  },
  anthropic: {
    name: 'Anthropic (Claude 3.5 Sonnet)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20240620',
    requiresKey: true,
  },
  gemini: {
    name: 'Google Gemini (Gemini 1.5 Pro)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    requiresKey: true,
  },
  groq: {
    name: 'Groq (Llama 3 70B, Mixtral)',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama3-70b-8192',
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (Llama 3, Mistral, Phi) – Free & Local',
    endpoint: 'http://localhost:11434/api/chat',
    model: 'llama3',
    requiresKey: false,
  }
};

console.log('=== Future-code ===');
console.log('Choose a provider:');

const providerKeys = Object.keys(PROVIDERS);
providerKeys.forEach((key, idx) => {
  const p = PROVIDERS[key];
  console.log(`${idx + 1}. ${p.name} ${p.requiresKey ? '[API Key needed]' : '[No key needed]'}`);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let selectedProvider = null;
let selectedKey = null;

async function chooseProvider() {
  return new Promise((resolve) => {
    rl.question('Enter number (1-6): ', (answer) => {
      const idx = parseInt(answer) - 1;
      if (idx >= 0 && idx < providerKeys.length) {
        const key = providerKeys[idx];
        selectedProvider = PROVIDERS[key];
        console.log(`Selected: ${selectedProvider.name}`);
        resolve();
      } else {
        console.log('Invalid choice. Try again.');
        resolve(chooseProvider());
      }
    });
  });
}

async function getApiKey() {
  if (!selectedProvider.requiresKey) return null;
  const envKey = process.env[`${Object.keys(PROVIDERS).find(k => PROVIDERS[k] === selectedProvider)}_API_KEY`];
  if (!envKey) {
    console.log(`❌ Missing API key for ${selectedProvider.name}`);
    console.log(`Set environment variable: ${Object.keys(PROVIDERS).find(k => PROVIDERS[k] === selectedProvider)}_API_KEY`);
    process.exit(1);
  }
  return envKey;
}

async function askLLM(prompt) {
  const isOllama = selectedProvider.name.includes('Ollama');
  const isAnthropic = selectedProvider.name.includes('Anthropic');
  const isGemini = selectedProvider.name.includes('Gemini');
  const isOpenRouter = selectedProvider.name.includes('OpenRouter');
  const messages = [{ role: 'user', content: prompt }];

  try {
    let res;
    if (isOllama) {
      const ollama = require('ollama');
      const response = await ollama.chat({
        model: selectedProvider.model,
        messages: messages,
        stream: false
      });
      return response.message.content;
    } 
    else if (isAnthropic) {
      const fetch = require('node-fetch');
      res = await fetch(selectedProvider.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': selectedKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedProvider.model,
          max_tokens: 1024,
          messages: messages
        })
      });
      const data = await res.json();
      return data.content?.[0]?.text || 'Error: No response';
    }
    else if (isGemini) {
      const fetch = require('node-fetch');
      const url = `${selectedProvider.endpoint}?key=${selectedKey}`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Error: No response';
    }
    else {
      // OpenAI style (OpenRouter, OpenAI, Groq)
      const fetch = require('node-fetch');
      res = await fetch(selectedProvider.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${selectedKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedProvider.model,
          messages: messages,
          max_tokens: 1024
        })
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || 'Error: No response';
    }
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function main() {
  await chooseProvider();
  selectedKey = await getApiKey();

  console.log('\n🚀 Future-code is ready. Type "exit" to quit.\n');

  const chatLoop = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }
      const answer = await askLLM(input);
      console.log(`\n${selectedProvider.name}: ${answer}\n`);
      chatLoop();
    });
  };
  chatLoop();
}

if (!global.fetch) {
  global.fetch = require('node-fetch');
}

main();
