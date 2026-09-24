"use strict";

const TS = 40;
const COLS = 120;
const ROWS = 30;
const WORLD_W = COLS * TS;
const WORLD_H = ROWS * TS;
const VIEW_W = 1280;
const VIEW_H = 720;

const G = {
  state: "menu",
  t: 0,
  shake: 0,
  lastBench: null,
  benchTouched: false,
  won: false,
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const $ = (id) => document.getElementById(id);
const menuEl = $("menu");
const overEl = $("gameover");
const winEl = $("win");
const pauseEl = $("pause");
const maskEl = $("masks");
const soulFill = $("soulfill");
const roomEl = $("roomname");

const keys = {};

window.addEventListener("keydown", (ev) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.code)) ev.preventDefault();
  keys[ev.code] = true;
});
window.addEventListener("keyup", (ev) => { keys[ev.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

function pressed(...codes) { return codes.some((c) => keys[c]); }

function key(c) { return keys[c]; }

let prevKeys = {};
function snapshotPrevKeys() {
  prevKeys = {};
  for (const k in keys) prevKeys[k] = keys[k];
}
function edgePressed(...codes) {
  for (const c of codes) if (keys[c] && !prevKeys[c]) return true;
  return false;
}

const RIGHT = ["KeyD", "ArrowRight"];
const LEFT = ["KeyA", "ArrowLeft"];
const UP = ["KeyW", "ArrowUp", "Space"];
const ATTACK = ["KeyJ", "KeyX"];
const DASH = ["KeyK", "ShiftLeft", "ShiftRight"];
const HEAL = ["KeyL", "KeyC"];

let AC = null;
function mkAC() {
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) AC = new C();
  }
  if (AC && AC.state === "suspended") AC.resume();
  return AC;
}
function tone(f0, f1, dur, type, vol, delay = 0) {
  const a = mkAC();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseSfx(dur, vol, delay = 0) {
  const a = mkAC();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = a.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 2000; f.Q.value = 0.8;
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(t0);
}
const SFX = {
  jump() { tone(260, 520, 0.12, "triangle", 0.28); },
  slash() { noiseSfx(0.14, 0.3); tone(900, 260, 0.1, "sawtooth", 0.12); },
  hurt() { tone(180, 60, 0.28, "sawtooth", 0.3); noiseSfx(0.2, 0.25, 0.02); },
  dash() { noiseSfx(0.18, 0.22); tone(700, 200, 0.18, "sine", 0.18); },
  hit() { tone(500, 200, 0.09, "square", 0.22); },
  kill() { noiseSfx(0.25, 0.3); tone(300, 80, 0.3, "square", 0.22); },
  heal() { tone(320, 660, 0.4, "sine", 0.2); tone(480, 900, 0.5, "sine", 0.12, 0.08); },
  bench() { tone(220, 440, 0.3, "sine", 0.2); tone(330, 660, 0.4, "sine", 0.16, 0.1); },
  death() { tone(200, 40, 0.8, "sawtooth", 0.3); noiseSfx(0.6, 0.3, 0.05); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.4, "sine", 0.2, i * 0.12)); },
  land() { tone(140, 90, 0.07, "triangle", 0.12); },
};

function buildTiles() {
  const L = { map: [], set(tx, ty, ch) { if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) this.map[ty][tx] = ch; }, clear(tx, ty) { this.set(tx, ty, " "); }, rect(x, y, w, h, ch) { for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.set(tx, ty, ch); } };
  for (let ty = 0; ty < ROWS; ty++) L.map.push(new Array(COLS).fill(" "));

  L.rect(0, 27, COLS, 3, "#");
  L.rect(0, 0, COLS, 1, "#");

  function pit(x, w) {
    for (let tx = x; tx < x + w; tx++) {
      L.set(tx, 27, " ");
      L.set(tx, 28, "^");
      L.set(tx, 29, "^");
    }
  }
  pit(9, 3);
  pit(30, 4);
  pit(55, 4);
  pit(74, 3);

  for (let tx = 17; tx <= 19; tx++)
    for (let ty = 1; ty <= 26; ty++) L.clear(tx, ty);
  for (let tx = 41; tx <= 44; tx++)
    for (let ty = 2; ty <= 26; ty++) L.clear(tx, ty);

  L.rect(17, 25, 3, 1, "=");
  L.rect(17, 22, 3, 1, "=");
  L.rect(17, 19, 3, 1, "=");
  L.rect(17, 16, 3, 1, "=");
  L.rect(41, 20, 3, 1, "=");
  L.rect(41, 15, 3, 1, "=");

  L.rect(20, 16, 17, 2, "#");

  L.rect(55, 24, 3, 1, "#");
  L.rect(74, 24, 2, 1, "#");

  L.rect(2, 20, 5, 1, "=");
  L.rect(60, 18, 6, 1, "=");
  L.rect(88, 15, 6, 1, "=");

  L.rect(76, 24, 6, 3, "#");

  L.rect(88, 15, 6, 1, "=");

  for (let tx = 109; tx <= 110; tx++) {
    L.set(tx, 27, " ");
    L.set(tx, 28, "^");
    L.set(tx, 29, "^");
  }
  L.rect(112, 24, 8, 3, "#");

  L.rect(6, 2, 1, 5, "#");
  L.rect(24, 2, 1, 4, "#");
  L.rect(48, 2, 1, 4, "#");
  L.rect(68, 2, 1, 5, "#");
  L.rect(90, 2, 1, 4, "#");
  L.rect(47, 9, 1, 4, "#");
  L.rect(60, 8, 1, 3, "#");
  L.rect(84, 12, 1, 3, "#");

  return L;
}

const tiles = buildTiles();
const SOLID = "#", ONWAY = "=", SPIKE = "^";
function solidAt(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
  return tiles.map[ty][tx] === SOLID;
}
function onWayAt(tx, ty) {
  if (ty < 0 || ty >= ROWS) return false;
  if (tx < 0 || tx >= COLS) return false;
  return tiles.map[ty][tx] === ONWAY;
}
function spikeAt(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
  return tiles.map[ty][tx] === SPIKE;
}

function makePlayer() {
  return {
    x: 3 * TS, y: 25 * TS - 52, w: 34, h: 52,
    vx: 0, vy: 0, face: 1,
    grounded: false, wall: 0, coyote: 0, jumpBuf: 0,
    hp: 5, maxHp: 5, soul: 0, invuln: 0,
    canDash: true, dashCD: 0, dashTime: 0,
    attacking: false, attackT: 0, attackCD: 0, attackHit: new Set(),
    focusing: false, focusT: 0,
    runT: 0, landT: 0, dead: false, anim: 0,
  };
}

let player = makePlayer();

const SPAWNS = [
  { type: "c", x: 5, y: 26 },
  { type: "c", x: 24, y: 16 },
  { type: "c", x: 28, y: 16 },
  { type: "f", x: 33, y: 12 },
  { type: "c", x: 50, y: 26 },
  { type: "b", x: 63, y: 26 },
  { type: "f", x: 70, y: 13 },
  { type: "c", x: 85, y: 26 },
  { type: "c", x: 91, y: 26 },
  { type: "b", x: 47, y: 26 },
  { type: "f", x: 114, y: 22 },
];

const ENEMY = {
  c: { w: 42, h: 34, hp: 2, speed: 58 },
  f: { w: 52, h: 38, hp: 2, speed: 80 },
  b: { w: 46, h: 46, hp: 3 },
};

let enemies = [];

function spawnEnemies() {
  enemies = [];
  for (const s of SPAWNS) {
    const d = ENEMY[s.type];
    const e = {
      type: s.type, w: d.w, h: d.h, hp: d.hp,
      x: s.x * TS + (TS - d.w) / 2,
      y: s.y * TS - d.h,
      vx: 0, vy: 0, dir: -1, t: Math.random() * 6,
      alive: true, flash: 0, cd: 0, baseY: s.y * TS + (TS - d.h) / 2,
    };
    if (s.type === "f") { e.x = s.x * TS + (TS - d.w) / 2; e.y = e.baseY - d.h / 2; }
    enemies.push(e);
  }
}
spawnEnemies();

const doorBox = { x: 115 * TS + 6, y: 24 * TS - 130, w: 84, h: 130 };
const benchPos = { x: 78 * TS, y: 24 * TS };

const ROOMS = [
  [0, "The First Glade"],
  [17, "The Ascent"],
  [20, "Upper Hollows"],
  [41, "The Descent"],
  [45, "The Crawl"],
  [62, "Spikefield"],
  [70, "The Hanging Choir"],
  [76, "Resting Bench"],
  [86, "The Vermin Path"],
  [98, "Stag Steps"],
  [110, "The Stag Door"],
];
function roomName() {
  const cx = player.x + player.w / 2;
  for (let i = ROOMS.length - 1; i >= 0; i--) if (cx >= ROOMS[i][0] * TS) return ROOMS[i][1];
  return ROOMS[0][1];
}

const particles = [];
const motes = [];
for (let i = 0; i < 46; i++) motes.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, s: 1 + Math.random() * 2, sp: 6 + Math.random() * 14, ph: Math.random() * 6 });

function spawnP(x, y, vx, vy, life, size, color, grav = 0) {
  particles.push({ x, y, vx, vy, life, t: life, size, color, grav });
}
function burst(x, y, n, color, spd = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (spd * (0.3 + Math.random()));
    spawnP(x, y, Math.cos(a) * v, Math.sin(a) * v - 60, 0.4 + Math.random() * 0.4, 2 + Math.random() * 3, color, 500);
  }
}

const cam = { x: 0, y: 300 };
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function over(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function collideWorld(e, dt) {
  e.grounded = false;
  const x0 = Math.floor(e.x / TS), x1 = Math.floor((e.x + e.w - 0.001) / TS);
  const y0 = Math.floor(e.y / TS), y1 = Math.floor((e.y + e.h - 0.001) / TS);
  e.x += e.vx * dt;
  if (e.vx > 0) {
    const tx = Math.floor((e.x + e.w) / TS);
    for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { e.x = tx * TS - e.w - 0.001; e.vx = 0; e.wall = 1; break; }
  } else if (e.vx < 0) {
    const tx = Math.floor(e.x / TS);
    for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { e.x = (tx + 1) * TS + 0.001; e.vx = 0; e.wall = -1; break; }
  }
  const prevFeet = e.y + e.h - e.vy * dt;
  e.y += e.vy * dt;
  if (e.vy > 0) {
    let ty = Math.floor((e.y + e.h) / TS);
    let grounded = false;
    const fx0 = Math.floor(e.x / TS), fx1 = Math.floor((e.x + e.w - 0.001) / TS);
    for (let tx = fx0; tx <= fx1 && !grounded; tx++) if (solidAt(tx, ty)) { e.y = ty * TS - e.h - 0.001; e.vy = 0; grounded = true; }
    if (!grounded) {
      for (let tx = fx0; tx <= fx1 && !grounded; tx++)
        if (onWayAt(tx, ty) && prevFeet <= ty * TS + 0.001) { e.y = ty * TS - e.h - 0.001; e.vy = 0; grounded = true; }
    }
    if (grounded) e.grounded = true;
  } else if (e.vy < 0) {
    const ty = Math.floor(e.y / TS);
    const fx0 = Math.floor(e.x / TS), fx1 = Math.floor((e.x + e.w - 0.001) / TS);
    for (let tx = fx0; tx <= fx1; tx++) if (solidAt(tx, ty)) { e.y = (ty + 1) * TS + 0.001; e.vy = 0; break; }
  }
  if (e.x < 0) { e.x = 0; e.vx = 0; }
  if (e.x + e.w > WORLD_W) { e.x = WORLD_W - e.w; e.vx = 0; }
  if (e.y + e.h > WORLD_H) { e.y = WORLD_H - e.h; e.vy = 0; e.grounded = true; }
  if (e.y < 0) { e.y = 0; e.vy = Math.max(0, e.vy); }
}

function startDash() {
  player.dashTime = 0.17;
  player.dashCD = 0.55;
  player.canDash = false;
  player.vx = player.face * 780;
  player.vy = Math.min(player.vy, 0);
  player.invuln = Math.max(player.invuln, 0.25);
  SFX.dash();
}

function updatePlayer(dt) {
  const p = player;
  p.anim += dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.attackCD > 0) p.attackCD -= dt;
  if (p.dashCD > 0) p.dashCD -= dt;

  const move = (pressed(...RIGHT) ? 1 : 0) - (pressed(...LEFT) ? 1 : 0);

  if (p.focusing) {
    p.focusT += dt;
    p.vx = 0; p.vy = 0;
    if (move !== 0 || pressed(...ATTACK)) { p.focusing = false; }
    else if (p.focusT >= 0.9) {
      p.focusing = false;
      p.soul -= 33;
      p.hp = Math.min(p.maxHp, p.hp + 1);
      p.invuln = Math.max(p.invuln, 0.6);
      SFX.heal();
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        spawnP(p.x + p.w / 2, p.y + p.h / 2, Math.cos(a) * 90, Math.sin(a) * 90 - 40, 0.6, 2, "#bfe8ff", -120);
      }
    }
  } else if (p.dashTime > 0) {
    p.dashTime -= dt;
    for (let i = 0; i < 3; i++) spawnP(p.x + p.w / 2 - p.face * 10, p.y + p.h / 2, -p.face * 60 + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30, 0.3, 3, "#bfdfff");
    collideWorld(p, dt);
    if (p.dashTime <= 0) p.vy = 0;
  } else if (p.attacking) {
    p.attackT += dt;
    if (p.attackT > 0.26) { p.attacking = false; p.attackCD = 0.22; }
    const wasAir = !p.grounded;
    p.vy = Math.min(p.vy + 2400 * dt, 900);
    collideWorld(p, dt);
    p.vx *= 0.55;
    if (wasAir && p.grounded) spawnP(p.x + p.w / 2, p.y + p.h, 0, -20, 0.3, 2, "#8888aa");
  } else {
    if (p.grounded) { p.coyote = 0.1; p.canDash = true; } else p.coyote -= dt;
    if (p.jumpBuf > 0) p.jumpBuf -= dt;

    const accel = p.grounded ? 1700 : 1150;
    const maxRun = 270;
    if (move !== 0) {
      p.vx += move * accel * dt;
      p.vx = clamp(p.vx, -maxRun, maxRun);
      p.face = move;
      if (p.grounded) p.runT += dt; else p.runT = 0;
    } else {
      const fr = (p.grounded ? 2200 : 350) * dt;
      if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr;
    }

    p.wall = 0;
    const wX = Math.floor((p.face > 0 ? p.x + p.w + 1 : p.x - 1) / TS);
    const wY = Math.floor((p.y + p.h * 0.35) / TS);
    if (solidAt(wX, wY) && !p.grounded) p.wall = p.face;

    if (p.wall !== 0 && pressed(...DASH) && p.dashCD <= 0) startDash();
    else if (edgePressed(...UP)) p.jumpBuf = 0.13;

    if (p.jumpBuf > 0 && (p.coyote > 0 || p.wall !== 0)) {
      p.vy = p.wall !== 0 && p.coyote <= 0 ? -850 : -830;
      p.vx = p.wall !== 0 && p.coyote <= 0 ? -p.wall * 360 + move * 120 : p.vx;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.grounded = false;
      SFX.jump();
      for (let i = 0; i < 5; i++) spawnP(p.x + p.w / 2, p.y + p.h, (Math.random() - 0.5) * 120, -30, 0.35, 2, "#667788", 300);
    }

    if (!key(...UP) && p.vy < -220) p.vy = -220;

    if (p.wall !== 0 && !p.grounded) {
      p.vy = Math.min(p.vy + 700 * dt, 320);
      if (move * p.wall < 0) p.vx += -p.wall * 1600 * dt;
    } else {
      p.vy = Math.min(p.vy + 2400 * dt, 920);
    }

    if (pressed(...DASH) && p.dashCD <= 0 && p.canDash) startDash();
    else if (pressed(...ATTACK) && p.attackCD <= 0) {
      p.attacking = true;
      p.attackT = 0;
      p.attackHit.clear();
      SFX.slash();
    }
    if (pressed(...HEAL) && p.soul >= 33 && p.hp < p.maxHp && p.grounded) {
      p.focusing = true;
      p.focusT = 0;
    }

    const wasAir = !p.grounded;
    collideWorld(p, dt);
    if (wasAir && p.grounded) SFX.land();
  }

  p.x = clamp(p.x, 0, WORLD_W - p.w);
  p.y = clamp(p.y, 0, WORLD_H - p.h);
  snapshotPrevKeys();

  if (p.attacking) {
    const t = p.attackT;
    if (t >= 0.05 && t <= 0.17) {
      const nb = nailBox(p);
      for (const e of enemies) {
        if (!e.alive || p.attackHit.has(e)) continue;
        if (over(nb, e)) {
          p.attackHit.add(e);
          e.hp -= 1;
          e.flash = 0.12;
          const dir = (e.x + e.w / 2 > p.x + p.w / 2) ? 1 : -1;
          e.vx = dir * 190; e.vy = p.vy > 0 && !p.grounded ? -240 : e.vy;
          if (p.vy > 0 && !p.grounded) { p.vy = -640; SFX.hit(); }
          p.soul = Math.min(100, p.soul + 15);
          burst(e.x + e.w / 2, e.y + e.h / 2, 8, "#ffffff", 180);
          if (e.hp <= 0) killEnemy(e);
          else SFX.hit();
        }
      }
    }
  }
}

function nailBox(p) {
  const w = 80, h = 64;
  const x = p.face > 0 ? p.x + p.w - 8 : p.x - w + 8;
  return { x, y: p.y - 8, w, h };
}

function killEnemy(e) {
  e.alive = false;
  SFX.kill();
  burst(e.x + e.w / 2, e.y + e.h / 2, 20, "#cfd8ff", 240);
  burst(e.x + e.w / 2, e.y + e.h / 2, 8, "#ffffff", 160);
  player.soul = Math.min(100, player.soul + 15);
}
function damagePlayer(amount, dirX) {
  const pl = player;
  if (pl.invuln > 0 || pl.dead) return;
  pl.hp -= amount;
  pl.invuln = 1.0;
  pl.vx = dirX * 330;
  pl.vy = -300;
  pl.focusing = false;
  pl.canDash = true;
  G.shake = 0.28;
  SFX.hurt();
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnP(pl.x + pl.w / 2, pl.y + pl.h / 2, Math.cos(a) * 150, Math.sin(a) * 150 - 60, 0.5, 3, "#e84a5f", 400);
  }
  updateHUD();
  if (pl.hp <= 0) {
    pl.dead = true;
    playerDeath();
  }
}

function playerDeath() {
  SFX.death();
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 80 + Math.random() * 220;
    spawnP(player.x + player.w / 2, player.y + player.h / 2, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.6, 2 + Math.random() * 3, i % 3 ? "#2a2a3c" : "#bfe8ff", 500);
  }
  G.state = "dead";
  setTimeout(() => overEl.classList.remove("hidden"), 900);
}

function updateEnemies(dt) {
  const fresh = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    e.flash -= dt;
    e.t += dt;
    const pl = player;
    if (e.type === "c") {
      const frontX = e.dir > 0 ? e.x + e.w + 4 : e.x - 4;
      const txW = Math.floor(frontX / TS), tyW = Math.floor(e.y / TS);
      const txF = Math.floor(frontX / TS), tyF = Math.floor((e.y + e.h + 6) / TS);
      if (solidAt(txW, tyW) || !(solidAt(txF, tyF) || onWayAt(txF, tyF))) e.dir *= -1;
      e.vx = e.dir * 58;
      e.vy = Math.min(e.vy + 2400 * dt, 920);
    } else if (e.type === "b") {
      e.vy = Math.min(e.vy + 2400 * dt, 920);
      e.cd -= dt;
      const dx = (pl.x + pl.w / 2) - (e.x + e.w / 2);
      if (e.cd <= 0 && e.grounded && Math.abs(dx) < 300 && Math.abs(pl.y - e.y) < 220) {
        e.vy = -430;
        e.vx = Math.sign(dx) * 90;
        e.cd = 1.5;
      }
      if (e.grounded) e.vx *= 0.8;
    } else if (e.type === "f") {
      const dx = (pl.x + pl.w / 2) - (e.x + e.w / 2);
      const dir = Math.sign(dx);
      e.vx += dir * 500 * dt;
      e.vx = clamp(e.vx, -80, 80);
      e.y = e.baseY + Math.sin(e.t * 2.2) * 26;
      e.baseY += (pl.y - e.baseY) * 0.4 * dt;
      e.x = clamp(e.x, 0, WORLD_W - e.w);
    }
    collideWorld(e, dt);
    if (e.type === "f") e.grounded = false;
    if (e.x < -300 || e.x > WORLD_W + 300) { e.alive = false; continue; }

    if (over(e, pl) && !pl.dead && pl.invuln <= 0) {
      const dir = (pl.x + pl.w / 2 > e.x + e.w / 2) ? 1 : -1;
      damagePlayer(1, dir);
    }
    fresh.push(e);
  }
  enemies = fresh;
}

function spikeDamage() {
  const pl = player;
  if (pl.invuln > 0 || pl.dead) return;
  const x0 = Math.floor(pl.x / TS), x1 = Math.floor((pl.x + pl.w - 1) / TS);
  const y0 = Math.floor(pl.y / TS), y1 = Math.floor((pl.y + pl.h - 1) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (spikeAt(tx, ty)) { damagePlayer(1, 0); return; }
}

function respawn() {
  const b = G.lastBench || { x: 3 * TS, y: 24 * TS };
  G.benchTouched = false;
  const fresh = makePlayer();
  fresh.x = b.x;
  fresh.y = b.y - 52;
  Object.assign(player, fresh);
  spawnEnemies();
  particles.length = 0;
  updateHUD();
}

function updateHUD() {
  const pl = player;
  const masks = maskEl.children;
  for (let i = 0; i < masks.length; i++) {
    masks[i].className = i < pl.hp ? "mask full" : "mask empty";
  }
  soulFill.style.width = pl.soul + "%";
}

function buildMasks() {
  maskEl.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const d = document.createElement("div");
    d.className = "mask full";
    maskEl.appendChild(d);
  }
}
buildMasks();

function update(dt) {
  if (G.state !== "playing") return;
  const pl = player;
  if (pl.dead) return;

  updatePlayer(dt);
  updateEnemies(dt);
  spikeDamage();

  for (const m of motes) {
    m.x -= m.sp * dt * 0.05;
    m.y += Math.sin(G.t + m.ph) * 4 * dt * 3;
    if (m.x < 0) m.x = WORLD_W;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.t -= dt;
    if (pa.t <= 0) { particles.splice(i, 1); continue; }
    pa.vy += pa.grav * dt;
    pa.x += pa.vx * dt;
    pa.y += pa.vy * dt;
  }

  const targetX = pl.x + pl.w / 2 + pl.face * 90 - VIEW_W / 2;
  const targetY = pl.y + pl.h / 2 - VIEW_H / 2 - 30;
  cam.x += (targetX - cam.x) * Math.min(1, dt * 5);
  cam.y += (targetY - cam.y) * Math.min(1, dt * 5);
  cam.x = clamp(cam.x, 0, WORLD_W - VIEW_W);
  cam.y = clamp(cam.y, 0, Math.max(0, WORLD_H - VIEW_H));

  if (G.shake > 0) G.shake -= dt;

  updateHUD();

  if (!G.benchTouched && pl.grounded && Math.abs(pl.x + pl.w / 2 - (benchPos.x + 60)) < 170) {
    G.benchTouched = true;
    G.lastBench = { x: benchPos.x + 20, y: benchPos.y };
    SFX.bench();
  }
  if (!pl.grounded) G.benchTouched = false;

  if (over({ x: pl.x, y: pl.y, w: pl.w, h: pl.h }, doorBox) && !G.won) {
    G.won = true;
    G.state = "win";
    SFX.win();
    setTimeout(() => winEl.classList.remove("hidden"), 900);
  }

  roomEl.textContent = roomName();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#0a0a18");
  g.addColorStop(0.55, "#10101f");
  g.addColorStop(1, "#07070f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const per = 0.35;
  ctx.fillStyle = "rgba(120,140,200,0.05)";
  const gx = cam.x * per;
  for (let i = 0; i < 10; i++) {
    const x = ((i * 280 - gx) % (VIEW_W + 200) + VIEW_W + 200) % (VIEW_W + 200) - 100;
    const y = VIEW_H - 160 - (i % 4) * 60;
    ctx.beginPath();
    ctx.arc(x, y, 90 + (i % 3) * 50, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(80,200,255,0.03)";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 460 - gx * 1.6) % (VIEW_W + 200) + VIEW_W + 200) % (VIEW_W + 200) - 100;
    const y = 120 + (i % 3) * 180;
    ctx.beginPath();
    ctx.arc(x, y, 20 + (i % 4) * 24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTileArt() {
  const x0 = Math.max(0, Math.floor(cam.x / TS) - 1);
  const x1 = Math.min(COLS - 1, Math.ceil((cam.x + VIEW_W) / TS) + 1);
  const y0 = Math.max(0, Math.floor(cam.y / TS) - 1);
  const y1 = Math.min(ROWS - 1, Math.ceil((cam.y + VIEW_H) / TS) + 1);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const ch = tiles.map[ty][tx];
      const px = tx * TS, py = ty * TS;
      if (ch === SOLID) {
        ctx.fillStyle = "#1e1e30";
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = "#262640";
        ctx.fillRect(px, py, TS, 3);
        ctx.fillStyle = "#14141f";
        ctx.fillRect(px, py + TS - 5, TS, 5);
        ctx.fillRect(px + TS - 4, py, 4, TS);
        ctx.fillStyle = "rgba(10,10,18,0.5)";
        ctx.fillRect(px + 6, py + 8, 8, 6);
        ctx.fillRect(px + 20, py + 20, 10, 5);
        if (!solidAt(tx + 1, ty) && solidAt(tx, ty)) ctx.fillStyle = "rgba(140,120,180,0.06)";
        ctx.strokeStyle = "rgba(90,90,140,0.25)";
        ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
      } else if (ch === ONWAY) {
        ctx.fillStyle = "#2c2c48";
        ctx.fillRect(px, py + TS - 8, TS, 8);
        ctx.fillStyle = "rgba(120,120,190,0.4)";
        ctx.fillRect(px, py + TS - 8, TS, 3);
        ctx.fillStyle = "rgba(30,30,50,0.8)";
        ctx.fillRect(px + 4, py + TS - 4, TS - 8, 2);
      } else if (ch === SPIKE) {
        ctx.fillStyle = "#4a4a62";
        for (let s = 0; s < 2; s++) {
          const sx = px + s * (TS / 2);
          ctx.beginPath();
          ctx.moveTo(sx, py + TS);
          ctx.lineTo(sx + TS / 2, py + TS);
          ctx.lineTo(sx + TS / 4, py + 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "rgba(160,170,210,0.35)";
        ctx.beginPath();
        ctx.moveTo(px + TS / 4, py + 8);
        ctx.lineTo(px + TS / 2 - 2, py + TS - 4);
        ctx.lineTo(px + TS / 2 - 2, py + TS);
        ctx.lineTo(px + TS / 4, py + TS);
        ctx.closePath();
        ctx.fill();
      } else if (ch === "D") {
      }
    }
  }
}

function drawBench() {
  const wx = benchPos.x + 30;
  const wy = benchPos.y;
  const cx = wx, cy = wy - 18;
  ctx.save();
  ctx.fillStyle = "#3a3a52";
  ctx.strokeStyle = "#5555ff";
  ctx.fillRect(cx - 55, cy - 6, 110, 12);
  ctx.fillStyle = "#2c2c44";
  ctx.fillRect(cx - 60, cy, 120, 18);
  ctx.fillStyle = "#26263c";
  ctx.fillRect(cx - 30, cy + 18, 60, 30);
  ctx.fillStyle = "#31314a";
  ctx.fillRect(cx - 58, cy - 2, 116, 4);
  ctx.strokeStyle = "rgba(120,180,255,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 58, cy - 8, 116, 12);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#9fd0ff";
  ctx.beginPath();
  ctx.arc(cx + 42, cy + 28, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawDoor() {
  ctx.save();
  const a = doorBox;
  const cx = a.x + a.w / 2;
  const top = a.y + 8;
  const h = a.h - 16;
  ctx.fillStyle = "#34344e";
  ctx.strokeStyle = "#4a4a6a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx - a.w / 2 + 6, a.y + a.h);
  ctx.lineTo(cx - a.w / 2 + 6, top + 24);
  ctx.quadraticCurveTo(cx - a.w / 2 + 6, top, cx, top);
  ctx.quadraticCurveTo(cx + a.w / 2 - 6, top, cx + a.w / 2 - 6, top + 24);
  ctx.lineTo(cx + a.w / 2 - 6, a.y + a.h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const pulse = 0.7 + Math.sin(G.t * 2.4) * 0.3;
  ctx.strokeStyle = `rgba(120,220,255,${0.8 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, top + 34, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(120,220,255,${0.25 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, top + 34, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fb8ff";
  ctx.font = "20px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("◇", cx, top + 42);
  ctx.restore();
}

function drawMotes() {
  ctx.fillStyle = "rgba(140,180,255,0.35)";
  for (const m of motes) {
    const sx = m.x - cam.x, sy = m.y - cam.y;
    if (sx < -10 || sx > VIEW_W + 10 || sy < -10 || sy > VIEW_H + 10) continue;
    ctx.globalAlpha = 0.2 + 0.2 * Math.sin(G.t + m.ph);
    ctx.fillRect(sx, sy, m.s, m.s);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = player;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 40, (Math.random() - 0.5) * G.shake * 40);
  ctx.scale(p.face, 1);

  if (p.dashTime > 0) {
    ctx.fillStyle = "rgba(180,220,255,0.35)";
    for (let i = 0; i < 3; i++) ctx.fillRect(-34 - i * 10 - 4, -22, 18, 44);
  }

  const bob = p.grounded && Math.abs(p.vx) > 40 ? Math.sin(p.anim * 12) * 2 : 0;
  ctx.translate(0, bob);

  const hoodGrad = ctx.createLinearGradient(0, -34, 0, 26);
  hoodGrad.addColorStop(0, "#33334a");
  hoodGrad.addColorStop(1, "#1d1d30");
  ctx.fillStyle = hoodGrad;
  ctx.beginPath();
  ctx.moveTo(-13, 24);
  ctx.quadraticCurveTo(-16, -8, -6, -26);
  ctx.lineTo(8, -26);
  ctx.quadraticCurveTo(16, -4, 13, 24);
  ctx.quadraticCurveTo(0, 34, -13, 24);
  ctx.fill();

  ctx.fillStyle = "#161624";
  ctx.beginPath();
  ctx.moveTo(-10, 18);
  ctx.quadraticCurveTo(-4, 26, 4, 26);
  ctx.quadraticCurveTo(14, 24, 12, -14);
  ctx.lineTo(-10, -14);
  ctx.quadraticCurveTo(-12, 6, -10, 18);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(-2, -16, 2.6, 0, Math.PI * 2);
  ctx.arc(6, -16, 2.6, 0, Math.PI * 2);
  ctx.fill();

  if (p.focusing) {
    const pr = p.focusT / 0.9;
    ctx.strokeStyle = `rgba(180,230,255,${0.5 + pr * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + pr * 26 + Math.sin(G.t * 10) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const grd = ctx.createLinearGradient(0, 10, 0, 26);
  grd.addColorStop(0, "#3d3d58");
  grd.addColorStop(1, "#26263c");
  ctx.strokeStyle = grd;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  if (p.attacking) {
    const t = p.attackT;
    const a0 = -Math.PI / 3;
    const span = Math.PI / 1.6;
    const ang = a0 + (t / 0.26) * span;
    ctx.beginPath();
    ctx.arc(12, -2, 30, a0 + 0.2, ang);
    ctx.stroke();
    ctx.strokeStyle = "#cdffec";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(12 + Math.cos(ang) * 40, -2 + Math.sin(ang) * 40);
    ctx.stroke();
    ctx.fillStyle = "rgba(200,255,235,0.5)";
    ctx.beginPath();
    ctx.arc(12 + Math.cos(ang) * 40, -2 + Math.sin(ang) * 40, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-11, 22);
    ctx.quadraticCurveTo(-16, 18, -18, 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (e.type === "c") {
      ctx.fillStyle = "#3c3c56";
      ctx.strokeStyle = "#56568a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 8, e.w / 2, e.h / 2 - 2, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const lx = -e.w / 2 + 8 + i * 10;
        const sw = Math.sin(e.t * 14 + i * 2) * 4;
        ctx.strokeStyle = "#4c4c6e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const dy = e.dir > 0 ? sw : -sw;
        ctx.moveTo(lx, 2);
        ctx.lineTo(lx + 3 - dy, e.h / 2 - 2);
        ctx.stroke();
      }
      ctx.scale(e.dir, 1);
      ctx.fillStyle = "#e8e8f8";
      ctx.beginPath();
      ctx.arc(4, -2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath();
      ctx.arc(5, -2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.scale(e.dir, 1);
    } else if (e.type === "f") {
      const fl = Math.sin(e.t * 8);
      ctx.fillStyle = "rgba(150,190,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(-14, -4, 16, 8, -0.6 + fl * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(14, -4, 16, 8, 0.6 - fl * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c2c44";
      ctx.beginPath();
      ctx.ellipse(0, 2, 9, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd9e8";
      ctx.beginPath();
      ctx.arc(-4, -2, 2.4, 0, Math.PI * 2);
      ctx.arc(4, -2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#3a3a62";
      ctx.strokeStyle = "#5c5c9a";
      ctx.lineWidth = 3;
      const sq = e.grounded && Math.abs(e.vy) > 300 ? Math.sin(e.t * 20) * 0.15 : 1;
      ctx.save();
      ctx.scale(1 + sq * 0.4, 1 - sq * 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, e.w / 2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#d8d8ff";
      ctx.beginPath();
      ctx.arc(-4, -6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath();
      ctx.arc(-3.5, -6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.flash > 0) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(-e.w / 2 - 2, -e.h / 2 - 2, e.w + 4, e.h + 4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function drawParticles() {
  for (const pa of particles) {
    const k = pa.t / pa.life;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x - pa.size / 2 - cam.x, pa.y - pa.size / 2 - cam.y, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function draw() {
  ctx.save();
  drawBackground();
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawTileArt();
  drawBench();
  drawDoor();
  drawMotes();
  drawEnemies();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawVignette();
  ctx.restore();
}

let lastT = 0;
function loop(t) {
  const dt = Math.min(0.033, Math.max(0.0001, (t - lastT) / 1000));
  lastT = t;
  G.t += dt;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

$("playBtn").addEventListener("click", () => {
  mkAC();
  respawn();
  menuEl.classList.add("hidden");
  overEl.classList.add("hidden");
  winEl.classList.add("hidden");
  G.state = "playing";
  G.won = false;
  SFX.bench();
});
$("retryBtn").addEventListener("click", () => {
  mkAC();
  respawn();
  overEl.classList.add("hidden");
  G.state = "playing";
});
$("againBtn").addEventListener("click", () => {
  mkAC();
  respawn();
  G.lastBench = null;
  winEl.classList.add("hidden");
  G.state = "playing";
  G.won = false;
  SFX.bench();
});
$("resumeBtn").addEventListener("click", () => {
  pauseEl.classList.add("hidden");
  G.state = "playing";
});

window.addEventListener("keydown", (ev) => {
  if (ev.code === "Escape") {
    if (G.state === "playing") { G.state = "paused"; pauseEl.classList.remove("hidden"); }
    else if (G.state === "paused") { G.state = "playing"; pauseEl.classList.add("hidden"); }
  }
  if (G.state === "playing" && (ev.code === "Enter" || ev.code === "KeyP")) {
    if (ev.code === "Enter") { G.state = "paused"; pauseEl.classList.remove("hidden"); }
  }
});

updateHUD();
roomEl.textContent = roomName();
requestAnimationFrame(loop);