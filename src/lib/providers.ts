export interface AIProvider {
  id: string;
  name: string;
  emoji: string;
  endpoint: string;
  headers: (key: string) => Record<string, string>;
  body: (msgs: Array<{ role: string; content: string }>) => string;
  parse: (data: any) => string;
  urlWithKey?: (url: string, key: string) => string;
  signupUrl?: string;
}

// Helper for OpenAI-compatible providers
function openaiCompatible(
  id: string, name: string, emoji: string,
  endpoint: string, model: string,
  opts?: { signupUrl?: string; jsonFormat?: boolean }
): AIProvider {
  return {
    id, name, emoji, endpoint,
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => {
      const body: any = { model, messages: msgs, temperature: 0.1 };
      if (opts?.jsonFormat !== false) body.response_format = { type: 'json_object' };
      return JSON.stringify(body);
    },
    parse: d => d.choices[0].message.content,
    signupUrl: opts?.signupUrl
  };
}

export const PROVIDERS: Record<string, AIProvider> = {
  groq: {
    ...openaiCompatible('groq', 'Groq', '🟢',
      'https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile',
      { signupUrl: 'https://console.groq.com' }),
  },
  openai: {
    ...openaiCompatible('openai', 'OpenAI', '🔵',
      'https://api.openai.com/v1/chat/completions', 'gpt-4o-mini',
      { signupUrl: 'https://platform.openai.com' }),
  },
  gemini: {
    id: 'gemini', name: 'Gemini', emoji: '🟡',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ contents: [{ parts: [{ text: msgs.map(m => m.content).join('\n') }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    parse: d => d.candidates[0].content.parts[0].text,
    urlWithKey: (url, k) => `${url}?key=${k}`,
    signupUrl: 'https://aistudio.google.com'
  },
  mistral: openaiCompatible('mistral', 'Mistral', '🔴',
    'https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest',
    { signupUrl: 'https://console.mistral.ai' }),
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
    parse: d => d.message?.content?.[0]?.text || d.text,
    signupUrl: 'https://dashboard.cohere.ai'
  },
  together: openaiCompatible('together', 'Together', '⚫',
    'https://api.together.xyz/v1/chat/completions', 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    { signupUrl: 'https://api.together.ai' }),
  deepseek: openaiCompatible('deepseek', 'DeepSeek', '🟤',
    'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat',
    { signupUrl: 'https://platform.deepseek.com' }),
  fireworks: openaiCompatible('fireworks', 'Fireworks', '🔥',
    'https://api.fireworks.ai/inference/v1/chat/completions', 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    { signupUrl: 'https://fireworks.ai' }),
  perplexity: openaiCompatible('perplexity', 'Perplexity', '📐',
    'https://api.perplexity.ai/chat/completions', 'llama-3.1-sonar-small-128k-online',
    { signupUrl: 'https://perplexity.ai', jsonFormat: false }),
  xai: openaiCompatible('xai', 'xAI', '✖️',
    'https://api.x.ai/v1/chat/completions', 'grok-3-mini',
    { signupUrl: 'https://console.x.ai' }),
  openrouter: openaiCompatible('openrouter', 'OpenRouter', '🌐',
    'https://openrouter.ai/api/v1/chat/completions', 'openai/gpt-4o-mini',
    { signupUrl: 'https://openrouter.ai' }),
  cerebras: openaiCompatible('cerebras', 'Cerebras', '🧠',
    'https://api.cerebras.ai/v1/chat/completions', 'llama-3.3-70b',
    { signupUrl: 'https://cloud.cerebras.ai' }),
  sambanova: openaiCompatible('sambanova', 'SambaNova', '⚡',
    'https://api.sambanova.ai/v1/chat/completions', 'Meta-Llama-3.3-70B-Instruct',
    { signupUrl: 'https://cloud.sambanova.ai' }),
  github: openaiCompatible('github', 'GitHub Models', '🐙',
    'https://models.inference.ai.azure.com/chat/completions', 'gpt-4o-mini',
    { signupUrl: 'https://github.com/marketplace/models' }),
  nvidia: {
    id: 'nvidia', name: 'NVIDIA NIM', emoji: '💚',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: 'meta/llama-3.3-70b-instruct', messages: msgs, temperature: 0.1 }),
    parse: d => d.choices[0].message.content,
    signupUrl: 'https://build.nvidia.com'
  },
  huggingface: openaiCompatible('huggingface', 'HuggingFace', '🤗',
    'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct/v1/chat/completions', 'meta-llama/Llama-3.3-70B-Instruct',
    { signupUrl: 'https://huggingface.co/settings/tokens', jsonFormat: false }),
  cloudflare: {
    id: 'cloudflare', name: 'Cloudflare AI', emoji: '☁️',
    endpoint: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',
    headers: k => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    body: msgs => JSON.stringify({ model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', messages: msgs, temperature: 0.1 }),
    parse: d => d.choices?.[0]?.message?.content || d.result?.response,
    signupUrl: 'https://ai.cloudflare.com'
  },
  deepinfra: openaiCompatible('deepinfra', 'DeepInfra', '🔮',
    'https://api.deepinfra.com/v1/openai/chat/completions', 'meta-llama/Llama-3.3-70B-Instruct',
    { signupUrl: 'https://deepinfra.com' }),
  siliconflow: openaiCompatible('siliconflow', 'SiliconFlow', '🌊',
    'https://api.siliconflow.cn/v1/chat/completions', 'Qwen/Qwen2.5-72B-Instruct',
    { signupUrl: 'https://cloud.siliconflow.cn' }),
  novita: openaiCompatible('novita', 'Novita AI', '🆕',
    'https://api.novita.ai/v3/openai/chat/completions', 'meta-llama/llama-3.3-70b-instruct',
    { signupUrl: 'https://novita.ai' }),
  kluster: openaiCompatible('kluster', 'Kluster AI', '🏗️',
    'https://api.kluster.ai/v1/chat/completions', 'klusterai/Meta-Llama-3.3-70B-Instruct-Turbo',
    { signupUrl: 'https://kluster.ai' }),
};

// Test a single API key for a provider - returns status
export async function testProviderKey(
  provider: AIProvider,
  key: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    let url = provider.endpoint;
    if (provider.urlWithKey) url = provider.urlWithKey(url, key);
    const msgs = [
      { role: 'system', content: 'Respond with valid JSON only.' },
      { role: 'user', content: 'Return {"status":"ok"}' }
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: provider.headers(key),
      body: provider.body(msgs),
      signal
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${text.substring(0, 80)}` };
    }
    const data = await res.json();
    provider.parse(data); // verify parse works
    return { ok: true, latencyMs };
  } catch (e: any) {
    return { ok: false, latencyMs: Math.round(performance.now() - start), error: e.message };
  }
}
