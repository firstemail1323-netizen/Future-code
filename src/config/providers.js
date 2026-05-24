/**
 * Provider configurations for AI API services
 * Each provider defines its own URL, model, headers, body format, and response parser
 */

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
      const formatted = messages.map(m => ({ 
        role: m.role === 'system' ? 'assistant' : m.role, 
        content: m.content 
      }));
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

module.exports = { PROVIDERS };
