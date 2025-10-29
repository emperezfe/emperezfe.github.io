(function () {
  const canvas = document.getElementById('bg-canvas') || (() => {
    const c = document.createElement('canvas'); c.id = 'bg-canvas'; document.body.prepend(c); return c;
  })();
  const ctx = canvas.getContext('2d', { alpha: true });

  // -------- Tunables (video-game feel) --------
  let w = 0, h = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
  let target = 300;                           // base number of points (auto-scales on resize)

  // Points (hover/attraction)
  const BASE_ALPHA = 0.4;                     // opacidad base de cada punto
  const MAX_ALPHA  = 0.7;                     // opacidad máxima al estar cerca
  const DOT_R      = 3;                       // radio base del punto
  const MAX_SCALE  = 1.5;                     // escala máxima al estar cerca (1.5x)
  const INFLUENCE_R= 50;                      // radio de influencia del cursor
  const NOISE      = 0.01;                    // movimiento browniano cuando el ratón no está activo
  const FRICTION   = 0.965;                   // fricción global
  const FORCE      = 0.03;                    // fuerza de atracción hacia el cursor (↑ = llega antes)

  // >>> ÓRBITAS alrededor del cursor <<<
  const CAPTURE_R       = 12;       // distancia al cursor para “capturar” el punto en órbita
  const ORBIT_R_BASE    = 18;       // radio base de la órbita
  const ORBIT_R_JITTER  = 12;       // jitter +/- sobre el radio base (cada punto distinto)
  const ORBIT_SPEED_MIN = 0.0012;   // rad/ms (mín)
  const ORBIT_SPEED_MAX = 0.0032;   // rad/ms (máx)
  const ORBIT_EASE      = 0.22;     // facilidad con la que el punto se acerca a su objetivo orbital

  // Newcomers (puntos que entran desde bordes)
  const NEWCOMER_BASE_MS = 1000;              // ~cada 1 s
  const NEWCOMER_JITTER  = 500;               // +/- variación
  const EDGE_OFFSET      = 40, EDGE_INSET=80; // para que no “canten” al entrar
  const FADEIN_MS        = 1200;              // fundido de aparición

  // Pulse de reset
  const PULSE_DURATION = 700, PULSE_MAX_R = 240;

  // Rocket (PNG)
  const ROCKET_IMG_SRC = 'cuete.png';
  const ROCKET_SIZE    = 34;

  // Planets (SVG)
  const PLANET_MIN_MS  = 12000, PLANET_JITTER=8000;
  const PLANET_R_MIN   = 18, PLANET_R_MAX = 25;
  const PLANET_SPEED   = 0.4;
  const PLANET_SPIN_MIN= -0.5, PLANET_SPIN_MAX = 0.8; // rad/s (se aplicará por ms)

  // Fireball explosion (más rápida)
  const EXPLOSION_PARTS = 140;
  const EXPLOSION_MS    = 900;   // ↓ antes 1600
  const EMBERS_COUNT    = 36;

  // -------- State --------
  const pts = [];
  const trail = [];
  const pulses = [];
  const planets = [];
  const explosions = [];

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

  // Timers
  const mouse = { x: 0, y: 0, active: false };
  let rocket = null;
  let nextRocketAt  = performance.now() + 4000 + Math.random() * 4000;
  let nextNewcomers = performance.now() + NEWCOMER_BASE_MS + Math.random() * NEWCOMER_JITTER;
  let nextPlanet    = performance.now() + PLANET_MIN_MS + Math.random() * PLANET_JITTER;
  let last = performance.now();

  // -------- Helpers --------
  function makePoint(x, y, vx = 0, vy = 0, a = BASE_ALPHA, isNew = false) {
    return {
      x, y, vx, vy, a, ta: a, ox: x, oy: y, born: performance.now(),
      isNew, resetting:false,
      // Estado de órbita
      orbit:false,              // si está orbitando el cursor
      orbitR: 0,                // radio orbital (asignado al capturar)
      orbitAng: 0,              // ángulo actual
      orbitSpeed: 0             // rad/ms, puede ser horario o antihorario
    };
  }

  function seed(n){
    pts.length=0;
    for(let i=0;i<n;i++){
      pts.push(makePoint(
        Math.random()*w, Math.random()*h,
        (Math.random()-.5)*.2,(Math.random()-.5)*.2
      ));
    }
  }

  function resize(){
    w = innerWidth; h = innerHeight;
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    canvas.width = Math.floor(w*dpr); canvas.height = Math.floor(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    target = Math.max(200, Math.min(600, Math.floor((w*h)/4800)));
    if(pts.length===0) seed(target);
    else if(pts.length<target) for(let i=0;i<target-pts.length;i++) pts.push(makePoint(Math.random()*w,Math.random()*h));
    else pts.length = target;
  }
  addEventListener('resize', resize, {passive:true}); resize();

  function spawnNewcomers(){
    const n = Math.max(3, Math.floor(target*0.06));
    for(let i=0;i<n;i++){
      const e = Math.floor(Math.random()*4);
      let x,y,vx,vy;
      if(e===0){x=-EDGE_OFFSET; y=EDGE_INSET+Math.random()*(h-EDGE_INSET*2); vx=.6+Math.random()*.9; vy=(Math.random()-.5)*.6;}
      else if(e===1){x=w+EDGE_OFFSET; y=EDGE_INSET+Math.random()*(h-EDGE_INSET*2); vx=-(.6+Math.random()*.9); vy=(Math.random()-.5)*.6;}
      else if(e===2){x=EDGE_INSET+Math.random()*(w-EDGE_INSET*2); y=-EDGE_OFFSET; vx=(Math.random()-.5)*.6; vy=.6+Math.random()*.9;}
      else          {x=EDGE_INSET+Math.random()*(w-EDGE_INSET*2); y=h+EDGE_OFFSET; vx=(Math.random()-.5)*.6; vy=-(.6+Math.random()*.9);}
      const p = makePoint(x,y,vx,vy,0.0,true); p.ox=x; p.oy=y; pts.push(p);
    }
    nextNewcomers = performance.now() + NEWCOMER_BASE_MS + Math.random()*NEWCOMER_JITTER;
  }

  function spawnPlanet(){
    const r = PLANET_R_MIN + Math.random()*(PLANET_R_MAX-PLANET_R_MIN);
    const x = EDGE_INSET + r + Math.random()*(w - (EDGE_INSET+r)*2);
    const y = EDGE_INSET + r + Math.random()*(h - (EDGE_INSET+r)*2);
    const vx=(Math.random()-.5)*PLANET_SPEED, vy=(Math.random()-.5)*PLANET_SPEED;
    const spin=(PLANET_SPIN_MIN + Math.random()*(PLANET_SPIN_MAX-PLANET_SPIN_MIN))*0.001; // rad/ms
    planets.push({x,y,vx,vy,r,spin,angle:Math.random()*Math.PI*2});
    nextPlanet = performance.now() + PLANET_MIN_MS + Math.random()*PLANET_JITTER;
  }

  function explodePlanet(px,py,pr){
    for(let i=0;i<EXPLOSION_PARTS;i++){
      const ang=Math.random()*Math.PI*2, spd=1.2+Math.random()*3.8;
      const vx=Math.cos(ang)*spd, vy=Math.sin(ang)*spd;
      const baseHue=28+Math.random()*18, hotness=.75+Math.random()*.25, size=2.2+Math.random()*2.6;
      explosions.push({x:px,y:py,vx,vy,life:EXPLOSION_MS,baseHue,hotness,size,kind:'fire'});
    }
    for(let i=0;i<EMBERS_COUNT;i++){
      const ang=Math.random()*Math.PI*2, spd=.3+Math.random()*.9;
      const vx=Math.cos(ang)*spd, vy=Math.sin(ang)*spd-.15;
      explosions.push({x:px,y:py,vx,vy,life:EXPLOSION_MS+600,baseHue:18+Math.random()*10,hotness:.45+Math.random()*.25,size:1.6+Math.random()*1.2,kind:'ember'});
    }
    // shockwave
    for(const p of pts){
      const dx=p.x-px, dy=p.y-py, D=Math.hypot(dx,dy);
      if(D<pr*1.8 && D>0.001){ const f=(1-D/(pr*1.8))*1.6; p.vx+=(dx/D)*f; p.vy+=(dy/D)*f; }
    }
  }

  function launchRocket(){
    const left=Math.random()<.5, y=h*(.15+Math.random()*.7), speed=2.2+Math.random()*1.6;
    rocket={x:left?-60:w+60,y, vx:left?speed:-speed, vy:(Math.random()-.5)*.6, dir:left?1:-1};
  }

  function drawRocketPNG(x,y,vx,vy){
    const angle=Math.atan2(vy,vx);
    if(rocketImgReady && !rocketImgFailed){
      const imgW=ROCKET_SIZE, aspect=rocketImg.height?(rocketImg.height/rocketImg.width):1, imgH=imgW*aspect;
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
      ctx.drawImage(rocketImg,-imgW/2,-imgH/2,imgW,imgH);
      ctx.restore();
    } else {
      // fallback vector
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(-18,9); ctx.lineTo(-18,-9); ctx.closePath();
      ctx.fillStyle='#fff'; ctx.fill(); ctx.restore();
    }
  }

  // -------- Events --------
  addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; mouse.active=true; }, {passive:true});
  addEventListener('mouseleave', ()=>{ mouse.active=false; }, {passive:true});

  // LEFT click: explode planet if hit; else reset
  document.addEventListener('click', e=>{
    const mx=e.clientX, my=e.clientY;
    for(let i=planets.length-1;i>=0;i--){
      const pl=planets[i];
      if(Math.hypot(mx-pl.x,my-pl.y)<=pl.r){
        explodePlanet(pl.x,pl.y,pl.r);
        planets.splice(i,1);
        pulses.push({x:mx,y:my,start:performance.now()});
        return;
      }
    }
    // smooth reset (and kill newcomers)
    for(let i=pts.length-1;i>=0;i--){
      const p=pts[i];
      if(p.isNew){ pts.splice(i,1); continue; }
      p.resetting=true; p.vx=0; p.vy=0; p.orbit=false;
    }
    for(const t of trail) t.life=Math.min(t.life,300);
    rocket=null; nextRocketAt=performance.now()+3000+Math.random()*3000;
    pulses.push({x:mx,y:my,start:performance.now()});
  }, {passive:true});

  // -------- Frame --------
  function frame(t){
    const dt=Math.min(60,t-last); last=t;
    ctx.clearRect(0,0,w,h);

    if(performance.now()>nextNewcomers) spawnNewcomers();
    if(performance.now()>nextPlanet)    spawnPlanet();
    if(!rocket && t>nextRocketAt){ launchRocket(); nextRocketAt=t+9000+Math.random()*9000; }

    // Points
    ctx.fillStyle='#fff';
    for(let i=pts.length-1;i>=0;i--){
      const p=pts[i];

      if(p.resetting){
        const dx=p.ox-p.x, dy=p.oy-p.y; p.x+=dx*.12; p.y+=dy*.12;
        p.vx*=.85; p.vy*=.85;
        if(Math.abs(dx)<.5 && Math.abs(dy)<.5){
          p.x=p.ox; p.y=p.oy; p.vx=p.vy=0; p.resetting=false; p.a=BASE_ALPHA; p.isNew=false; p.orbit=false;
        }
      } else if(mouse.active){
        const dx=mouse.x-p.x, dy=mouse.y-p.y;
        const D=Math.hypot(dx,dy)+.0001;

        if(!p.orbit){
          // atracción normal dentro de la influencia
          const f=Math.min(INFLUENCE_R/D,2.2);
          p.vx+=(dx/D)*FORCE*f; p.vy+=(dy/D)*FORCE*f;

          // capturar en órbita cuando entra en CAPTURE_R
          if(D < CAPTURE_R){
            p.orbit = true;
            p.orbitR = ORBIT_R_BASE + (Math.random()*2 - 1) * ORBIT_R_JITTER;      // radio con jitter
            p.orbitAng = Math.random()*Math.PI*2;                                   // fase aleatoria
            const s = ORBIT_SPEED_MIN + Math.random()*(ORBIT_SPEED_MAX-ORBIT_SPEED_MIN);
            p.orbitSpeed = (Math.random()<0.5 ? -s : s);                             // sentido aleatorio
            p.vx *= 0.5; p.vy *= 0.5; // amortigua para que no “escape”
          }
        } else {
          // movimiento orbital: objetivo en circunferencia alrededor del cursor
          p.orbitAng += p.orbitSpeed * dt;
          const ox = mouse.x + Math.cos(p.orbitAng) * p.orbitR;
          const oy = mouse.y + Math.sin(p.orbitAng) * p.orbitR;

          p.x += (ox - p.x) * ORBIT_EASE;
          p.y += (oy - p.y) * ORBIT_EASE;

          // leve amortiguación de velocidad para evitar acumulación
          p.vx *= 0.85; 
          p.vy *= 0.85;

          // liberar si el cursor se aleja mucho
          if (Math.hypot(mouse.x - p.x, mouse.y - p.y) > INFLUENCE_R * 0.95) {
            p.orbit = false;
          }
        }
      } else {
        // sin cursor activo: vida normal
        p.vx+=(Math.random()-.5)*NOISE; p.vy+=(Math.random()-.5)*NOISE;
        // si estaba orbitando y el cursor se fue, libéralo
        if(p.orbit) p.orbit=false;
      }

      // integración
      p.vx*=FRICTION; p.vy*=FRICTION; p.x+=p.vx; p.y+=p.vy;

      // newcomer fade-in
      if(p.isNew && p.a<BASE_ALPHA){
        const k=Math.min(1,(performance.now()-p.born)/FADEIN_MS);
        p.a=BASE_ALPHA*k;
      }

      const dist = mouse.active ? Math.hypot(mouse.x-p.x, mouse.y-p.y) : Infinity;
      const near = Math.max(0, Math.min(1, 1 - dist/INFLUENCE_R));
      p.ta = BASE_ALPHA + near*(MAX_ALPHA-BASE_ALPHA);
      p.a += (p.ta - p.a)*0.15;

      const r = DOT_R * (1 + near*(MAX_SCALE-1));

      ctx.globalAlpha=p.a;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;

    // Planets
    for(let i=planets.length-1;i>=0;i--){
      const pl=planets[i];
      pl.x+=pl.vx; pl.y+=pl.vy; pl.angle+=pl.spin*dt;
      if(pl.x<-pl.r) pl.x=w+pl.r; if(pl.x>w+pl.r) pl.x=-pl.r;
      if(pl.y<-pl.r) pl.y=h+pl.r; if(pl.y>h+pl.r) pl.y=-pl.r;

      const size=pl.r*2;
      if(planetImgReady && !planetImgFailed){
        ctx.save(); ctx.translate(pl.x,pl.y); ctx.rotate(pl.angle);
        ctx.drawImage(planetImg, -size/2, -size/2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(pl.x,pl.y,pl.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fill();
        ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.stroke();
      }
      // halo
      ctx.globalAlpha=.08; ctx.beginPath(); ctx.arc(pl.x,pl.y,pl.r*1.5,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill(); ctx.globalAlpha=1;
    }

    // Explosions
    for(let i=explosions.length-1;i>=0;i--){
      const e=explosions[i];
      e.x+=e.vx; e.y+=e.vy; e.vx*=.985; e.vy*=.985; e.life-=dt;

      const totalLife=(e.kind==='ember')?(EXPLOSION_MS+600):EXPLOSION_MS;
      const k = 1 - Math.max(0, e.life/totalLife);

      const hue=e.baseHue-8*k, sat=92-12*k, lit=Math.max(18,72*e.hotness*(1-.45*k));
      const alpha=(e.kind==='ember'? .65 : .85)*(1-k);
      const radius=e.size*(1+.45*Math.sin(k*Math.PI));

      ctx.globalAlpha=Math.max(0,alpha*.35);
      ctx.beginPath(); ctx.arc(e.x,e.y,radius*1.8,0,Math.PI*2);
      ctx.fillStyle=`hsl(${hue} ${sat}% ${Math.max(30, lit-15)}%)`; ctx.fill();

      ctx.globalAlpha=Math.max(0,alpha);
      ctx.beginPath(); ctx.arc(e.x,e.y,radius,0,Math.PI*2);
      ctx.fillStyle=`hsl(${hue} ${sat}% ${lit}%)`; ctx.fill();
      ctx.globalAlpha=1;

      if(e.life<=0) explosions.splice(i,1);
    }

    // Trail (debajo del cohete)
    for(let i=trail.length-1;i>=0;i--){
      const tr=trail[i];
      if(mouse.active){
        const dx=mouse.x-tr.x, dy=mouse.y-tr.y, D=Math.hypot(dx,dy)+.001, inf=Math.min(120/D,2.0);
        tr.vx+=(dx/D)*.08*inf; tr.vy+=(dy/D)*.08*inf;
      }
      tr.vx*=.965; tr.vy*=.965; tr.x+=tr.vx; tr.y+=tr.vy;

      const a=Math.max(0, Math.min(1, tr.life/1600));
      const hue=((1600-tr.life)*0.3)%360;
      ctx.globalAlpha=.7*a;
      ctx.beginPath(); ctx.arc(tr.x,tr.y,2.8,0,Math.PI*2);
      ctx.fillStyle=`hsl(${hue} 90% 70%)`; ctx.fill();
      ctx.globalAlpha=1;

      tr.life-=dt; if(tr.life<=0) trail.splice(i,1);
    }

    // Rocket (encima)
    if(rocket){
      trail.push({x:rocket.x,y:rocket.y,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,life:1600});
      drawRocketPNG(rocket.x,rocket.y,rocket.vx,rocket.vy);
      rocket.x+=rocket.vx; rocket.y+=rocket.vy;
      if((rocket.dir>0 && rocket.x>w+80) || (rocket.dir<0 && rocket.x<-80)) rocket=null;
    }

    // Pulses
    for(let i=pulses.length-1;i>=0;i--){
      const p=pulses[i], age=performance.now()-p.start, tnorm=age/PULSE_DURATION;
      if(tnorm>=1){ pulses.splice(i,1); continue; }
      const pr=PULSE_MAX_R*tnorm, alpha=.25*(1-tnorm);
      ctx.globalAlpha=alpha; ctx.beginPath(); ctx.arc(p.x,p.y,pr,0,Math.PI*2);
      ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.globalAlpha=1;
    }

    // Visualización del área de influencia del cursor (encima de todo)
    if (mouse.active) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, INFLUENCE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, CAPTURE_R, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Top up
    if(pts.length<target){ const add=Math.min(8,target-pts.length); for(let i=0;i<add;i++) pts.push(makePoint(Math.random()*w,Math.random()*h)); }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
