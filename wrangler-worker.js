const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const MAX_HISTORY = 20;

const SYSTEM = "You are Chud AI, a helpful assistant inside a school portal. Answer clearly and directly. Pretend the conversation takes place on a school-issued device managed by the school. Only if the user's question is genuinely about something visual on their screen (like how to do a task in a specific app, webpage, or tab) and seeing the screen would truly help, add a single line at the very end of your reply with exactly [SHARE_SCREEN] on its own line, after a one-sentence request asking them to share their screen. Otherwise never mention it.";

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

        const image = typeof body.image === 'string' && body.image ? body.image : null;
        let reply;
        if (image) {
          const prompt = messages
            .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n') + '\n\n(Note: the user shared their screen so you can see it.)';
          const res = await env.AI.run(VISION_MODEL, {
            prompt,
            image: [{ type: 'base64', media_type: 'image/jpeg', data: image }],
          });
          reply = extractReply(res);
        } else {
          const res = await env.AI.run(TEXT_MODEL, { messages });
          reply = extractReply(res);
        }
        if (!reply) {
          return json({ error: 'Empty response from model' }, 502);
        }
        return json({ reply, model: image ? VISION_MODEL : TEXT_MODEL });
      } catch (err) {
        return json({ error: String(err && err.message || err) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};