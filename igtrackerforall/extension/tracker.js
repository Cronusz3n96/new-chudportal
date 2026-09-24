const HOSTS = ['https://www.instagram.com', 'https://i.instagram.com'];
const APP_ID = '936619743392459';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const LOGIN_STORAGE = 'tracker-logins';

const $ = id => document.getElementById(id);
const out = $('out');

async function igFetch(url) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'user-agent': UA,
      'x-ig-app-id': APP_ID,
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'x-requested-with': 'XMLHttpRequest',
      'referer': 'https://www.instagram.com/'
    }
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  return { status: res.status, data, text };
}

async function webProfile(username) {
  let last = null;
  for (const host of HOSTS) {
    const r = await igFetch(host + '/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username));
    last = r;
    if (r.status === 200 && r.data && r.data.data && r.data.data.user) {
      return { ok: true, user: r.data.data.user };
    }
    await new Promise(r2 => setTimeout(r2, 700));
  }
  return { ok: false, status: last.status, msg: last.data && (last.data.message || last.data.error_type) || null };
}

async function recentList(userId, kind) {
  const endpoint = kind === 'following'
    ? '/api/v1/friendships/' + userId + '/following/?count=20&search_surface=follow_list_page'
    : '/api/v1/friendships/' + userId + '/followers/?count=20&search_surface=follow_list_page';
  const r = await igFetch('https://www.instagram.com' + endpoint);
  if (r.status === 200 && r.data && Array.isArray(r.data.users)) {
    return r.data.users.map(u => ({
      username: u.username,
      fullName: u.full_name,
      profilePic: u.profile_pic_url,
      isVerified: !!u.is_verified
    }));
  }
  return [];
}

function normPerson(p) {
  return {
    username: p.username,
    fullName: p.full_name || p.username,
    profilePic: p.profile_pic_url_hd || p.profile_pic_url
  };
}

function recentOf(arr) {
  return (arr || []).map(e => e && e.node ? normPerson(e.node) : null).filter(Boolean);
}

async function getHistory(username) {
  const obj = await chrome.storage.local.get(LOGIN_STORAGE);
  const map = obj[LOGIN_STORAGE] || {};
  return map[username] || [];
}
async function putHistory(username, history) {
  const obj = await chrome.storage.local.get(LOGIN_STORAGE);
  const map = obj[LOGIN_STORAGE] || {};
  map[username] = history;
  await chrome.storage.local.set({ [LOGIN_STORAGE]: map });
}

function fmt(n) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
}
function deltaText(d) {
  if (d === 0) return '<span class="delta same">0</span>';
  return d > 0 ? '<span class="delta up">+' + d + '</span>' : '<span class="delta down">' + d + '</span>';
}
function igerr(el) { el.style.visibility = 'hidden'; }
function person(p, fresh) {
  return '<div class="person' + (fresh ? ' new' : '') + '"><img src="' + (p.profilePic || '') + '" onerror="igerr(this)"><div class="u">@' + p.username + '</div><div class="n">' + (p.fullName || '') + '</div></div>';
}
function spark(points) {
  const vals = points.map(p => p.f);
  if (vals.length < 1) return '';
  const w = 600, h = 60, pad = 6;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const step = w / (vals.length - 1 || 1);
  const pts = vals.map((v, i) => (i * step + pad).toFixed(1) + ',' + (h - pad - (v - min) / range * (h - 2 * pad)).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="#dc2743" stroke-width="2"/></svg>';
}

async function track(username) {
  username = username.trim().replace(/^@/, '');
  if (!/^[a-z0-9._]{1,30}$/i.test(username)) { $('status').textContent = 'Invalid username.'; return; }
  const btn = $('go'); btn.disabled = true;
  $('status').textContent = 'Fetching ' + username + ' ...';
  try {
    const r = await webProfile(username);
    if (!r.ok) {
      const msg = r.status === 401 || r.status === 400
        ? ('Instagram rejected the request (HTTP ' + r.status + (r.msg ? ' - "' + r.msg + '"' : '') + '). Make sure you are logged in to instagram.com in this browser.')
        : ('Could not fetch profile (HTTP ' + r.status + (r.msg ? ' - "' + r.msg + '"' : '') + '). Try again in a moment.');
      $('status').textContent = msg;
      return;
    }
    await render(r.user, username);
    $('status').textContent = 'Loaded.';
  } catch (e) {
    $('status').textContent = 'Request failed: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

async function render(raw, username) {
  const followedBy = raw.edge_followed_by || {};
  const following = raw.edge_follow || {};
  const media = raw.edge_owner_to_timeline_media || {};
  const postCount = media.count || 0;

  const followers = recentOf(followedBy.edges);
  const follows = recentOf(following.edges);
  let listFollowers = followers;
  let listFollows = follows;

  try {
    const userId = raw.id;
    if (userId) {
      listFollowers = await recentList(userId, 'followers');
      listFollows = await recentList(userId, 'following');
    }
  } catch (e) {}

  const followersAll = listFollowers.length ? listFollowers : followers;
  const followsAll = listFollows.length ? listFollows : follows;

  const history = await getHistory(username);
  const now = Date.now();
  const snap = { t: now, f: followedBy.count || 0, g: following.count || 0, fr: followersAll.map(p => p.username), gr: followsAll.map(p => p.username) };
  history.push(snap);
  if (history.length > 200) history.splice(0, history.length - 200);
  await putHistory(username, history);

  const prev = history.length > 1 ? history[history.length - 2] : null;
  let lastCheckText = 'No previous snapshot.';
  if (prev) {
    const diff = (followedBy.count || 0) - prev.f;
    lastCheckText = diff > 0 ? ('+' + diff + ' followers since ' + new Date(prev.t).toLocaleString())
      : diff < 0 ? (diff + ' followers since ' + new Date(prev.t).toLocaleString())
      : ('no change since ' + new Date(prev.t).toLocaleString());
  }

  const isNewFollower = {};
  const isNewFollow = {};
  if (prev) {
    const prevF = new Set(prev.fr || []);
    const prevG = new Set(prev.gr || []);
    followersAll.forEach(p => { if (!prevF.has(p.username)) isNewFollower[p.username] = true; });
    followsAll.forEach(p => { if (!prevG.has(p.username)) isNewFollow[p.username] = true; });
  }

  const u = {
    username: raw.username,
    fullName: raw.full_name || raw.username,
    bio: raw.biography || null,
    profilePic: raw.profile_pic_url_hd || raw.profile_pic_url || null,
    isPrivate: !!raw.is_private,
    isVerified: !!raw.is_verified
  };

  out.innerHTML = '';
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML =
    '<div class="profile"><img class="avatar" src="' + (u.profilePic || '') + '" onerror="igerr(this)">' +
    '<div><div class="pname">' + u.fullName + ' ' + (u.isVerified ? '<span class="verified">&#10003;</span>' : '') + (u.isPrivate ? '<span class="private">&#128274; private</span>' : '') + '</div>' +
    '<div class="uname">@' + u.username + '</div>' +
    (u.bio ? '<div class="bio">' + u.bio.replace(/</g, '&lt;') + '</div>' : '') +
    '<div class="stats">' +
    '<div class="stat"><b>' + fmt(following.count || 0) + '</b><span>following</span></div>' +
    '<div class="stat"><b>' + fmt(followedBy.count || 0) + '</b><span>followers ' + deltaText(prev ? (followedBy.count || 0) - prev.f : 0) + '</span></div>' +
    '<div class="stat"><b>' + fmt(postCount) + '</b><span>posts</span></div>' +
    '</div></div></div>' +
    (history.length > 1 ? '<div class="chart"><h2>Follower history</h2>' + spark(history) + '<div style="color:#777;font-size:.72rem;margin-top:4px">' + lastCheckText + '</div></div>' : '') +
    '<h2>Most recent followers</h2>' +
    (followersAll.length ? '<div class="grid">' + followersAll.map(p => person(p, isNewFollower[p.username])).join('') + '</div>' : '<div class="none">No followers visible.</div>') +
    (Object.keys(isNewFollower).length ? '<div style="color:#3ddc84;font-size:.75rem;margin-top:8px">' + Object.keys(isNewFollower).length + ' new follower' + (Object.keys(isNewFollower).length > 1 ? 's' : '') + ' since last check</div>' : '') +
    '<h2>Most recent follows</h2>' +
    (followsAll.length ? '<div class="grid">' + followsAll.map(p => person(p, isNewFollow[p.username])).join('') + '</div>' : '<div class="none">No follows visible.</div>') +
    (Object.keys(isNewFollow).length ? '<div style="color:#3ddc84;font-size:.75rem;margin-top:8px">' + Object.keys(isNewFollow).length + ' new follow' + (Object.keys(isNewFollow).length > 1 ? 's' : '') + ' since last check</div>' : '');
  out.appendChild(card);
}

$('go').onclick = () => track($('u').value);
$('u').addEventListener('keydown', e => { if (e.key === 'Enter') track($('u').value); });

const qs = new URLSearchParams(location.search);
if (qs.get('u')) { $('u').value = qs.get('u'); track(qs.get('u')); }