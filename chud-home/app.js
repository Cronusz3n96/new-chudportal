/* Chud Home launcher app */
(function () {
  'use strict';

  var games_ = Array.isArray(window.games) ? window.games.slice() : [];
  var order_ = games_.slice();
  var scramProm_ = null;
  var frame_ = null;
  var lastTarget_ = '';
  var loadTimer_ = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ── View routing ── */
  function switchView(name) {
    ['home', 'games', 'browser'].forEach(function (v) {
      $('view-' + v).hidden = (v !== name);
    });
    document.querySelectorAll('.nav .pill').forEach(function (b, i) {
      b.classList.toggle('pill-active', b.textContent.trim().toLowerCase() === name || (name === 'browser' && i === 2));
    });
    if (name === 'home') { window.scrollTo({ top: 0 }); }
    if (name === 'games') { $('game-search').focus(); }
  }
  window.switchView = switchView;

  /* ── Cards ── */
  function fallbackName(g) {
    var t = g.title || '?';
    return t.charAt(0).toUpperCase();
  }

  function buildCard(g, i) {
    var card = document.createElement('button');
    card.className = 'card';
    card.style.animationDelay = Math.min(i, 28) * 14 + 'ms';
    card.onclick = function () { openGame(g); };

    var thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    var imgHtml = g.image ? '<img loading="lazy" src="' + g.image + '" alt="" onerror="this.style.display=\'none\'">' : '';
    thumb.innerHTML = imgHtml + '<span class="fallback">' + fallbackName(g) + '</span><span class="play-hint">&#9654;</span>';

    var body = document.createElement('div');
    body.className = 'card-body';
    var h = document.createElement('h3');
    h.textContent = g.title || 'Untitled';
    var p = document.createElement('p');
    p.textContent = g.desc || '';
    body.appendChild(h);
    body.appendChild(p);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  /* ── Home ── */
  function renderHome() {
    var rail = $('featured-rail');
    rail.innerHTML = '';
    games_.slice(0, 24).forEach(function (g, i) { rail.appendChild(buildCard(g, i)); });

    var rows = [
      '<div class="stat"><b>' + games_.length + '</b> games loaded</div>',
      '<div class="stat"><b>1</b> built-in proxy browser</div>',
      '<div class="stat"><b>0</b> downloads needed</div>',
      '<div class="stat">thx <b>gn-math</b> for the catalog</div>'
    ];
    $('stat-row').innerHTML = rows.join('');
    $('game-count').textContent = '(' + games_.length + ')';
  }

  /* ── Games library ── */
  function renderGames() {
    var q = ($('game-search').value || '').trim().toLowerCase();
    var sort = $('sort-select').value;
    var list = order_.slice();

    if (q) {
      list = list.filter(function (g) {
        return ((g.title || '') + ' ' + (g.desc || '')).toLowerCase().indexOf(q) !== -1;
      });
    }

    if (sort === 'az') {
      list.sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
    } else if (sort === 'za') {
      list.sort(function (a, b) { return (b.title || '').localeCompare(a.title || ''); });
    } else if (sort === 'new') {
      list.reverse();
    }

    var grid = $('game-grid');
    grid.innerHTML = '';
    list.forEach(function (g, i) { grid.appendChild(buildCard(g, i)); });
    $('empty-state').hidden = list.length !== 0;
  }
  window.renderGames = renderGames;

  function shuffleGames() {
    for (var i = order_.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order_[i]; order_[i] = order_[j]; order_[j] = t;
    }
    renderGames();
  }
  window.shuffleGames = shuffleGames;

  /* ── Proxy engine ── */
  function looksLikeUrl(v) {
    v = (v || '').trim();
    if (!v) return false;
    if (/^https?:\/\//i.test(v)) return true;
    if (/\s/.test(v)) return false;
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/|$)/i.test(v)) return true;
    return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[\/?#].*)?$/i.test(v);
  }

  function resolveTarget(raw) {
    var value = (raw || '').trim();
    if (!value) return 'https://www.google.com';
    if (looksLikeUrl(value)) return /^https?:\/\//i.test(value) ? value : 'https://' + value;
    return 'https://www.google.com/search?q=' + encodeURIComponent(value) + '&hl=en&gl=US&num=20';
  }

  function ensureScramjet() {
    if (frame_) return Promise.resolve(frame_);
    if (typeof initBootstrap !== 'function') return Promise.resolve(null);
    if (!scramProm_) {
      scramProm_ = (async function () {
        var ctl = await initBootstrap();
        var plugins = [];
        if (window.$scramjetUtils) {
          try {
            plugins.push(new $scramjetUtils.HttpCachePlugin());
            plugins.push(new $scramjetUtils.UrlWatcherPlugin(function (url) {
              var bar = $('urlbar');
              if (bar && !$('view-browser').hidden) bar.value = url;
            }));
          } catch (e) { /* plugins optional */ }
        }
        frame_ = ctl.createFrame($('proxy-frame'), { plugins: plugins });
        return frame_;
      })();
    }
    return scramProm_;
  }

  function showLoading(target) {
    $('loading-target').textContent = target || '';
    $('loading').hidden = false;
  }

  function hideLoading() {
    if (loadTimer_) clearTimeout(loadTimer_);
    loadTimer_ = setTimeout(function () { $('loading').hidden = true; }, 450);
  }

  function openGame(g) {
    switchView('browser');
    openBrowser(g.url);
  }
  window.openGame = openGame;

  function openBrowser(raw) {
    switchView('browser');
    var target = resolveTarget(raw);
    lastTarget_ = target;
    $('urlbar').value = target.replace(/^https?:\/\//i, '');
    showLoading(target);

    ensureScramjet().then(function (f) {
      if (f) {
        return f.go(target).then(hideLoading);
      }
      $('proxy-frame').src = target;
      setTimeout(hideLoading, 2500);
    }).catch(function (err) {
      console.warn('Scramjet failed, using direct fallback', err);
      $('proxy-frame').src = target;
      setTimeout(hideLoading, 2500);
    });
  }
  window.openBrowser = openBrowser;

  function closeBrowser() {
    switchView('home');
  }
  window.closeBrowser = closeBrowser;

  function browserGo(e) {
    e.preventDefault();
    var q = $('urlbar').value.trim();
    if (!q) return;
    openBrowser(q);
  }
  window.browserGo = browserGo;

  function proxyReload() {
    if (!lastTarget_) return;
    showLoading(lastTarget_);
    ensureScramjet().then(function (f) {
      if (f && frame_) return f.go(lastTarget_).then(hideLoading);
      var ifr = $('proxy-frame');
      if (ifr.src) ifr.src = ifr.src;
      setTimeout(hideLoading, 1500);
    }).catch(function () {
      var ifr = $('proxy-frame');
      if (ifr.src) { ifr.src = ifr.src; }
      setTimeout(hideLoading, 1500);
    });
  }
  window.proxyReload = proxyReload;

  function proxyNewTab() {
    var q = ($('urlbar').value || '').trim();
    window.open(resolveTarget(q), '_blank');
  }
  window.proxyNewTab = proxyNewTab;

  /* ── Hero actions ── */
  function findGame(q) {
    q = q.toLowerCase();
    var full = games_.filter(function (g) { return ((g.title || '').toLowerCase().indexOf(q) !== -1); });
    if (full.length) return full[0];
    var loose = games_.filter(function (g) { return ((g.desc || '').toLowerCase().indexOf(q) !== -1); });
    return loose[0] || null;
  }

  function heroGo(e) {
    e.preventDefault();
    var q = $('hero-input').value.trim();
    if (!q) return;
    var found = findGame(q);
    if (found) { openGame(found); return; }
    openBrowser(q);
  }
  window.heroGo = heroGo;

  function randomGame() {
    if (!games_.length) return;
    var g = games_[Math.floor(Math.random() * games_.length)];
    openGame(g);
  }
  window.randomGame = randomGame;

  /* ── Keyboard ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('view-browser').hidden) {
      closeBrowser();
    }
  });

  /* ── Boot ── */
  renderHome();
  renderGames();
})();