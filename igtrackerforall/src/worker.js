const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const APP_ID = '936619743392459';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IGTrackerForAll - Track Recent Instagram Follows & Followers</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',system-ui,sans-serif; }
  body { background:#0a0a0f; color:#eee; min-height:100vh; }
  .wrap { max-width:900px; margin:0 auto; padding:24px 16px 60px; }
  header { text-align:center; padding:36px 0 24px; }
  header h1 { font-size:1.7rem; background:linear-gradient(90deg,#f09433,#e6683c,#dc2743,#bc1888); -webkit-background-clip:text; background-clip:text; color:transparent; }
  header p { color:#888; margin-top:6px; font-size:.85rem; }
  .search { display:flex; gap:8px; max-width:440px; margin:0 auto; }
  .search input { flex:1; padding:13px 16px; border-radius:10px; border:1px solid #222; background:#14141c; color:#eee; font-size:1rem; outline:none; }
  .search input:focus { border-color:#e6683c; }
  .search button { padding:13px 22px; border:none; border-radius:10px; background:linear-gradient(90deg,#dc2743,#bc1888); color:#fff; font-weight:700; cursor:pointer; }
  .search button:disabled { opacity:.5; cursor:wait; }
  .status { text-align:center; color:#e6683c; font-size:.85rem; margin-top:14px; min-height:20px; }
  .sessionbar { max-width:440px; margin:18px auto 0; background:#14141c; border:1px solid #222; border-radius:10px; padding:10px 14px; font-size:.78rem; color:#999; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sessionbar button { background:#1e1e28; border:1px solid #333; color:#ddd; border-radius:6px; padding:5px 10px; cursor:pointer; font-size:.75rem; }
  .card { background:#12121a; border:1px solid #1e1e28; border-radius:16px; padding:22px; margin-top:22px; }
  .profile { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .avatar { width:84px; height:84px; border-radius:50%; border:3px solid #dc2743; object-fit:cover; background:#1e1e28; }
  .pname { font-size:1.25rem; font-weight:700; display:flex; align-items:center; gap:6px; }
  .uname { color:#999; font-size:.9rem; margin-top:2px; }
  .bio { color:#bbb; margin-top:8px; font-size:.88rem; line-height:1.4; }
  .verified { color:#4797d7; font-size:1rem; }
  .stats { display:flex; gap:34px; margin-top:18px; flex-wrap:wrap; }
  .stat b { font-size:1.3rem; display:block; }
  .stat span { color:#888; font-size:.75rem; text-transform:uppercase; letter-spacing:1px; }
  .delta { font-size:.8rem; margin-left:6px; font-weight:700; }
  .up { color:#3ddc84; } .down { color:#ff5470; } .same { color:#777; }
  .chart { margin-top:22px; }
  .chart svg { width:100%; height:70px; }
  h2 { font-size:1rem; margin:26px 0 12px; color:#ddd; text-transform:uppercase; letter-spacing:1px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; }
  .person { background:#16161f; border:1px solid #23232f; border-radius:10px; padding:10px; text-align:center; }
  .person img { width:52px; height:52px; border-radius:50%; object-fit:cover; margin-bottom:6px; }
  .person .u { font-size:.82rem; color:#e6683c; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .person .n { font-size:.7rem; color:#777; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .none { color:#666; font-size:.85rem; }
  .private { color:#ffb020; font-size:.9rem; }
  footer { text-align:center; color:#555; font-size:.75rem; margin-top:40px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>IGTrackerForAll</h1>
    <p>Search any public Instagram username to see their recent followers, recent follows, and follower growth over time.</p>
  </header>
  <div class="search">
    <input id="u" type="text" placeholder="@username (e.g. jamielifestyle_)" spellcheck="false">
    <button id="go">Track</button>
  </div>
  <div class="sessionbar">
    <span id="ss">No session &#8212; Instagram may block requests.</span>
    <button id="sets">Set sessionid</button>
    <button id="clears">Clear</button>
  </div>
  <div class="status" id="status"></div>
  <div id="out"></div>
  <footer>IGTrackerForAll &mdash; not affiliated with Meta / Instagram.</footer>
</div>
<script>
const $ = id => document.getElementById(id);
const out = $('out');

async function sessionStatus(){
  const r = await fetch('/api/session');
  const j = await r.json();
  $('ss').innerHTML = j.on ? '<span class="up" style="color:#3ddc84">&#9679; session active (fetches will not be blocked)</span>' : 'No session &#8212; Instagram may block requests.';
}
$('sets').onclick = async () => {
  const v = prompt('Paste your Instagram sessionid cookie value:');
  if(!v) return;
  const r = await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionid:v.trim()})});
  sessionStatus();
  alert((await r.json()).ok ? 'Saved.' : 'Save failed.');
};
$('clears').onclick = async () => { await fetch('/api/session',{method:'DELETE'}); sessionStatus(); };

async function track() {
  const username = $('u').value.trim().replace(/^@/,'');
  if(!username) return;
  const btn = $('go'); btn.disabled = true;
  $('status').textContent = 'Fetching ' + username + ' ...';
  const t0 = Date.now();
  try {
    const r = await fetch('/api/profile?u=' + encodeURIComponent(username));
    const j = await r.json();
    if(!j.ok) { $('status').textContent = j.error || 'Error'; return; }
    render(j);
    $('status').textContent = 'Loaded in ' + ((Date.now()-t0)/1000).toFixed(2) + 's';
  } catch(e) { $('status').textContent = 'Request failed'; }
  finally { btn.disabled = false; }
}
function deltaText(d){ if(d===0) return '<span class="delta same">0</span>'; return d>0?'<span class="delta up">+'+d+'</span>':'<span class="delta down">'+d+'</span>'; }
function igerr(el){ el.style.visibility='hidden'; }
function person(p){
  return '<div class="person"><img src="' + (p.profilePic||'') + '" onerror="igerr(this)"><div class="u">@' + p.username + '</div><div class="n">' + (p.fullName||'') + '</div></div>';
}
function render(j){
  const u=j.user;
  out.innerHTML='';
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=
    '<div class="profile"><img class="avatar" src="'+(u.profilePic||'')+'" onerror="igerr(this)">'+
    '<div><div class="pname">'+u.fullName+' '+(u.verified?'<span class="verified">&#10003;</span>':'')+(u.private?'<span class="private">&#128274; private</span>':'')+'</div>'+
    '<div class="uname">@'+u.username+'</div>'+
    (u.bio?'<div class="bio">'+u.bio.replace(/</g,'&lt;')+'</div>':'')+
    '<div class="stats">'+
      '<div class="stat"><b>'+j.recentFollowingCount+'</b><span>following</span></div>'+
      '<div class="stat"><b>'+j.recentFollowedByCount+'</b><span>followers '+deltaText(j.delta.followedBy)+'</span></div>'+
      '<div class="stat"><b>'+j.postCount+'</b><span>posts</span></div>'+
    '</div></div></div>'+
    (j.history.length>1? '<div class="chart"><h2>Follower history</h2>'+spark(j.history)+'<div style="color:#777;font-size:.72rem;margin-top:4px">'+j.lastCheckText+'</div></div>':'')+
    '<h2>Recent followers &nbsp;<span style="color:#777;text-transform:none;font-weight:400">'+j.followersRecent.length+' shown</span></h2>'+
    (j.followersRecent.length? '<div class="grid">'+j.followersRecent.map(person).join('')+'</div>':'<div class="none">No public recent followers available (Instagram hides these without a logged-in session).</div>')+
    '<h2>Recent follows &nbsp;<span style="color:#777;text-transform:none;font-weight:400">'+j.followingRecent.length+' shown</span></h2>'+
    (j.followingRecent.length? '<div class="grid">'+j.followingRecent.map(person).join('')+'</div>':'<div class="none">No public recent follows available.</div>');
  out.appendChild(card);
}
function spark(points){
  const w=600,h=60,pad=6;
  const vals=points.map(p=>p.f);
  if(vals.length<1) return '';
  const min=Math.min(...vals), max=Math.max(...vals);
  const range=(max-min)||1;
  const step=w/(vals.length-1||1);
  return '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+vals.map((v,i)=>((i*step+pad).toFixed(1)+','+((h-pad-(v-min)/range*(h-2*pad))).toFixed(1))).join(' ')+'" fill="none" stroke="#dc2743" stroke-width="2"/></svg>';
}
$('go').onclick=track;
$('u').addEventListener('keydown',e=>{ if(e.key==='Enter') track(); });
sessionStatus();
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/session') {
      if (request.method === 'POST'){
        try{
          const b = await request.json();
          if(b.sessionid && /^[0-9A-Za-z%:_\-]{20,}$/.test(b.sessionid)){
            await env.IGTRACKER_DB.put('sessionid', b.sessionid);
            return json({ok:true});
          }
        }catch(e){}
        return json({ok:false, error:'Invalid sessionid.'});
      }
      if (request.method === 'DELETE'){
        await env.IGTRACKER_DB.delete('sessionid');
        return json({ok:true});
      }
      const sid = await env.IGTRACKER_DB.get('sessionid');
      return json({on: !!sid});
    }

    if (url.pathname === '/api/profile') {
      const username = (url.searchParams.get('u')||'').trim().replace(/^@/,'').toLowerCase();
      if(!/^[a-z0-9._]{1,30}$/.test(username)){
        return json({ok:false, error:'Invalid username. Use letters, numbers, dots, underscores.'});
      }
      return await getProfile(username, env);
    }

    return new Response(HTML, {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
};

function json(o){ return new Response(JSON.stringify(o),{headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'}}); }

async function getProfile(username, env){
  const sid = await env.IGTRACKER_DB.get('sessionid');
  const headers = {
    'user-agent': UA,
    'x-ig-app-id': APP_ID,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'referer': 'https://www.instagram.com/' + username + '/',
  };
  if(sid) headers['cookie'] = 'sessionid=' + sid;

  let body = null;
  for(const host of ['https://www.instagram.com','https://i.instagram.com']){
    try{
      const res = await fetch(host + '/api/v1/users/web_profile_info/?username=' + username, {headers});
      if(res.status===200){
        const t = await res.text();
        try{ body = JSON.parse(t); }catch(e){}
        if(body) break;
      }
    }catch(e){}
  }

  if(!body || !body.data || !body.data.user){
    return json({ok:false, error:'Instagram blocked the request (rate limited or login wall). Paste your sessionid in the bar above, or try again in a few minutes.'});
  }

  const raw = body.data.user;
  const user = {
    id: raw.id || null,
    username: raw.username,
    fullName: raw.full_name || raw.username,
    bio: raw.biography || null,
    profilePic: raw.profile_pic_url_hd || raw.profile_pic_url || null,
    isPrivate: !!raw.is_private,
    isVerified: !!raw.is_verified,
  };

  const followedBy = (raw.edge_followed_by||{});
  const following  = (raw.edge_follow||{});
  const media = (raw.edge_owner_to_timeline_media||{});
  const postCount = media.count || 0;

  let followersRecent = recentOf(followedBy.edges);
  let followingRecent = recentOf(following.edges);

  if(sid){
    const uid = user.id;
    const fRes = await fetch('https://www.instagram.com/api/v1/friendships/' + uid + '/followers/?count=12&search_surface=follow_list_page', {headers});
    if(fRes.status===200){
      try{
        const fj = await fRes.json();
        if(fj.users && fj.users.length) followersRecent = recentOf((fj.users||[]).map(u=>({node:u})));
      }catch(e){}
    }
    const gRes = await fetch('https://www.instagram.com/api/v1/friendships/' + uid + '/following/?count=12&search_surface=follow_list_page', {headers});
    if(gRes.status===200){
      try{
        const gj = await gRes.json();
        if(gj.users && gj.users.length) followingRecent = recentOf((gj.users||[]).map(u=>({node:u})));
      }catch(e){}
    }
  }

  const now = Date.now();
  const key = 'snap:' + username;
  const historyRaw = await env.IGTRACKER_DB.get(key);
  let history = [];
  try{ history = historyRaw ? JSON.parse(historyRaw) : []; }catch(e){ history=[]; }

  history.push({t:now, f:followedBy.count||0, g:following.count||0});
  if(history.length>120) history.splice(0, history.length-120);
  await env.IGTRACKER_DB.put(key, JSON.stringify(history));

  const prev = history.length>1 ? history[history.length-2] : null;
  let lastCheckText = 'No previous snapshot.';
  if(prev){
    const diff = (followedBy.count||0) - prev.f;
    lastCheckText = diff>0 ? ('+'+diff+' followers since ' + new Date(prev.t).toLocaleString())
      : diff<0 ? (diff+' followers since ' + new Date(prev.t).toLocaleString())
      : ('no change since ' + new Date(prev.t).toLocaleString());
  }

  return json({
    ok:true,
    user,
    postCount,
    recentFollowingCount: following.count||0,
    recentFollowedByCount: followedBy.count||0,
    followersRecent,
    followingRecent,
    history,
    delta: { followedBy: prev?(followedBy.count||0)-prev.f:0, following: prev?(following.count||0)-prev.g:0 },
    lastCheckText,
  });
}

function recentOf(arr){
  return (arr||[]).map(e=>e&&(e.node||e)?{username:(e.node||e).username,fullName:(e.node||e).full_name,profilePic:(e.node||e).profile_pic_url}:null).filter(Boolean);
}