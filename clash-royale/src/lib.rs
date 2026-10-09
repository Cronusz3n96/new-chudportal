// Clash Royale-style arena battler.
// All game logic lives in Rust and is compiled to wasm32-unknown-unknown.
// JS only reads a flat f32 state buffer out of linear memory and draws it.

use std::cell::RefCell;

const ARENA_W: f32 = 18.0;
const ARENA_H: f32 = 32.0;
const RIVER_Y0: f32 = 15.0;
const RIVER_Y1: f32 = 17.0;
const BRIDGES: [f32; 2] = [3.5, 14.5];

const ELIXIR_MAX: f32 = 10.0;
const ELIXIR_RATE: f32 = 1.0 / 2.8;
const MATCH_TIME: f32 = 180.0;

const T_PLAYER: u8 = 0;
const T_ENEMY: u8 = 1;

const HDR: usize = 12;

#[derive(Clone, Copy)]
struct CardDef {
    cost: i32,
    count: i32,
    hp: f32,
    dmg: f32,
    speed: f32,
    range: f32,
    atk_speed: f32,
    radius: f32,
    flying: bool,
    buildings_only: bool,
    ranged: bool,
}

const CARDS: [CardDef; 6] = [
    // Knight - tanky ground melee
    CardDef { cost: 3, count: 1, hp: 660.0, dmg: 75.0, speed: 1.05, range: 0.8, atk_speed: 1.2, radius: 0.55, flying: false, buildings_only: false, ranged: false },
    // Archers - squishy ranged pair
    CardDef { cost: 3, count: 2, hp: 125.0, dmg: 42.0, speed: 1.0, range: 5.0, atk_speed: 1.2, radius: 0.42, flying: false, buildings_only: false, ranged: true },
    // Giant - building-only tank
    CardDef { cost: 5, count: 1, hp: 2000.0, dmg: 120.0, speed: 0.75, range: 1.0, atk_speed: 1.5, radius: 0.75, flying: false, buildings_only: true, ranged: false },
    // Minions - flying trio
    CardDef { cost: 3, count: 3, hp: 190.0, dmg: 40.0, speed: 1.5, range: 1.6, atk_speed: 1.0, radius: 0.38, flying: true, buildings_only: false, ranged: false },
    // Goblins - cheap fast trio
    CardDef { cost: 2, count: 3, hp: 200.0, dmg: 50.0, speed: 1.6, range: 0.7, atk_speed: 1.1, radius: 0.38, flying: false, buildings_only: false, ranged: false },
    // Musketeer - long range single
    CardDef { cost: 4, count: 1, hp: 340.0, dmg: 95.0, speed: 1.0, range: 6.0, atk_speed: 1.1, radius: 0.45, flying: false, buildings_only: false, ranged: true },
];

struct Unit {
    id: u32,
    x: f32,
    y: f32,
    hp: f32,
    max_hp: f32,
    team: u8,
    card: u8,
    radius: f32,
    speed: f32,
    dmg: f32,
    range: f32,
    atk_speed: f32,
    atk_cd: f32,
    flying: bool,
    buildings_only: bool,
    ranged: bool,
    target: i32,
    retarget: f32,
    alive: bool,
}

impl Unit {
    fn spawn(id: u32, card: usize, team: u8, x: f32, y: f32) -> Unit {
        let d = CARDS[card];
        Unit {
            id,
            x,
            y,
            hp: d.hp,
            max_hp: d.hp,
            team,
            card: card as u8,
            radius: d.radius,
            speed: d.speed,
            dmg: d.dmg,
            range: d.range,
            atk_speed: d.atk_speed,
            atk_cd: 0.4,
            flying: d.flying,
            buildings_only: d.buildings_only,
            ranged: d.ranged,
            target: -1,
            retarget: 0.0,
            alive: true,
        }
    }
}

struct Tower {
    id: u32,
    x: f32,
    y: f32,
    radius: f32,
    hp: f32,
    max_hp: f32,
    team: u8,
    king: bool,
    range: f32,
    dmg: f32,
    atk_speed: f32,
    atk_cd: f32,
    active: bool,
    alive: bool,
}

impl Tower {
    fn new(id: u32, x: f32, y: f32, hp: f32, king: bool) -> Tower {
        Tower {
            id,
            x,
            y,
            radius: if king { 1.5 } else { 1.1 },
            hp,
            max_hp: hp,
            team: if id < 3 { T_ENEMY } else { T_PLAYER },
            king,
            range: if king { 7.0 } else { 7.5 },
            dmg: 50.0,
            atk_speed: if king { 1.0 } else { 0.8 },
            atk_cd: 0.0,
            active: !king,
            alive: true,
        }
    }
}

struct Proj {
    x: f32,
    y: f32,
    speed: f32,
    dmg: f32,
    team: u8,
    target: i32,
    alive: bool,
}

struct Game {
    units: Vec<Unit>,
    projectiles: Vec<Proj>,
    towers: [Tower; 6],
    elixir: [f32; 2],
    crowns: [i32; 2],
    time: f32,
    result: i32,
    rng: u32,
    ai_timer: f32,
    hands: [[usize; 4]; 2],
    next_cards: [usize; 2],
    cycles: [Vec<usize>; 2],
    next_unit_id: u32,
}

fn dist(x0: f32, y0: f32, x1: f32, y1: f32) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    (dx * dx + dy * dy).sqrt()
}

impl Game {
    fn new() -> Game {
        let mut g = Game {
            units: Vec::new(),
            projectiles: Vec::new(),
            towers: [
                Tower::new(0, 9.0, 3.0, 2400.0, true),
                Tower::new(1, 3.5, 6.5, 1400.0, false),
                Tower::new(2, 14.5, 6.5, 1400.0, false),
                Tower::new(3, 9.0, 29.0, 2400.0, true),
                Tower::new(4, 3.5, 25.5, 1400.0, false),
                Tower::new(5, 14.5, 25.5, 1400.0, false),
            ],
            elixir: [5.0, 5.0],
            crowns: [0, 0],
            time: 0.0,
            result: 0,
            rng: 0x9E37_79B9,
            ai_timer: 2.0,
            hands: [[0; 4]; 2],
            next_cards: [0; 2],
            cycles: [Vec::new(), Vec::new()],
            next_unit_id: 0,
        };
        for team in 0..2 {
            let mut deck: Vec<usize> = (0..CARDS.len()).collect();
            for i in (1..deck.len()).rev() {
                let j = (g.rand() * (i as f32 + 1.0)) as usize % (i + 1);
                deck.swap(i, j);
            }
            g.hands[team] = [deck[0], deck[1], deck[2], deck[3]];
            g.next_cards[team] = deck[4];
            g.cycles[team] = vec![deck[5]];
        }
        g
    }

    fn rand(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng as f32) / (u32::MAX as f32)
    }

    fn target_info(&self, id: i32) -> Option<(f32, f32, f32)> {
        if id < 0 {
            return None;
        }
        let idu = id as u32;
        if idu >= 1000 {
            self.units
                .iter()
                .find(|u| u.id == idu && u.alive)
                .map(|u| (u.x, u.y, u.radius))
        } else {
            self.towers
                .get(idu as usize)
                .filter(|t| t.alive)
                .map(|t| (t.x, t.y, t.radius))
        }
    }

    fn nearest_tower(&self, x: f32, y: f32, team: u8) -> i32 {        let mut best = -1i32;
        let mut bd = f32::MAX;
        for t in self.towers.iter() {
            if t.alive && t.team == team {
                let d = dist(x, y, t.x, t.y);
                if d < bd {
                    bd = d;
                    best = t.id as i32;
                }
            }
        }
        best
    }

    fn acquire_target(&self, u: &Unit) -> i32 {
        if u.buildings_only {
            return self.nearest_tower(u.x, u.y, 1 - u.team);
        }
        let mut best = -1i32;
        let mut bd = 6.0f32;
        for e in self.units.iter() {
            if !e.alive || e.team == u.team {
                continue;
            }
            if e.flying && !u.ranged && !u.flying {
                continue;
            }
            let d = dist(u.x, u.y, e.x, e.y);
            if d < bd {
                bd = d;
                best = e.id as i32;
            }
        }
        if best != -1 {
            return best;
        }
        self.nearest_tower(u.x, u.y, 1 - u.team)
    }

    fn apply_damage(&mut self, id: i32, dmg: f32) {
        if id < 0 {
            return;
        }
        let idu = id as u32;
        if idu >= 1000 {
            if let Some(u) = self.units.iter_mut().find(|u| u.id == idu && u.alive) {
                u.hp -= dmg;
                if u.hp <= 0.0 {
                    u.alive = false;
                }
            }
            return;
        }
        let idx = idu as usize;
        if idx >= self.towers.len() {
            return;
        }
        let (activate, destroyed, is_king, team) = {
            let t = &mut self.towers[idx];
            if !t.alive {
                return;
            }
            t.hp -= dmg;
            let destroyed = t.hp <= 0.0;
            if destroyed {
                t.alive = false;
            }
            (t.king || destroyed, destroyed, t.king, t.team)
        };
        if activate {
            let king_idx = if team == T_ENEMY { 0 } else { 3 };
            if let Some(k) = self.towers.get_mut(king_idx) {
                k.active = true;
            }
        }
        if destroyed {
            let atk = (1 - team) as usize;
            self.crowns[atk] += if is_king { 3 } else { 1 };
            if is_king {
                self.result = if atk == T_PLAYER as usize { 1 } else { 2 };
            }
        }
    }

    fn step_move(&mut self, i: usize, tx: f32, ty: f32, dt: f32) {
        let flying = self.units[i].flying;
        let ux = self.units[i].x;
        let uy = self.units[i].y;
        let spd = self.units[i].speed;
        let mut aimx = tx;
        let mut aimy = ty;
        if !flying {
            let crosses = (uy < RIVER_Y0 && ty > RIVER_Y1) || (uy > RIVER_Y1 && ty < RIVER_Y0);
            let bx = if (ux - BRIDGES[0]).abs() < (ux - BRIDGES[1]).abs() {
                BRIDGES[0]
            } else {
                BRIDGES[1]
            };
            if crosses {
                if (ux - bx).abs() > 0.3 {
                    aimx = bx;
                    aimy = if uy > RIVER_Y1 { RIVER_Y1 + 0.8 } else { RIVER_Y0 - 0.8 };
                } else {
                    aimx = bx;
                    aimy = if uy > RIVER_Y1 { RIVER_Y0 - 0.8 } else { RIVER_Y1 + 0.8 };
                }
            } else if uy >= RIVER_Y0 && uy <= RIVER_Y1 {
                aimx = bx;
                aimy = if ty < uy { uy - 1.0 } else if ty > uy { uy + 1.0 } else { ty };
            }
        }
        let dx = aimx - ux;
        let dy = aimy - uy;
        let l = (dx * dx + dy * dy).sqrt();
        if l > 0.0001 {
            let step = (spd * dt).min(l);
            let nx = ux + dx / l * step;
            let ny = uy + dy / l * step;
            self.units[i].x = nx.clamp(0.4, ARENA_W - 0.4);
            self.units[i].y = ny.clamp(0.4, ARENA_H - 0.4);
        }
    }

    fn update_units(&mut self, dt: f32) {
        let mut shots: Vec<(f32, f32, i32, f32, u8)> = Vec::new();
        let n = self.units.len();
        for i in 0..n {
            if !self.units[i].alive {
                continue;
            }
            self.units[i].atk_cd -= dt;
            self.units[i].retarget -= dt;
            let tgt = self.units[i].target;
            if self.units[i].retarget <= 0.0 || self.target_info(tgt).is_none() {
                let nt = self.acquire_target(&self.units[i]);
                self.units[i].target = nt;
                self.units[i].retarget = 0.4;
            }
            let tgt = self.units[i].target;
            let info = self.target_info(tgt);
            let ux = self.units[i].x;
            let uy = self.units[i].y;
            if let Some((tx, ty, tr)) = info {
                let d = dist(ux, uy, tx, ty);
                let reach = self.units[i].range + tr;
                if d <= reach {
                    if self.units[i].atk_cd <= 0.0 {
                        self.units[i].atk_cd = self.units[i].atk_speed;
                        if self.units[i].ranged {
                            shots.push((ux, uy, tgt, self.units[i].dmg, self.units[i].team));
                        } else {
                            self.apply_damage(tgt, self.units[i].dmg);
                        }
                    }
                } else {
                    self.step_move(i, tx, ty, dt);
                }
            } else {
                let king = if self.units[i].team == T_PLAYER { 0 } else { 3 };
                let tx = self.towers[king].x;
                let ty = self.towers[king].y;
                self.step_move(i, tx, ty, dt);
            }
        }
        for s in shots {
            self.projectiles.push(Proj { x: s.0, y: s.1, speed: 9.5, dmg: s.3, team: s.4, target: s.2, alive: true });
        }
    }

    fn update_towers(&mut self, dt: f32) {
        let mut shots: Vec<(f32, f32, i32, f32, u8)> = Vec::new();
        for idx in 0..self.towers.len() {
            if !self.towers[idx].alive || !self.towers[idx].active {
                continue;
            }
            self.towers[idx].atk_cd -= dt;
            let tx = self.towers[idx].x;
            let ty = self.towers[idx].y;
            let range = self.towers[idx].range;
            let team = self.towers[idx].team;
            let mut best = -1i32;
            let mut bd = range;
            for u in self.units.iter() {
                if u.alive && u.team != team {
                    let d = dist(tx, ty, u.x, u.y);
                    if d < bd {
                        bd = d;
                        best = u.id as i32;
                    }
                }
            }
            if best != -1 && self.towers[idx].atk_cd <= 0.0 {
                self.towers[idx].atk_cd = self.towers[idx].atk_speed;
                shots.push((tx, ty, best, self.towers[idx].dmg, team));
            }
        }
        for s in shots {
            self.projectiles.push(Proj { x: s.0, y: s.1, speed: 11.0, dmg: s.3, team: s.4, target: s.2, alive: true });
        }
    }

    fn update_projectiles(&mut self, dt: f32) {
        let mut hits: Vec<(i32, f32)> = Vec::new();
        let n = self.projectiles.len();
        for i in 0..n {
            if !self.projectiles[i].alive {
                continue;
            }
            let tgt = self.projectiles[i].target;
            let info = self.target_info(tgt);
            let (tx, ty) = match info {
                Some((x, y, _)) => (x, y),
                None => {
                    self.projectiles[i].alive = false;
                    continue;
                }
            };
            let px = self.projectiles[i].x;
            let py = self.projectiles[i].y;
            let spd = self.projectiles[i].speed;
            let dx = tx - px;
            let dy = ty - py;
            let l = (dx * dx + dy * dy).sqrt();
            if l <= 0.35 {
                hits.push((tgt, self.projectiles[i].dmg));
                self.projectiles[i].alive = false;
            } else {
                let step = (spd * dt).min(l);
                self.projectiles[i].x = px + dx / l * step;
                self.projectiles[i].y = py + dy / l * step;
            }
        }
        for (t, d) in hits {
            self.apply_damage(t, d);
        }
    }

    fn offsets(count: i32) -> Vec<(f32, f32)> {
        match count {
            1 => vec![(0.0, 0.0)],
            2 => vec![(-0.6, 0.0), (0.6, 0.0)],
            _ => vec![(-0.75, -0.45), (0.75, -0.45), (0.0, 0.55)],
        }
    }

    fn spawn_card(&mut self, card: usize, team: u8, cx: f32, cy: f32) -> i32 {
        let def = CARDS[card];
        if self.elixir[team as usize] < def.cost as f32 {
            return -1;
        }
        self.elixir[team as usize] -= def.cost as f32;
        let offs = Game::offsets(def.count);
        for (ox, oy) in offs {
            let jx = (self.rand() - 0.5) * 0.3;
            let jy = (self.rand() - 0.5) * 0.3;
            let x = (cx + ox + jx).clamp(0.6, ARENA_W - 0.6);
            let y = (cy + oy + jy).clamp(0.6, ARENA_H - 0.6);
            let id = 1000 + self.next_unit_id;
            self.next_unit_id += 1;
            self.units.push(Unit::spawn(id, card, team, x, y));
        }
        0
    }

    fn deploy_hand(&mut self, pos: usize, team: u8, cx: f32, cy: f32) -> i32 {
        if pos >= 4 {
            return -3;
        }
        let card = self.hands[team as usize][pos];
        if self.elixir[team as usize] < CARDS[card].cost as f32 {
            return -1;
        }
        let r = self.spawn_card(card, team, cx, cy);
        if r == 0 {
            let played = self.hands[team as usize][pos];
            self.hands[team as usize][pos] = self.next_cards[team as usize];
            let newn = self.cycles[team as usize].remove(0);
            self.next_cards[team as usize] = newn;
            self.cycles[team as usize].push(played);
        }
        r
    }

    fn update_ai(&mut self, dt: f32) {
        self.ai_timer -= dt;
        if self.ai_timer > 0.0 {
            return;
        }
        self.ai_timer = 1.2 + self.rand() * 1.8;
        let e = T_ENEMY as usize;
        let affordable: Vec<usize> = (0..4)
            .filter(|&p| self.elixir[e] >= CARDS[self.hands[e][p]].cost as f32)
            .collect();
        if affordable.is_empty() {
            return;
        }
        if self.elixir[e] < 4.0 && self.rand() < 0.55 {
            return;
        }
        let pos = affordable[(self.rand() * affordable.len() as f32) as usize % affordable.len()];
        let mut threat: Option<(f32, f32)> = None;
        let mut bd = f32::MAX;
        for u in self.units.iter() {
            if u.alive && u.team == T_PLAYER && u.y < 18.0 {
                if u.y < bd {
                    bd = u.y;
                    threat = Some((u.x, u.y));
                }
            }
        }
        let (cx, cy) = match threat {
            Some((x, y)) => (x, (y - 1.2).clamp(4.0, 14.0)),
            None => {
                let lane = if self.rand() < 0.5 { BRIDGES[0] } else { BRIDGES[1] };
                (lane, 12.5)
            }
        };
        self.deploy_hand(pos, T_ENEMY, cx, cy);
    }

    fn player_deploy(&mut self, pos: usize, x: f32, y: f32) -> i32 {
        if self.result != 0 {
            return -3;
        }
        if pos >= 4 {
            return -3;
        }
        let x = x.clamp(0.6, ARENA_W - 0.6);
        let y = y.clamp(0.6, ARENA_H - 0.6);
        if y < 17.0 {
            return -2;
        }
        self.deploy_hand(pos, T_PLAYER, x, y)
    }

    fn lowest_tower_frac(&self, team: u8) -> f32 {
        let mut best = f32::MAX;
        let mut any = false;
        for t in self.towers.iter() {
            if t.alive && t.team == team {
                any = true;
                let f = t.hp / t.max_hp;
                if f < best {
                    best = f;
                }
            }
        }
        if any { best } else { 0.0 }
    }

    fn tick(&mut self, dt: f32) {
        if self.result != 0 {
            return;
        }
        let dt = dt.clamp(0.0, 0.05);
        self.time += dt;
        if self.time >= MATCH_TIME {
            self.result = if self.crowns[0] > self.crowns[1] {
                1
            } else if self.crowns[1] > self.crowns[0] {
                2
            } else {
                let f0 = self.lowest_tower_frac(T_PLAYER);
                let f1 = self.lowest_tower_frac(T_ENEMY);
                if f0 < f1 {
                    2
                } else if f1 < f0 {
                    1
                } else {
                    3
                }
            };
            return;
        }
        self.elixir[0] = (self.elixir[0] + ELIXIR_RATE * dt).min(ELIXIR_MAX);
        self.elixir[1] = (self.elixir[1] + ELIXIR_RATE * dt).min(ELIXIR_MAX);
        self.update_units(dt);
        self.update_towers(dt);
        self.update_projectiles(dt);
        self.units.retain(|u| u.alive);
        self.projectiles.retain(|p| p.alive);
        self.update_ai(dt);
    }

    fn write_state(&self, buf: &mut Vec<f32>) {
        buf.clear();
        buf.push(self.elixir[0]);
        buf.push(self.elixir[1]);
        buf.push(self.time);
        buf.push(self.result as f32);
        let alive_towers = self.towers.iter().filter(|t| t.alive).count();
        let count = self.units.len() + alive_towers + self.projectiles.len();
        buf.push(count as f32);
        for k in 0..4 {
            buf.push(self.hands[0][k] as f32);
        }
        buf.push(self.next_cards[0] as f32);
        buf.push(self.crowns[0] as f32);
        buf.push(self.crowns[1] as f32);
        debug_assert_eq!(buf.len(), HDR);
        for u in self.units.iter() {
            buf.push(u.x);
            buf.push(u.y);
            buf.push(u.hp);
            buf.push(u.max_hp);
            buf.push(u.team as f32);
            buf.push(0.0);
            buf.push(u.card as f32);
            buf.push(u.radius);
        }
        for t in self.towers.iter() {
            if !t.alive {
                continue;
            }
            buf.push(t.x);
            buf.push(t.y);
            buf.push(t.hp);
            buf.push(t.max_hp);
            buf.push(t.team as f32);
            buf.push(if t.king { 2.0 } else { 1.0 });
            buf.push(0.0);
            buf.push(if t.active { 1.0 } else { 0.0 });
        }
        for p in self.projectiles.iter() {
            buf.push(p.x);
            buf.push(p.y);
            buf.push(0.0);
            buf.push(0.0);
            buf.push(p.team as f32);
            buf.push(3.0);
            buf.push(0.0);
            buf.push(0.0);
        }
    }
}

thread_local! {
    static GAME: RefCell<Game> = RefCell::new(Game::new());
    static STATE: RefCell<Vec<f32>> = RefCell::new(vec![0.0; HDR]);
}

#[no_mangle]
pub extern "C" fn init() {
    GAME.with(|g| *g.borrow_mut() = Game::new());
}

#[no_mangle]
pub extern "C" fn reset() {
    init();
}

#[no_mangle]
pub extern "C" fn tick(dt: f32) {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.tick(dt);
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            g.write_state(&mut s);
        });
    });
}

#[no_mangle]
pub extern "C" fn state_ptr() -> u32 {
    STATE.with(|s| s.borrow().as_ptr() as u32)
}

#[no_mangle]
pub extern "C" fn state_len() -> u32 {
    STATE.with(|s| s.borrow().len() as u32)
}

#[no_mangle]
pub extern "C" fn elixir() -> f32 {
    GAME.with(|g| g.borrow().elixir[0])
}

#[no_mangle]
pub extern "C" fn result() -> i32 {
    GAME.with(|g| g.borrow().result)
}

#[no_mangle]
pub extern "C" fn deploy(hand_pos: u32, x: f32, y: f32) -> i32 {
    GAME.with(|g| g.borrow_mut().player_deploy(hand_pos as usize, x, y))
}
