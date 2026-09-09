'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3040);
const API_URL = 'https://api.cerebras.ai/v1/chat/completions';

function readEnv(name) {
  try {
    const txt = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const m = txt.match(new RegExp('^(?:export\\s+)?' + name + '\\s*=\\s*(.+)$', 'm'));
    return m ? m[1].trim() : undefined;
  } catch (e) {
    return undefined;
  }
}

const KEY = process.env.CEREBRAS_API_KEY || readEnv('CEREBRAS_API_KEY');
const MODEL = process.env.CEREBRAS_MODEL || readEnv('CEREBRAS_MODEL') || 'qwen-3.8-27b';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

function serveStatic(urlPath, res) {
  let file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  file = path.normalize(file).replace(/^\.\.(\/|$)/, '');
  const full = path.join(__dirname, 'public', file);
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function chatCompletion(messages) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 2048,
      messages: messages,
    }),
  });

  let data = null;
  try { data = await resp.json(); } catch (e) {}

  if (!resp.ok) {
    const msg = data && data.error && (data.error.message || JSON.stringify(data.error));
    throw new Error(msg || ('Cerebras API error ' + resp.status));
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof content !== 'string') throw new Error('Empty response from Cerebras');
  return content;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    serveStatic(new URL(req.url, 'http://x').pathname, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/chat')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad JSON' }));
      return;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : null;
    if (!messages) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'messages[] required' }));
      return;
    }

    try {
      const text = await chatCompletion(messages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply: text, model: MODEL }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err && err.message || err) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('chudai-draft running at http://localhost:' + PORT + '  model=' + MODEL + '  key=' + (KEY ? 'set' : 'MISSING'));
});