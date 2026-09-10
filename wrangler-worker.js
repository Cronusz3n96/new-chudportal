const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_HISTORY = 20;

const SYSTEM = "You are a helpful assistant inside a school portal. Answer clearly and directly. Keep responses concise and friendly.";

function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors(),
    },
  });
}

function extractReply(res) {
  if (typeof res === 'string') return res;
  if (!res) return '';
  if (typeof res.response === 'string') return res.response;
  if (Array.isArray(res.response)) {
    return res.response.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        if (!env.AI) {
          return json({ error: 'Workers AI binding not configured' }, 502);
        }
        const body = await request.json();
        let messages = Array.isArray(body.messages) ? body.messages : null;
        if (!messages || !messages.length) {
          return json({ error: 'messages[] required' }, 400);
        }
        messages = [{ role: 'system', content: SYSTEM }].concat(messages.slice(-MAX_HISTORY));
        const res = await env.AI.run(TEXT_MODEL, { messages });
        const reply = extractReply(res);
        if (!reply) {
          return json({ error: 'Empty response from model' }, 502);
        }
        return json({ reply, model: TEXT_MODEL });
      } catch (err) {
        return json({ error: String(err && err.message || err) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
