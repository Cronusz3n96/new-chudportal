import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4777;
const WORKER = process.env.WORKER || 'https://igtrackerforall.merrittjake65.workers.dev';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const APP_ID = '936619743392459';

const COOKIE_FILE = path.join(__dirname, 'cookie.txt');
const HISTORY_DIR = path.join(__dirname, 'history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

function loadCookie() {
  try { return fs.readFileSync(COOKIE_FILE, 'utf8').trim(); } catch (e) {}
  return process.env.IG_COOKIE || '';
}
function saveCookie(c) { fs.writeFileSync(COOKIE_FILE, c); }

function getHistory(username) {
  try { return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, username + '.json'), 'utf8')); } catch (e) { return []; }
}
function putHistory(username, h) { fs.writeFileSync(path.join(HISTORY_DIR, username + '.json'), JSON.stringify(h)); }

function json(o) {
  return { statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }, body: JSON.stringify(o) };
}

async function igJson(url, headers) {
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    return { ok: false, status: 0, msg: 'network error' };
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}
  if (res.status !== 200 || !parsed) return { ok: false, status: res.status, msg: parsed ? (parsed.message || parsed.error_type || parsed.status) : text.slice(0, 200) };
  return { ok: true, json: parsed };
}

function recentOf(arr) {
  return (arr || []).map(e => e && (e.node || e) ? { username: (e.node || e).username, fullName: (e.node || e).full_name, profilePic: (e.node || e).profile_pic_url } : null).filter(Boolean);
}

async function getProfile(username) {
  const cookie = loadCookie();
  const headers = {
    'user-agent': UA,
    'x-ig-app-id': APP_ID,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'referer': 'https://www.instagram.com/' + username + '/',
  };
  if (cookie) headers['cookie'] = cookie;

  let raw = null;
  let lastErr = null;
  for (const host of ['https://www.instagram.com', 'https://i.instagram.com']) {
    const r = await igJson(host + '/api/v1/users/web_profile_info/?username=' + username, headers);
    lastErr = { status: r.status, host };
    if (r.ok && r.json.data && r.json.data.user) { raw = r.json.data.user; break; }
    lastErr.msg = r.msg;
  }

  if (!raw) {
    return json({ ok: false, error: 'Could not fetch profile. Instagram HTTP ' + lastErr.status + (lastErr.msg ? ' - "' + lastErr.msg + '"' : '') + (cookie ? '' : ' (no cookie found - create cookie.txt next to this file, or set IG_COOKIE).') });
  }

  const user = {
    id: raw.id || null,
    username: raw.username,
    fullName: raw.full_name || raw.username,
    bio: raw.biography || null,
    profilePic: raw.profile_pic_url_hd || raw.profile_pic_url || null,
    isPrivate: !!raw.is_private,
    isVerified: !!raw.is_verified,
  };

  const followedBy = raw.edge_followed_by || {};
  const following = raw.edge_follow || {};
  const media = raw.edge_owner_to_timeline_media || {};
  const postCount = media.count || 0;

  let followersRecent = recentOf(followedBy.edges);
  let followingRecent = recentOf(following.edges);

  if (cookie) {
    const uid = user.id;
    const f = await igJson('https://www.instagram.com/api/v1/friendships/' + uid + '/followers/?count=12&search_surface=follow_list_page', headers);
    if (f.ok && f.json.users && f.json.users.length) followersRecent = recentOf(f.json.users.map(u => ({ node: u })));
    const g = await igJson('https://www.instagram.com/api/v1/friendships/' + uid + '/following/?count=12&search_surface=follow_list_page', headers);
    if (g.ok && g.json.users && g.json.users.length) followingRecent = recentOf(g.json.users.map(u => ({ node: u })));
  }

  const now = Date.now();
  const history = getHistory(username);
  history.push({ t: now, f: followedBy.count || 0, g: following.count || 0 });
  if (history.length > 120) history.splice(0, history.length - 120);
  putHistory(username, history);

  const prev = history.length > 1 ? history[history.length - 2] : null;
  let lastCheckText = 'No previous snapshot.';
  if (prev) {
    const diff = (followedBy.count || 0) - prev.f;
    lastCheckText = diff > 0 ? ('+' + diff + ' followers since ' + new Date(prev.t).toLocaleString())
      : diff < 0 ? (diff + ' followers since ' + new Date(prev.t).toLocaleString())
      : ('no change since ' + new Date(prev.t).toLocaleString());
  }

  return json({
    ok: true,
    user,
    postCount,
    recentFollowingCount: following.count || 0,
    recentFollowedByCount: followedBy.count || 0,
    followersRecent,
    followingRecent,
    history,
    delta: { followedBy: prev ? (followedBy.count || 0) - prev.f : 0, following: prev ? (following.count || 0) - prev.g : 0 },
    lastCheckText,
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => resolve(d));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/profile') {
      const username = (url.searchParams.get('u') || '').trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(username)) return send(res, json({ ok: false, error: 'Invalid username.' }));
      const out = await getProfile(username);
      return send(res, out);
    }

    if (url.pathname === '/api/session') {
      if (req.method === 'POST') {
        const b = JSON.parse(await readBody(req));
        const val = String(b.cookie || b.sessionid || '').trim().replace(/^["']|["']$/g, '');
        if (val) saveCookie(val);
        return send(res, json({ ok: !!val }));
      }
      return send(res, json({ on: !!loadCookie() }));
    }

    const wres = await fetch(WORKER + '/');
    let html = await wres.text();
    html = html.replace('placeholder="&', 'placeholder="&');
    html = html.replace('</header>',
      '<div style="max-width:440px;margin:10px auto 0;padding:8px 12px;border-radius:8px;background:#14271f;border:1px solid #1e3a2c;color:#7ef0b0;font-size:.78rem;text-align:left">' +
      '&#9654; CONNECTED VIA LOCAL RELAY (' + url.host + ') &mdash; requests go out from your own network/IP so Instagram does not block them.</div>' +
      '</header>');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Relay error: ' + e.message }));
  }
});

function send(res, o) {
  res.writeHead(o.statusCode || 200, o.headers);
  res.end(o.body);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('IGTrackerForAll local relay running at http://127.0.0.1:' + PORT);
  const c = loadCookie();
  console.log(c ? 'cookie.txt found (using your Instagram session)' : 'NOTE: no cookie.txt yet. Create cookie.txt in this folder (paste your full instagram cookie) or run with IG_COOKIE env var.');
});