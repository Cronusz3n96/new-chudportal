const LLAMA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_HISTORY = 20;

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
        messages = messages.slice(-MAX_HISTORY);
        const res = await env.AI.run(LLAMA_MODEL, { messages });
        const reply = (typeof res === 'string') ? res : (res && res.response) || '';
        if (!reply) {
          return json({ error: 'Empty response from model' }, 502);
        }
        return json({ reply, model: LLAMA_MODEL });
      } catch (err) {
        return json({ error: String(err && err.message || err) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};