(function () {
  const canvas = document.getElementById('bg-canvas') || (() => {
    const c = document.createElement('canvas'); c.id = 'bg-canvas'; document.body.prepend(c); return c;
  })();
  const ctx = canvas.getContext('2d', { alpha: true });

  // -------- Tunables --------
  let w = 0, h = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
  let target = 300;

  // Points
  const BASE_ALPHA = 0.4;
  const MAX_ALPHA  = 0.75;
  const DOT_R      = 2.5;
  const MAX_SCALE  = 2.0;
  const INFLUENCE_R= 70;
  const NOISE      = 0.008;
  const FRICTION   = 0.965;
  const FORCE      = 0.018;

  // Orbits
  const CAPTURE_R       = 28;
  const ORBIT_R_BASE    = 55;
  const ORBIT_R_JITTER  = 40;
  const ORBIT_SPEED_MIN = 0.0008;
  const ORBIT_SPEED_MAX = 0.0025;
  const ORBIT_EASE      = 0.10;
  const MAX_ORBITING    = 18;

  // Newcomers
  const NEWCOMER_BASE_MS = 3500;
  const NEWCOMER_JITTER  = 2000;
  const EDGE_OFFSET      = 40, EDGE_INSET = 80;
  const FADEIN_MS        = 1200;

  // Pulse
  const PULSE_DURATION = 700, PULSE_MAX_R = 240;

  // Rocket
  const ROCKET_IMG_SRC = 'cuete.png';
  const ROCKET_SIZE    = 58;

  // Planets
  const PLANET_MIN_MS  = 12000, PLANET_JITTER = 8000;
  const PLANET_R_MIN   = 18, PLANET_R_MAX = 25;
  const PLANET_SPEED   = 0.4;
  const PLANET_SPIN_MIN= -0.5, PLANET_SPIN_MAX = 0.8;

  // Explosion
  const EXPLOSION_PARTS = 140;
  const EXPLOSION_MS    = 900;
  const EMBERS_COUNT    = 36;

  // Cursor trail
  const CURSOR_TRAIL_LIFE  = 420;  // ms
  const CURSOR_TRAIL_SPEED = 3.5;  // velocidad mínima para emitir

  // Drag (clic sostenido)
  const DRAG_R     = 100;
  const DRAG_FORCE = 0.055;

  // Right-click repulsion
  const REPULSE_R     = 170;
  const REPULSE_FORCE = 3.2;

  // Tide (deriva en bordes)
  const TIDE_ZONE  = 160;
  const TIDE_FORCE = 0.0015;

  // -------- State --------
  const pts = [];
  const trail = [];
  const pulses = [];
  const planets = [];
  const explosions = [];
  const cursorTrail = [];

  // Assets
  const rocketImg = new Image();
  let rocketImgReady = false, rocketImgFailed = false;
  rocketImg.onload = () => rocketImgReady = true;
  rocketImg.onerror = () => rocketImgFailed = true;
  rocketImg.src = ROCKET_IMG_SRC;

  const planetImg = new Image();
  let planetImgReady = false, planetImgFailed = false;
  planetImg.onload = () => planetImgReady = true;
  planetImg.onerror = () => planetImgFailed = true;
  planetImg.src = 'planet-miscellaneous-svgrepo-com.svg';

  // Mouse state (vx/vy = velocidad del movimiento, decae entre frames)
  const mouse = { x: 0, y: 0, active: false, vx: 0, vy: 0, down: false };
  let rocket = null;
  let nextRocketAt  = performance.now() + 4000 + Math.random() * 4000;
  let nextNewcomers = performance.now() + NEWCOMER_BASE_MS + Math.random() * NEWCOMER_JITTER;
  let nextPlanet    = performance.now() + PLANET_MIN_MS + Math.random() * PLANET_JITTER;
  let last = performance.now();

  // -------- Helpers --------
  function makePoint(x, y, vx = 0, vy = 0, a = BASE_ALPHA, isNew = false) {
    return {
      x, y, vx, vy, a, ta: a, ox: x, oy: y, born: performance.now(),
      isNew, resetting: false, _near: 0,
      // 20% de los puntos llevan un tinte de color suave
      hue: Math.random() < 0.20 ? Math.random() * 360 : null,
      // Órbita
      orbit: false, orbitR: 0, orbitAng: 0, orbitSpeed: 0
    };
  }

  function seed(n) {
    pts.length = 0;
    for (let i = 0; i < n; i++) {
      pts.push(makePoint(
        Math.random() * w, Math.random() * h,
        (Math.random() - .5) * .2, (Math.random() - .5) * .2
      ));
    }
  }

  function resize() {
    w = innerWidth; h = innerHeight;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    target = 200;
    if (pts.length === 0) seed(target);
    else if (pts.length < target) for (let i = 0; i < target - pts.length; i++) pts.push(makePoint(Math.random() * w, Math.random() * h));
    else pts.length = target;
  }
  addEventListener('resize', resize, { passive: true }); resize();

  function spawnNewcomers() {
    const n = Math.min(2, Math.max(1, Math.floor(target * 0.02)));
    for (let i = 0; i < n; i++) {
      const e = Math.floor(Math.random() * 4);
      let x, y, vx, vy;
      if (e === 0)      { x = -EDGE_OFFSET; y = EDGE_INSET + Math.random() * (h - EDGE_INSET * 2); vx = .6 + Math.random() * .9; vy = (Math.random() - .5) * .6; }
      else if (e === 1) { x = w + EDGE_OFFSET; y = EDGE_INSET + Math.random() * (h - EDGE_INSET * 2); vx = -(.6 + Math.random() * .9); vy = (Math.random() - .5) * .6; }
      else if (e === 2) { x = EDGE_INSET + Math.random() * (w - EDGE_INSET * 2); y = -EDGE_OFFSET; vx = (Math.random() - .5) * .6; vy = .6 + Math.random() * .9; }
      else              { x = EDGE_INSET + Math.random() * (w - EDGE_INSET * 2); y = h + EDGE_OFFSET; vx = (Math.random() - .5) * .6; vy = -(.6 + Math.random() * .9); }
      const p = makePoint(x, y, vx, vy, 0.0, true); p.ox = x; p.oy = y; pts.push(p);
    }
    nextNewcomers = performance.now() + NEWCOMER_BASE_MS + Math.random() * NEWCOMER_JITTER;
  }

  function spawnPlanet() {
    const r = PLANET_R_MIN + Math.random() * (PLANET_R_MAX - PLANET_R_MIN);
    const x = EDGE_INSET + r + Math.random() * (w - (EDGE_INSET + r) * 2);
    const y = EDGE_INSET + r + Math.random() * (h - (EDGE_INSET + r) * 2);
    const vx = (Math.random() - .5) * PLANET_SPEED, vy = (Math.random() - .5) * PLANET_SPEED;
    const spin = (PLANET_SPIN_MIN + Math.random() * (PLANET_SPIN_MAX - PLANET_SPIN_MIN)) * 0.001;
    planets.push({ x, y, vx, vy, r, spin, angle: Math.random() * Math.PI * 2 });
    nextPlanet = performance.now() + PLANET_MIN_MS + Math.random() * PLANET_JITTER;
  }

  // rainbow=true → explosión arcoíris (para el cohete)
  function explodePlanet(px, py, pr, rainbow = false) {
    for (let i = 0; i < EXPLOSION_PARTS; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 4.4;
      const vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd;
      const baseHue = rainbow ? Math.random() * 360 : 28 + Math.random() * 18;
      const hotness = .75 + Math.random() * .25, size = 2.2 + Math.random() * 2.6;
      explosions.push({ x: px, y: py, vx, vy, life: EXPLOSION_MS, baseHue, hotness, size, kind: rainbow ? 'rainbow' : 'fire' });
    }
    for (let i = 0; i < EMBERS_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2, spd = .3 + Math.random() * .9;
      const vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd - .15;
      const baseHue = rainbow ? Math.random() * 360 : 18 + Math.random() * 10;
      explosions.push({ x: px, y: py, vx, vy, life: EXPLOSION_MS + 600, baseHue, hotness: .45 + Math.random() * .25, size: 1.6 + Math.random() * 1.2, kind: rainbow ? 'rainbow-ember' : 'ember' });
    }
    // shockwave
    for (const p of pts) {
      const dx = p.x - px, dy = p.y - py, D = Math.hypot(dx, dy);
      if (D < pr * 1.8 && D > 0.001) { const f = (1 - D / (pr * 1.8)) * 1.6; p.vx += (dx / D) * f; p.vy += (dy / D) * f; }
    }
  }

  function launchRocket() {
    const left = Math.random() < .5, y = h * (.15 + Math.random() * .7), speed = 2.2 + Math.random() * 1.6;
    rocket = { x: left ? -80 : w + 80, y, vx: left ? speed : -speed, vy: (Math.random() - .5) * .6, dir: left ? 1 : -1 };
  }

  function drawRocketPNG(x, y, vx, vy) {
    const angle = Math.atan2(vy, vx);
    if (rocketImgReady && !rocketImgFailed) {
      const imgW = ROCKET_SIZE, aspect = rocketImg.height ? (rocketImg.height / rocketImg.width) : 1, imgH = imgW * aspect;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.drawImage(rocketImg, -imgW / 2, -imgH / 2, imgW, imgH);
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-22, 11); ctx.lineTo(-22, -11); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    }
  }

  // -------- Events --------
  addEventListener('mousemove', e => {
    mouse.vx = e.clientX - mouse.x;
    mouse.vy = e.clientY - mouse.y;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  }, { passive: true });
  addEventListener('mouseleave', () => { mouse.active = false; mouse.down = false; }, { passive: true });
  addEventListener('mousedown', () => { mouse.down = true; });
  addEventListener('mouseup',   () => { mouse.down = false; });

  // Touch
  addEventListener('touchmove', e => {
    const t = e.touches[0];
    mouse.vx = t.clientX - mouse.x;
    mouse.vy = t.clientY - mouse.y;
    mouse.x = t.clientX; mouse.y = t.clientY; mouse.active = true; mouse.down = true;
  }, { passive: true });
  addEventListener('touchend', () => { mouse.active = false; mouse.down = false; }, { passive: true });

  // Right-click → repulsión
  document.addEventListener('contextmenu', e => {
    e.preventDefault();
    const mx = e.clientX, my = e.clientY;
    for (const p of pts) {
      const dx = p.x - mx, dy = p.y - my, D = Math.hypot(dx, dy) + 0.001;
      if (D < REPULSE_R) {
        const f = (1 - D / REPULSE_R) * REPULSE_FORCE;
        p.vx += (dx / D) * f; p.vy += (dy / D) * f;
        if (p.orbit) { p.orbit = false; }
      }
    }
    pulses.push({ x: mx, y: my, start: performance.now() });
  });

  // Left click → explotar cohete (arcoíris) o planeta
  document.addEventListener('click', e => {
    const mx = e.clientX, my = e.clientY;

    if (rocket && Math.hypot(mx - rocket.x, my - rocket.y) < 44) {
      explodePlanet(rocket.x, rocket.y, 20, true); // ← arcoíris
      pulses.push({ x: rocket.x, y: rocket.y, start: performance.now() });
      rocket = null; nextRocketAt = performance.now() + 5000 + Math.random() * 5000;
      return;
    }

    for (let i = planets.length - 1; i >= 0; i--) {
      const pl = planets[i];
      if (Math.hypot(mx - pl.x, my - pl.y) <= pl.r) {
        explodePlanet(pl.x, pl.y, pl.r);
        planets.splice(i, 1);
        pulses.push({ x: mx, y: my, start: performance.now() });
        return;
      }
    }
  }, { passive: true });

  // -------- Frame --------
  function frame(t) {
    const dt = Math.min(60, t - last); last = t;
    ctx.clearRect(0, 0, w, h);

    // Decaimiento de velocidad del ratón entre frames
    mouse.vx *= 0.75; mouse.vy *= 0.75;

    if (performance.now() > nextNewcomers) spawnNewcomers();
    if (performance.now() > nextPlanet)    spawnPlanet();
    if (!rocket && t > nextRocketAt) { launchRocket(); nextRocketAt = t + 9000 + Math.random() * 9000; }

    // Cursor trail — emitir cuando el ratón va rápido
    if (mouse.active) {
      const spd = Math.hypot(mouse.vx, mouse.vy);
      if (spd > CURSOR_TRAIL_SPEED) {
        const count = Math.min(3, Math.ceil(spd / 5));
        for (let i = 0; i < count; i++) {
          cursorTrail.push({
            x: mouse.x + (Math.random() - .5) * 3,
            y: mouse.y + (Math.random() - .5) * 3,
            vx: -mouse.vx * 0.07 + (Math.random() - .5) * 0.5,
            vy: -mouse.vy * 0.07 + (Math.random() - .5) * 0.5,
            life: CURSOR_TRAIL_LIFE,
            hue: (performance.now() * 0.35) % 360
          });
        }
      }
    }

    // Points — física
    let orbitCount = 0; for (const p of pts) if (p.orbit) orbitCount++;

    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];

      if (p.resetting) {
        const dx = p.ox - p.x, dy = p.oy - p.y; p.x += dx * .12; p.y += dy * .12;
        p.vx *= .85; p.vy *= .85;
        if (Math.abs(dx) < .5 && Math.abs(dy) < .5) {
          p.x = p.ox; p.y = p.oy; p.vx = p.vy = 0; p.resetting = false; p.a = BASE_ALPHA; p.isNew = false; p.orbit = false;
        }
      } else if (mouse.active) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const D = Math.hypot(dx, dy) + .0001;

        if (!p.orbit) {
          const f = Math.min(INFLUENCE_R / D, 2.2);
          p.vx += (dx / D) * FORCE * f; p.vy += (dy / D) * FORCE * f;
          if (D < CAPTURE_R && orbitCount < MAX_ORBITING) {
            p.orbit = true; orbitCount++;
            p.orbitR = ORBIT_R_BASE + (Math.random() * 2 - 1) * ORBIT_R_JITTER;
            p.orbitAng = Math.random() * Math.PI * 2;
            const s = ORBIT_SPEED_MIN + Math.random() * (ORBIT_SPEED_MAX - ORBIT_SPEED_MIN);
            p.orbitSpeed = (Math.random() < 0.5 ? -s : s);
            p.vx *= 0.5; p.vy *= 0.5;
          }
        } else {
          p.orbitAng += p.orbitSpeed * dt;
          const ox = mouse.x + Math.cos(p.orbitAng) * p.orbitR;
          const oy = mouse.y + Math.sin(p.orbitAng) * p.orbitR;
          p.x += (ox - p.x) * ORBIT_EASE; p.y += (oy - p.y) * ORBIT_EASE;
          p.vx *= 0.85; p.vy *= 0.85;
          if (D > ORBIT_R_BASE + ORBIT_R_JITTER + 40) { p.orbit = false; orbitCount--; }
        }

        // Drag: clic sostenido arrastra en la dirección del movimiento
        if (mouse.down && !p.orbit) {
          const dspd = Math.hypot(mouse.vx, mouse.vy);
          if (dspd > 0.5 && D < DRAG_R) {
            const str = (1 - D / DRAG_R) * DRAG_FORCE;
            p.vx += mouse.vx * str; p.vy += mouse.vy * str;
          }
        }
      } else {
        p.vx += (Math.random() - .5) * NOISE; p.vy += (Math.random() - .5) * NOISE;
        if (p.orbit) { p.orbit = false; orbitCount--; }
      }

      p.vx *= FRICTION; p.vy *= FRICTION; p.x += p.vx; p.y += p.vy;

      if (p.isNew && p.a < BASE_ALPHA) {
        const k = Math.min(1, (performance.now() - p.born) / FADEIN_MS);
        p.a = BASE_ALPHA * k;
      }

      const dist = mouse.active ? Math.hypot(mouse.x - p.x, mouse.y - p.y) : Infinity;
      p._near = Math.max(0, Math.min(1, 1 - dist / INFLUENCE_R));
      p.ta = BASE_ALPHA + p._near * (MAX_ALPHA - BASE_ALPHA);
      p.a += (p.ta - p.a) * 0.15;
    }

    // Tide — deriva suave cuando el cursor está cerca de un borde
    if (mouse.active) {
      const tx = mouse.x < TIDE_ZONE ? -(1 - mouse.x / TIDE_ZONE) :
                 mouse.x > w - TIDE_ZONE ? (mouse.x - (w - TIDE_ZONE)) / TIDE_ZONE : 0;
      const ty = mouse.y < TIDE_ZONE ? -(1 - mouse.y / TIDE_ZONE) :
                 mouse.y > h - TIDE_ZONE ? (mouse.y - (h - TIDE_ZONE)) / TIDE_ZONE : 0;
      if (tx !== 0 || ty !== 0) {
        for (const p of pts) {
          if (!p.orbit && !p.resetting) { p.vx += tx * TIDE_FORCE; p.vy += ty * TIDE_FORCE; }
        }
      }
    }

    // Points — render
    // Pass 1: dots blancos en reposo → batch único
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = BASE_ALPHA;
    ctx.beginPath();
    for (const p of pts) {
      if (p._near < 0.05 && p.hue === null) { ctx.moveTo(p.x + DOT_R, p.y); ctx.arc(p.x, p.y, DOT_R, 0, Math.PI * 2); }
    }
    ctx.fill();
    // Pass 2: dots iluminados o con color → individuales
    for (const p of pts) {
      if (p._near >= 0.05 || p.hue !== null) {
        const r = DOT_R * (1 + p._near * (MAX_SCALE - 1));
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.hue !== null ? `hsl(${p.hue} 32% 78%)` : '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Planets
    for (let i = planets.length - 1; i >= 0; i--) {
      const pl = planets[i];
      pl.x += pl.vx; pl.y += pl.vy; pl.angle += pl.spin * dt;
      if (mouse.active) {
        const pdx = pl.x - mouse.x, pdy = pl.y - mouse.y, pD = Math.hypot(pdx, pdy) + 0.001;
        if (pD < 90) { const f = (1 - pD / 90) * 0.05; pl.vx += (pdx / pD) * f; pl.vy += (pdy / pD) * f; }
      }
      pl.vx *= 0.985; pl.vy *= 0.985;
      if (pl.x < -pl.r) pl.x = w + pl.r; if (pl.x > w + pl.r) pl.x = -pl.r;
      if (pl.y < -pl.r) pl.y = h + pl.r; if (pl.y > h + pl.r) pl.y = -pl.r;

      const size = pl.r * 2;
      if (planetImgReady && !planetImgFailed) {
        ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.angle);
        ctx.drawImage(planetImg, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke();
      }
      ctx.globalAlpha = .08; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
    }

    // Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.x += e.vx; e.y += e.vy; e.vx *= .985; e.vy *= .985; e.life -= dt;

      const isRainbow = e.kind === 'rainbow' || e.kind === 'rainbow-ember';
      const totalLife = (e.kind === 'ember' || e.kind === 'rainbow-ember') ? (EXPLOSION_MS + 600) : EXPLOSION_MS;
      const k = 1 - Math.max(0, e.life / totalLife);

      const hue = isRainbow ? (e.baseHue + k * 180) % 360 : e.baseHue - 8 * k;
      const sat = isRainbow ? 90 : 92 - 12 * k;
      const lit = isRainbow ? 68 : Math.max(18, 72 * e.hotness * (1 - .45 * k));
      const alpha = (e.kind === 'ember' || e.kind === 'rainbow-ember' ? .65 : .85) * (1 - k);
      const radius = e.size * (1 + .45 * Math.sin(k * Math.PI));

      ctx.globalAlpha = Math.max(0, alpha * .35);
      ctx.beginPath(); ctx.arc(e.x, e.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue} ${sat}% ${Math.max(30, lit - 15)}%)`; ctx.fill();

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue} ${sat}% ${lit}%)`; ctx.fill();
      ctx.globalAlpha = 1;

      if (e.life <= 0) explosions.splice(i, 1);
    }

    // Trail del cohete
    for (let i = trail.length - 1; i >= 0; i--) {
      const tr = trail[i];
      if (mouse.active) {
        const dx = mouse.x - tr.x, dy = mouse.y - tr.y, D = Math.hypot(dx, dy) + .001, inf = Math.min(120 / D, 2.0);
        tr.vx += (dx / D) * .08 * inf; tr.vy += (dy / D) * .08 * inf;
      }
      tr.vx *= .965; tr.vy *= .965; tr.x += tr.vx; tr.y += tr.vy;

      const a = Math.max(0, Math.min(1, tr.life / 1600));
      const hue = ((1600 - tr.life) * 0.3) % 360;
      ctx.globalAlpha = .7 * a;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue} 90% 70%)`; ctx.fill();
      ctx.globalAlpha = 1;

      tr.life -= dt; if (tr.life <= 0) trail.splice(i, 1);
    }

    // Rocket
    if (rocket) {
      trail.push({ x: rocket.x, y: rocket.y, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, life: 1600 });
      drawRocketPNG(rocket.x, rocket.y, rocket.vx, rocket.vy);
      rocket.x += rocket.vx; rocket.y += rocket.vy;
      if ((rocket.dir > 0 && rocket.x > w + 80) || (rocket.dir < 0 && rocket.x < -80)) rocket = null;
    }

    // Cursor trail — render (partículas de color al mover rápido)
    for (let i = cursorTrail.length - 1; i >= 0; i--) {
      const tr = cursorTrail[i];
      tr.x += tr.vx; tr.y += tr.vy; tr.vx *= 0.88; tr.vy *= 0.88;
      tr.life -= dt;
      if (tr.life <= 0) { cursorTrail.splice(i, 1); continue; }
      const a = (tr.life / CURSOR_TRAIL_LIFE) * 0.7;
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${tr.hue} 80% 70%)`;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], age = performance.now() - p.start, tnorm = age / PULSE_DURATION;
      if (tnorm >= 1) { pulses.splice(i, 1); continue; }
      const pr = PULSE_MAX_R * tnorm, alpha = .25 * (1 - tnorm);
      ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    }

    // Top up
    if (pts.length < target) { const add = Math.min(8, target - pts.length); for (let i = 0; i < add; i++) pts.push(makePoint(Math.random() * w, Math.random() * h)); }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
