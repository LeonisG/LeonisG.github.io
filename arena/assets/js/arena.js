(function () {
  'use strict';

  const { Engine, Runner, Bodies, Body, World, Events, Vector } = Matter;

  // ── Canvas (fixed 9:16 resolution, CSS scales for display) ────────
  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const CW = 540, CH = 960;
  canvas.width = CW;
  canvas.height = CH;

  // ── Seeded PRNG (Mulberry32) ──────────────────────────────────────
  function makePRNG(seed) {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return function () {
      h |= 0; h = h + 0x6D2B79F5 | 0;
      let t = Math.imul(h ^ h >>> 15, 1 | h);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Color palettes ────────────────────────────────────────────────
  const PALETTE = [
    '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#06b6d4', '#e11d48', '#8b5cf6', '#10b981', '#f43f5e',
    '#0ea5e9', '#fbbf24', '#4ade80', '#fb923c', '#c084fc',
    '#34d399', '#f87171', '#60a5fa', '#a78bfa', '#facc15',
    '#2dd4bf', '#e879f9', '#fb7185', '#38bdf8', '#a3e635',
    '#fb923c', '#64748b',
  ];

  const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e'];
  const TEAM_NAMES  = ['RED',     'BLUE',    'GREEN'];

  // ── Simulation state ──────────────────────────────────────────────
  const S = {
    phase: 'idle',   // idle | running | paused | done
    engine: null,
    runner: null,
    rafId:  null,
    cfg:    null,
    rng:    null,
    balls:       [],  // { body, hp, maxHp, color, team, num, alive, radius, hitFlash }
    elimAnims:   [],  // { x, y, r, alpha, color }
    walls:       {},  // { top, bottom, left, right }
    shrinkPx:    0,
    nextShrinkAt: 0,
    winnerBalls: [],
  };

  // ── Read UI config ────────────────────────────────────────────────
  function readCfg() {
    return {
      seed:   document.getElementById('seed').value.trim() || 'lastonearena',
      count:  +document.getElementById('count').value,
      mode:   document.getElementById('mode').value,
      speed:  +document.getElementById('speed').value,
      hp:     +document.getElementById('hp').value,
      damage: +document.getElementById('damage').value,
      gravity: +document.getElementById('gravity').value,
      size:   +document.getElementById('size').value,
    };
  }

  // ── Start / Restart ───────────────────────────────────────────────
  function startSim() {
    if (S.rafId) cancelAnimationFrame(S.rafId);
    if (S.engine) {
      Runner.stop(S.runner);
      World.clear(S.engine.world);
      Engine.clear(S.engine);
    }

    const cfg = readCfg();
    Object.assign(S, {
      cfg, rng: makePRNG(cfg.seed),
      balls: [], elimAnims: [], walls: {},
      shrinkPx: 0,
      nextShrinkAt: performance.now() + 4500,
      winnerBalls: [],
      phase: 'running',
    });

    document.getElementById('seed-display').textContent = cfg.seed;
    document.getElementById('btn-pause').textContent = '⏸ PAUSE';

    S.engine = Engine.create({ gravity: { y: cfg.gravity } });
    S.engine.timing.timeScale = cfg.speed;
    S.runner = Runner.create();

    buildWalls();
    spawnBalls(cfg);
    bindCollisions(cfg);
    Runner.run(S.runner, S.engine);
    loop();
  }

  // ── Walls ─────────────────────────────────────────────────────────
  const WT = 55; // wall thickness

  function buildWalls() {
    const opts = { isStatic: true, restitution: 0.55, friction: 0.04, label: 'wall' };
    S.walls.top    = Bodies.rectangle(CW / 2,    -WT / 2,       CW + WT * 2, WT, opts);
    S.walls.bottom = Bodies.rectangle(CW / 2,  CH + WT / 2,     CW + WT * 2, WT, opts);
    S.walls.left   = Bodies.rectangle(-WT / 2,    CH / 2,       WT, CH + WT * 2, opts);
    S.walls.right  = Bodies.rectangle(CW + WT / 2, CH / 2,      WT, CH + WT * 2, opts);
    World.add(S.engine.world, Object.values(S.walls));
  }

  // ── Balls ─────────────────────────────────────────────────────────
  function spawnBalls(cfg) {
    const rng     = S.rng;
    const baseR   = (CW * 0.036) * cfg.size;
    const isTeams = cfg.mode === 'teams2' || cfg.mode === 'teams3';
    const tc      = cfg.mode === 'teams3' ? 3 : 2;

    // Evenly-distributed grid to avoid initial overlaps
    const cols  = Math.ceil(Math.sqrt(cfg.count * (CW / CH)));
    const rows  = Math.ceil(cfg.count / cols);
    const cellW = (CW - baseR * 4) / cols;
    const cellH = (CH * 0.78 - baseR * 4) / rows;

    for (let i = 0; i < cfg.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = baseR * 2 + cellW * (col + 0.5) + (rng() - 0.5) * cellW * 0.38;
      const y = baseR * 2 + cellH * (row + 0.5) + (rng() - 0.5) * cellH * 0.38;

      const body = Bodies.circle(x, y, baseR, {
        restitution: 0.84,
        friction:    0.04,
        frictionAir: 0.008,
        density:     0.002,
        label: 'ball',
      });

      // Initial random kick
      const spd   = (2.5 + rng() * 4.5) * (CW / 540);
      const angle = rng() * Math.PI * 2;
      Body.setVelocity(body, { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd });

      const team  = isTeams ? i % tc : 0;
      const color = isTeams ? TEAM_COLORS[team] : PALETTE[i % PALETTE.length];

      S.balls.push({
        body, hp: cfg.hp, maxHp: cfg.hp,
        team, color, num: i + 1,
        alive: true, radius: baseR, hitFlash: 0,
      });
      World.add(S.engine.world, body);
    }
  }

  // ── Collision / Damage ────────────────────────────────────────────
  function bindCollisions(cfg) {
    Events.on(S.engine, 'collisionStart', evt => {
      if (S.phase !== 'running') return;
      for (const pair of evt.pairs) {
        const ba = S.balls.find(b => b.body === pair.bodyA && b.alive);
        const bb = S.balls.find(b => b.body === pair.bodyB && b.alive);
        if (!ba || !bb) continue;

        const isTeams = cfg.mode === 'teams2' || cfg.mode === 'teams3';
        if (isTeams && ba.team === bb.team) continue;

        const rv = Vector.magnitude(Vector.sub(pair.bodyA.velocity, pair.bodyB.velocity));
        const MIN_IMPACT = 1.6;
        if (rv < MIN_IMPACT) continue;

        const dmg = (rv - MIN_IMPACT) * 6.5 * cfg.damage;
        hit(ba, dmg);
        hit(bb, dmg);
      }
    });
  }

  function hit(ball, dmg) {
    if (!ball.alive) return;
    ball.hp = Math.max(0, ball.hp - dmg);
    ball.hitFlash = 8;
    if (ball.hp <= 0) eliminate(ball);
  }

  function eliminate(ball) {
    if (!ball.alive) return;
    ball.alive = false;
    const p = ball.body.position;
    S.elimAnims.push({ x: p.x, y: p.y, r: ball.radius, alpha: 1, color: ball.color });
    World.remove(S.engine.world, ball.body);
    checkEnd();
  }

  function checkEnd() {
    const alive   = S.balls.filter(b => b.alive);
    const isTeams = S.cfg.mode === 'teams2' || S.cfg.mode === 'teams3';
    let done = false;

    if (isTeams) {
      const teamsLeft = new Set(alive.map(b => b.team));
      done = teamsLeft.size <= 1;
    } else {
      done = alive.length <= 1;
    }

    if (done) {
      S.winnerBalls = alive;
      S.phase = 'done';
      Runner.stop(S.runner);
    }
  }

  // ── Shrink ────────────────────────────────────────────────────────
  function tickShrink(now) {
    if (S.cfg.mode !== 'shrink') return;
    if (now < S.nextShrinkAt) return;
    const MAX = CW * 0.36;
    if (S.shrinkPx >= MAX) return;

    S.shrinkPx = Math.min(S.shrinkPx + CW * 0.042, MAX);
    S.nextShrinkAt = now + 3200;

    const s = S.shrinkPx;
    Body.setPosition(S.walls.top,    { x: CW / 2, y: s - WT / 2 });
    Body.setPosition(S.walls.bottom, { x: CW / 2, y: CH - s + WT / 2 });
    Body.setPosition(S.walls.left,   { x: s - WT / 2, y: CH / 2 });
    Body.setPosition(S.walls.right,  { x: CW - s + WT / 2, y: CH / 2 });
  }

  // Gentle nudge to prevent balls from going fully static
  function boostSluggish() {
    const MIN_SPD = 0.9;
    for (const b of S.balls) {
      if (!b.alive) continue;
      const v = b.body.velocity;
      if (Math.sqrt(v.x * v.x + v.y * v.y) < MIN_SPD && S.rng() < 0.0015) {
        const a = S.rng() * Math.PI * 2;
        Body.applyForce(b.body, b.body.position, {
          x: Math.cos(a) * 0.012,
          y: Math.sin(a) * 0.012,
        });
      }
    }
  }

  // ── Render loop ───────────────────────────────────────────────────
  function loop() {
    const now = performance.now();
    if (S.phase === 'running') {
      tickShrink(now);
      boostSluggish();
    }
    render();
    S.rafId = requestAnimationFrame(loop);
  }

  function render() {
    drawBG();
    if (S.shrinkPx > 0)           drawShrinkZone();
    if (S.phase !== 'idle')        drawBalls();
    drawElimAnims();
    if (S.phase !== 'idle' && S.phase !== 'done') drawHUD();
    if (S.phase === 'idle')        drawIdleScreen();
    if (S.phase === 'paused')      drawPausedOverlay();
    if (S.phase === 'done')        drawWinnerScreen();
  }

  // ── Draw: background ──────────────────────────────────────────────
  function drawBG() {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, CW, CH);
    // Subtle center glow
    const g = ctx.createRadialGradient(CW / 2, CH * 0.45, CH * 0.15, CW / 2, CH * 0.45, CH * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.025)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }

  // ── Draw: shrink danger zone ──────────────────────────────────────
  function drawShrinkZone() {
    const s = S.shrinkPx;
    ctx.fillStyle = 'rgba(239,68,68,0.09)';
    ctx.fillRect(0,       0,       CW, s);
    ctx.fillRect(0,  CH - s,       CW, s);
    ctx.fillRect(0,       s,        s, CH - s * 2);
    ctx.fillRect(CW - s,  s,        s, CH - s * 2);
    ctx.strokeStyle = 'rgba(239,68,68,0.7)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(s, s, CW - s * 2, CH - s * 2);
  }

  // ── Draw: balls ───────────────────────────────────────────────────
  function drawBalls() {
    for (const b of S.balls) {
      if (!b.alive) continue;
      const { x, y } = b.body.position;
      const r = b.radius;

      // Hit flash glow
      if (b.hitFlash > 0) {
        b.hitFlash--;
        ctx.save();
        ctx.shadowColor = '#fff';
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
        ctx.restore();
      }

      // Drop shadow
      ctx.beginPath();
      ctx.arc(x + 2.5, y + 4, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fill();

      // Ball body — radial gradient for 3D feel
      const grad = ctx.createRadialGradient(
        x - r * 0.32, y - r * 0.32, r * 0.04,
        x, y, r
      );
      grad.addColorStop(0, lighten(b.color, 55));
      grad.addColorStop(0.55, b.color);
      grad.addColorStop(1,   darken(b.color, 28));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Number label
      const fs = Math.max(11, r * 0.86);
      ctx.font = `800 ${fs}px system-ui`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(b.num, x + 0.8, y + 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.num, x, y);

      // Health bar
      drawHBar(x, y - r - 7, r * 2, b.hp / b.maxHp);
    }
  }

  function drawHBar(cx, cy, w, ratio) {
    const h = 5, x = cx - w / 2;
    // Track
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(x - 1, cy - 1, w + 2, h + 2, 2);
    ctx.fill();
    // Fill
    const col = ratio > 0.6 ? '#22c55e' : ratio > 0.3 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = col;
    rr(x, cy, Math.max(1, w * ratio), h, 2);
    ctx.fill();
  }

  // ── Draw: elimination animations ──────────────────────────────────
  function drawElimAnims() {
    for (let i = S.elimAnims.length - 1; i >= 0; i--) {
      const a = S.elimAnims[i];
      const expand = (1 - a.alpha) * 2.8;
      // Expanding ring
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * (1 + expand), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hexRgb(a.color)},${a.alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      // Inner flash
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * a.alpha * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.alpha * 0.38})`;
      ctx.fill();
      a.alpha -= 0.038;
      if (a.alpha <= 0) S.elimAnims.splice(i, 1);
    }
  }

  // ── Draw: HUD ─────────────────────────────────────────────────────
  function drawHUD() {
    const alive = S.balls.filter(b => b.alive).length;
    const total = S.balls.length;

    // Remaining counter — top center
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    ctx.font = '800 52px system-ui';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(alive, CW / 2 + 2, 16 + 2);
    ctx.fillStyle = alive <= 3 ? '#ef4444' : '#ffffff';
    ctx.fillText(alive, CW / 2, 16);

    ctx.font = '600 20px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(`/ ${total}`, CW / 2, 73);

    // Teams: progress bars at bottom
    if (S.cfg.mode === 'teams2' || S.cfg.mode === 'teams3') {
      drawTeamBars();
    }
  }

  function drawTeamBars() {
    const tc = S.cfg.mode === 'teams3' ? 3 : 2;
    const maxPerTeam = Math.ceil(S.cfg.count / tc);
    const barW = CW * 0.26;
    const barH = 10;
    const gap  = 14;
    const totalW = barW * tc + gap * (tc - 1);
    let bx = (CW - totalW) / 2;
    const by = CH - 56;

    for (let i = 0; i < tc; i++) {
      const count = S.balls.filter(b => b.alive && b.team === i).length;
      const ratio = count / maxPerTeam;
      // Track
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rr(bx - 1, by - 1, barW + 2, barH + 2, 3);
      ctx.fill();
      // Fill
      ctx.fillStyle = TEAM_COLORS[i];
      rr(bx, by, Math.max(2, barW * ratio), barH, 3);
      ctx.fill();
      // Count
      ctx.font = '700 15px system-ui';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = TEAM_COLORS[i];
      ctx.fillText(count, bx + barW / 2, by - 4);
      bx += barW + gap;
    }
  }

  // ── Draw: idle / paused / winner screens ──────────────────────────
  function drawIdleScreen() {
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 46px system-ui';
    ctx.fillStyle = '#b9ef45';
    ctx.fillText('LAST ONE', CW / 2, CH / 2 - 30);
    ctx.fillText('ARENA', CW / 2, CH / 2 + 28);
    ctx.font = '400 19px system-ui';
    ctx.fillStyle = '#333';
    ctx.fillText('Configure & press START', CW / 2, CH / 2 + 92);
  }

  function drawPausedOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(0, 0, CW, CH);
    ctx.font = '800 50px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText('PAUSED', CW / 2, CH / 2);
  }

  function drawWinnerScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, CW, CH);

    const winners = S.winnerBalls;
    if (!winners.length) {
      ctx.font = '700 36px system-ui';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#555';
      ctx.fillText('NO WINNER', CW / 2, CH / 2);
      return;
    }

    const col   = winners[0].color;
    const isT   = S.cfg.mode === 'teams2' || S.cfg.mode === 'teams3';
    const cx    = CW / 2;
    const cy    = CH * 0.37;
    const bigR  = CW * 0.21;

    // Glow
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur  = 70;
    const g = ctx.createRadialGradient(cx - bigR * 0.3, cy - bigR * 0.3, bigR * 0.05, cx, cy, bigR);
    g.addColorStop(0, lighten(col, 60));
    g.addColorStop(1, col);
    ctx.beginPath();
    ctx.arc(cx, cy, bigR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // Number / count inside ball
    ctx.font = `800 ${Math.floor(bigR * 0.9)}px system-ui`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(isT ? winners.length : winners[0].num, cx, cy);

    // "WINNER" label
    ctx.font = '800 54px system-ui';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('WINNER', cx, cy + bigR + 22);

    // Sub line
    ctx.font = '600 24px system-ui';
    ctx.fillStyle = col;
    if (isT) {
      const tName = TEAM_NAMES[winners[0].team];
      ctx.fillText(`TEAM ${tName} · ${winners.length} survived`, cx, cy + bigR + 88);
    } else {
      ctx.fillText(`Ball #${winners[0].num}`, cx, cy + bigR + 88);
    }

    // Restart hint (small, bottom)
    ctx.font = '400 17px system-ui';
    ctx.fillStyle = '#333';
    ctx.fillText('Press RESTART for a new battle', cx, CH - 44);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  // Rounded rect path (compatible with all browsers)
  function rr(x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }

  function darken(hex, amt) { return lighten(hex, -amt); }

  function hexRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `${n >> 16},${(n >> 8) & 0xff},${n & 0xff}`;
  }

  // ── UI bindings ───────────────────────────────────────────────────
  document.getElementById('btn-start').onclick = () => {
    if (S.phase === 'idle' || S.phase === 'done') startSim();
  };

  document.getElementById('btn-restart').onclick = () => {
    document.getElementById('btn-pause').textContent = '⏸ PAUSE';
    startSim();
  };

  document.getElementById('btn-pause').onclick = function () {
    if (S.phase === 'running') {
      S.phase = 'paused';
      Runner.stop(S.runner);
      this.textContent = '▶ RESUME';
    } else if (S.phase === 'paused') {
      S.phase = 'running';
      Runner.run(S.runner, S.engine);
      this.textContent = '⏸ PAUSE';
    }
  };

  document.getElementById('speed').onchange = function () {
    if (S.engine) S.engine.timing.timeScale = +this.value;
  };

  document.getElementById('btn-present').onclick = function () {
    document.body.classList.toggle('present');
    const on = document.body.classList.contains('present');
    this.classList.toggle('active', on);
    this.textContent = on ? '✕ EXIT RECORD MODE' : '▶ RECORD MODE';
  };

  // ── Boot ──────────────────────────────────────────────────────────
  // Draw idle screen immediately (no loop yet, single paint)
  drawBG();
  drawIdleScreen();

})();
