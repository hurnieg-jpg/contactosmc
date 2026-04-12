export interface AIProvider {
  id: string;
  name: string;
  emoji: string;
  endpoint: string;
  headers: (key: string) => Record<string, string>;
  body: (msgs: Array<{ role: string; content: string }>) => string;
  parse: (data: any) => string;
  urlWithKey?: (url: string, key: string) => string;
}

export const PROVIDERS: Record<string, AIProvider> = {
  groq: {
    id: 'groq', name: 'Groq', emoji: '🟢',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  openai: {
    id: 'openai', name: 'OpenAI', emoji: '🔵',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'gpt-4o-mini', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  // Claude omitido: CORS bloquea llamadas directas desde el navegador
  gemini: {
    id: 'gemini', name: 'Gemini', emoji: '🟡',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ contents: [{ parts: [{ text: msgs.map(m => m.content).join('\n') }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    parse: d => d.candidates[0].content.parts[0].text,
    urlWithKey: (url, k) => `${url}?key=${k}`
  },
  mistral: {
    id: 'mistral', name: 'Mistral', emoji: '🔴',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'mistral-small-latest', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  cohere: {
    id: 'cohere', name: 'Cohere', emoji: '🟣',
    endpoint: 'https://api.cohere.ai/v2/chat',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => {
      const system = msgs.find(m => m.role === 'system')?.content;
      const userMsgs = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      if (userMsgs.length === 0) userMsgs.push({ role: 'user', content: system || 'respond with {}' });
      const body: any = { model: 'command-r-plus-08-2024', messages: userMsgs, temperature: 0.1, response_format: { type: 'json_object' } };
      if (system && userMsgs[0].content !== system) body.preamble = system;
      return JSON.stringify(body);
    },
    parse: d => d.message?.content?.[0]?.text || d.text
  },
  together: {
    id: 'together', name: 'Together', emoji: '⚫',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  deepseek: {
    id: 'deepseek', name: 'DeepSeek', emoji: '🟤',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'deepseek-chat', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  fireworks: {
    id: 'fireworks', name: 'Fireworks', emoji: '🔥',
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  perplexity: {
    id: 'perplexity', name: 'Perplexity', emoji: '📐',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'llama-3.1-sonar-small-128k-online', messages: msgs, temperature: 0.1 }),
    parse: d => d.choices[0].message.content
  },
  xai: {
    id: 'xai', name: 'xAI', emoji: '❌',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'grok-3-mini', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  },
  openrouter: {
    id: 'openrouter', name: 'OpenRouter', emoji: '🌐',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'openai/gpt-4o-mini', messages: msgs, temperature: 0.1, response_format: { type: 'json_object' } }),
    parse: d => d.choices[0].message.content
  }
};
