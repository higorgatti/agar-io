/* =====================
   Agar Mobile — Refactor (clean, complete)
   ===================== */

/* ===== Canvas, UI, State ===== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const ui = document.getElementById('ui');
const startPane = document.getElementById('start');
const overPane = document.getElementById('over');
const minimapWrap = document.getElementById('minimapWrap');
const mobileBtns = document.getElementById('mobileBtns');

/* ===== Constantes ===== */
const MAX_DPR = 3;
const WORLD = { w: 2400, h: 1800 };
const FRUITS = ['🍎','🍌','🍇','🍓','🍊'];
const MAX_SPLITS = 8;
const INITIAL_MASS = 12;
const RAGE_MS = 10000;
const ENEMY_EAT = 1.15;   // fator p/ comer
const PLAYER_DIE = 1.10;  // fator p/ morrer para inimigo

/* ===== Utils ===== */
const now = () => Date.now();
const dist = (x1,y1,x2,y2) => Math.hypot(x1-x2, y1-y2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rand = (a,b) => a + Math.random()*(b-a);
function massToRadius(m){ return Math.sqrt(Math.max(0.0001,m))*2+5; }
function speedFromRadius(r){ return 12/Math.sqrt(r+30); }

/* ===== Estado ===== */
let W = innerWidth, H = innerHeight, DPR = Math.min(MAX_DPR, (window.devicePixelRatio||1));
let gameRunning=false, score=0;
let player, enemies=[], food=[], powerUps=[], pellets=[], particles=[];
let camera={x:WORLD.w/2, y:WORLD.h/2, zoom:1};
let moveTarget=null, lastTap=0, splitEnd=0;

/* ===== Ajuste canvas ===== */
function fit(){
  W = innerWidth; H = innerHeight; DPR = Math.min(MAX_DPR, (window.devicePixelRatio||1));
  canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', fit, {passive:true}); fit();

/* ===== Player helpers ===== */
function playerCells(){ return player.split ? player.splitBalls : [player]; }
function totalPlayerMass(){ return playerCells().reduce((s,c)=>s+c.mass,0); }
function playerCentroid(){
  const cells = playerCells();
  const tm = totalPlayerMass() || 1;
  let x=0, y=0; for(const c of cells){ x += c.x*c.mass; y += c.y*c.mass; }
  return { x:x/tm, y:y/tm };
}
function applyMassGainToPlayer(totalGain){
  const cells = playerCells();
  const tm = totalPlayerMass() || 1;
  for(const c of cells){ const share = c.mass/tm; c.mass+=totalGain*share; c.radius=massToRadius(c.mass); }
}

/* ===== Spawns / Reset ===== */
function spawnEnemy(){
  const types = ['basic','aggressive','cautious','speedy','tank','hunter'];
  const type = types[Math.floor(Math.random()*types.length)];
  let e = {
    x: Math.random()*WORLD.w, y: Math.random()*WORLD.h,
    mass: 20+Math.random()*50, radius:0, vx:0, vy:0,
    behavior:'wander', target:null, fearLevel:0, lastThink:0,
    type, blinkTimer: Math.random()*1000, animPhase: Math.random()*6.28
  };
  switch(type){
    case 'basic': e.color=`hsl(${200+Math.random()*60},60%,50%)`; e.baseSpeed=0.3; e.aggressiveness=0.3; break;
    case 'aggressive': e.color=`hsl(${0+Math.random()*30},70%,50%)`; e.mass=30+Math.random()*40; e.baseSpeed=0.4; e.aggressiveness=0.8; break;
    case 'cautious': e.color=`hsl(${180+Math.random()*40},55%,60%)`; e.mass=15+Math.random()*25; e.baseSpeed=0.25; e.aggressiveness=0.1; break;
    case 'speedy': e.color=`hsl(${60+Math.random()*40},65%,55%)`; e.mass=10+Math.random()*20; e.baseSpeed=0.6; e.aggressiveness=0.4; break;
    case 'tank': e.color=`hsl(${280+Math.random()*40},50%,45%)`; e.mass=50+Math.random()*60; e.baseSpeed=0.15; e.aggressiveness=0.2; break;
    case 'hunter': e.color=`hsl(${120+Math.random()*40},70%,45%)`; e.mass=25+Math.random()*35; e.baseSpeed=0.35; e.aggressiveness=0.6; break;
  }
  e.radius = massToRadius(e.mass);
  enemies.push(e);
}
function spawnRageBonus(){
  powerUps.push({ x:Math.random()*WORLD.w, y:Math.random()*WORLD.h, radius:15, type:'rage', color:'#FF006E', emoji:'😡', pulse: Math.random()*6.28 });
}
function safeSpawnRageLater(){
  const delay = 3000 + Math.random()*5000;
  setTimeout(()=>{ if (gameRunning) spawnRageBonus(); }, delay);
}
function randFruit(){
  const emoji = FRUITS[Math.floor(Math.random()*FRUITS.length)];
  return { x:Math.random()*WORLD.w, y:Math.random()*WORLD.h, radius:10, emoji };
}
function reset(){
  player = { x:WORLD.w/2, y:WORLD.h/2, mass:INITIAL_MASS, radius:massToRadius(INITIAL_MASS), vx:0, vy:0,
             split:false, splitBalls:[], rageMode:false, rageEnd:0 };
  enemies=[]; food=[]; powerUps=[]; pellets=[]; particles=[];
  for(let i=0;i<320;i++) food.push(randFruit());
  for(let i=0;i<25;i++) spawnEnemy();
  for(let i=0;i<5;i++) spawnRageBonus();
  score=0; splitEnd=0; moveTarget=null;
}

/* ===== Enemy AI ===== */
function updateEnemyAI(e, t){
  if(t - e.lastThink < 150) return; e.lastThink = t;
  const {x:pX,y:pY} = playerCentroid();
  const {vx:pVx, vy:pVy} = (function(){ // average velocity
    const cells = playerCells(); let vx=0, vy=0;
    for(const c of cells){ vx += (c.vx||0); vy += (c.vy||0); }
    const n = Math.max(1, cells.length); return { vx:vx/n, vy:vy/n };
  })();

  const dToPlayer = dist(e.x,e.y,pX,pY);
  let predict = 1.0;
  if(e.type==='hunter') predict=1.5; else if(e.type==='aggressive') predict=1.2; else if(e.type==='cautious') predict=0.8; else if(e.type==='speedy') predict=0.7;
  predict *= Math.min(2.0, dToPlayer/100);
  const predicted = { x: pX + pVx*predict*60, y: pY + pVy*predict*60 };

  e.fearLevel = Math.max(0, e.fearLevel - 0.5);

  // caçar inimigos menores próximos
  let targetEnemy=null, closest=Infinity;
  for(const o of enemies){
    if(o===e) continue;
    const d = dist(e.x,e.y,o.x,o.y);
    if(e.mass > o.mass*1.3 && d<250 && d<closest){ targetEnemy=o; closest=d; }
  }
  if(targetEnemy){
    e.behavior='hunt_enemy';
    const tVx = targetEnemy.vx||0, tVy = targetEnemy.vy||0;
    e.target = { x: targetEnemy.x + tVx*0.8*60, y: targetEnemy.y + tVy*0.8*60 };
    return;
  }

  const pMass = totalPlayerMass();
  if(dToPlayer < 300){
    if(player.rageMode){ e.behavior='flee'; e.target=predicted; e.fearLevel=5; }
    else if(e.mass > pMass*1.2){ e.behavior='chase'; e.target=predicted; }
    else if(pMass > e.mass*1.5){ e.behavior='flee'; e.target=predicted; e.fearLevel=3; }
    else { e.behavior='hunt_food'; }
  } else e.behavior='hunt_food';

  if(e.behavior==='hunt_food'){
    let closestF=null, cd=Infinity;
    for(const f of food){
      const d=dist(e.x,e.y,f.x,f.y);
      if(d<200 && d<cd){ closestF=f; cd=d; }
    }
    if(closestF) e.target={x:closestF.x, y:closestF.y};
    else e.behavior='wander';
  }
}
function moveEnemyAI(e){
  let targetX=e.x, targetY=e.y;
  let speed=(e.baseSpeed||0.3)*(30/(e.radius+10));
  if(e.type==='aggressive') speed*=1.3; else if(e.type==='cautious' && e.behavior==='flee') speed*=1.6;
  else if(e.type==='speedy') speed*=1.8; else if(e.type==='tank') speed*=0.7; else if(e.type==='hunter') speed*=1.2;

  switch(e.behavior){
    case 'hunt_enemy': if(e.target){ targetX=e.target.x; targetY=e.target.y; speed*=1.5; } break;
    case 'chase':      if(e.target){ targetX=e.target.x; targetY=e.target.y; speed*=1.3; } break;
    case 'flee':
      if(e.target){
        const dx=e.x-e.target.x, dy=e.y-e.target.y, d=Math.hypot(dx,dy)||1;
        targetX = e.x + (dx/d)*120; targetY = e.y + (dy/d)*120; speed *= (1.4 + e.fearLevel*0.1);
      } break;
    case 'hunt_food':  if(e.target){ targetX=e.target.x; targetY=e.target.y; } break;
    default:           targetX = e.x + (Math.random()-0.5)*80; targetY = e.y + (Math.random()-0.5)*80; speed *= 0.8;
  }

  const margin = e.radius + 50;
  if(e.x < margin) targetX = e.x + 120;
  if(e.x > WORLD.w - margin) targetX = e.x - 120;
  if(e.y < margin) targetY = e.y + 120;
  if(e.y > WORLD.h - margin) targetY = e.y - 120;

  const dx=targetX-e.x, dy=targetY-e.y, d=Math.hypot(dx,dy)||1;
  const ax=(dx/d)*speed, ay=(dy/d)*speed;
  e.vx=(e.vx*0.75)+(ax*0.25); e.vy=(e.vy*0.75)+(ay*0.25);
  const v=Math.hypot(e.vx,e.vy), maxS=speed;
  if(v>maxS){ e.vx=(e.vx/v)*maxS; e.vy=(e.vy/v)*maxS; }
}

/* ===== Controle Mobile ===== */
document.addEventListener('touchmove', (e)=>{ if (window.__GAME_RUNNING__) e.preventDefault(); }, {passive:false});
canvas.addEventListener('touchstart', (e)=>{
  if(!gameRunning) return;
  const t = now(); if(t-lastTap<250){ splitPlayer(); } lastTap=t;
  const touch=e.touches[0]; const r=canvas.getBoundingClientRect();
  const x=(touch.clientX-r.left)*(W/r.width), y=(touch.clientY-r.top)*(H/r.height);
  const cx=W*0.5, cy=H*0.5; const wx=((x-cx)/camera.zoom)+camera.x, wy=((y-cy)/camera.zoom)+camera.y;
  moveTarget={x:wx,y:wy};
},{passive:false});
canvas.addEventListener('touchmove', (e)=>{
  if(!gameRunning) return;
  const touch=e.touches[0]; const r=canvas.getBoundingClientRect();
  const x=(touch.clientX-r.left)*(W/r.width), y=(touch.clientY-r.top)*(H/r.height);
  const cx=W*0.5, cy=H*0.5; const wx=((x-cx)/camera.zoom)+camera.x, wy=((y-cy)/camera.zoom)+camera.y;
  moveTarget={x:wx,y:wy};
},{passive:false});

document.getElementById('btnStart').onclick = startGame;
document.getElementById('btnRestart').onclick = startGame;
document.getElementById('btnSplit').onclick = ()=>{ if(gameRunning) splitPlayer(); };
document.getElementById('btnEject').onclick = ()=>{ if(gameRunning) ejectMass(); };

/* ===== Game Flow ===== */
function startGame(){
  reset();
  gameRunning=true; window.__GAME_RUNNING__=true;
  startPane.classList.add('hidden'); overPane.classList.add('hidden');
  ui.classList.remove('hidden'); minimapWrap.classList.remove('hidden'); mobileBtns.classList.remove('hidden');
  requestAnimationFrame(loop);
}
function endGame(){
  gameRunning=false; window.__GAME_RUNNING__=false;
  ui.classList.add('hidden'); minimapWrap.classList.add('hidden'); mobileBtns.classList.add('hidden');
  document.getElementById('finalScore').textContent=score;
  document.getElementById('finalMass').textContent=Math.floor(totalPlayerMass());
  overPane.classList.remove('hidden');
}

/* ===== Movimento ===== */
function getTarget(){ return moveTarget ? {x:moveTarget.x, y:moveTarget.y} : playerCentroid(); }
function movePlayer(){
  const t = getTarget();
  const cells = playerCells();

  for(const c of cells){
    const dx=t.x-c.x, dy=t.y-c.y, d=Math.hypot(dx,dy)||1;
    const splits = player.split ? cells.length : 1;
    const speedBoost = Math.min(2.0, 1 + (splits - 1) * 0.15);
    const ax=(dx/d)*0.6*speedBoost, ay=(dy/d)*0.6*speedBoost;
    const maxS=speedFromRadius(c.radius)*speedBoost;
    c.vx=(c.vx||0)*0.85+ax; c.vy=(c.vy||0)*0.85+ay;
    const v=Math.hypot(c.vx,c.vy); if(v>maxS){ c.vx=(c.vx/v)*maxS; c.vy=(c.vy/v)*maxS; }
    c.x+=c.vx; c.y+=c.vy;
    c.x = clamp(c.x, c.radius, WORLD.w - c.radius);
    c.y = clamp(c.y, c.radius, WORLD.h - c.radius);
  }

  if(!player.split){
    player.x = cells[0].x; player.y = cells[0].y;
    player.vx = cells[0].vx; player.vy = cells[0].vy;
  }
}
function splitPlayer(){
  const cells = playerCells();
  if(player.split && cells.length >= MAX_SPLITS) return;
  if(!player.split && player.mass < 20) return;

  const t = getTarget();
  if(!player.split){
    const a = Math.atan2(t.y-player.y, t.x-player.x), d = 30, m = player.mass/2;
    player.split = true;
    player.splitBalls = [
      { x: player.x + Math.cos(a)*d, y: player.y + Math.sin(a)*d, mass:m, radius:massToRadius(m), vx:Math.cos(a)*4, vy:Math.sin(a)*4, splitTime:now() },
      { x: player.x - Math.cos(a)*d, y: player.y - Math.sin(a)*d, mass:m, radius:massToRadius(m), vx:-Math.cos(a)*4, vy:-Math.sin(a)*4, splitTime:now() }
    ];
    splitEnd = now() + 8000;
  } else {
    const newBalls=[];
    for(const ball of player.splitBalls){
      if(ball.mass >= 20){
        const a = Math.atan2(t.y-ball.y, t.x-ball.x), d=ball.radius+15, half=ball.mass/2;
        newBalls.push({ x:ball.x+Math.cos(a)*d, y:ball.y+Math.sin(a)*d, mass:half, radius:massToRadius(half), vx:Math.cos(a)*5, vy:Math.sin(a)*5, splitTime:now() });
        newBalls.push({ x:ball.x-Math.cos(a)*d, y:ball.y-Math.sin(a)*d, mass:half, radius:massToRadius(half), vx:-Math.cos(a)*5, vy:-Math.sin(a)*5, splitTime:now() });
      } else newBalls.push(ball);
    }
    player.splitBalls = newBalls.slice(0, MAX_SPLITS);
    const avgMass = player.splitBalls.reduce((s,b)=>s+b.mass,0) / player.splitBalls.length;
    const timeMultiplier = Math.min(3, player.splitBalls.length / 2);
    splitEnd = now() + (4000 + avgMass * 20) * timeMultiplier;
  }
}
function ejectMass(){
  if(totalPlayerMass() < 15) return;
  const t=getTarget();
  const shoot = (x,y,r,setMass)=>{
    const a=Math.atan2(t.y-y, t.x-x), amount=2, speed=8;
    pellets.push({ x: x+Math.cos(a)*(r+5), y: y+Math.sin(a)*(r+5), vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, mass:amount, radius:4, life: now()+5000 });
    setMass(-amount);
  };
  if(player.split){
    for(const b of player.splitBalls){
      if(b.mass < 15) continue;
      shoot(b.x,b.y,b.radius,(dm)=>{ b.mass+=dm; b.radius=massToRadius(b.mass); });
    }
  } else {
    shoot(player.x,player.y,player.radius,(dm)=>{ player.mass+=dm; player.radius=massToRadius(player.mass); });
  }
}
function maybeMerge(){
  if(!player.split) return;
  const t = now();
  if(t >= splitEnd){
    let merged=true;
    while(merged && player.splitBalls.length>1){
      merged=false;
      for(let i=0;i<player.splitBalls.length;i++){
        for(let j=i+1;j<player.splitBalls.length;j++){
          const a=player.splitBalls[i], b=player.splitBalls[j];
          if(dist(a.x,a.y,b.x,b.y) < (a.radius+b.radius)*0.8){
            const total=a.mass+b.mass;
            const newBall={ x:(a.x*a.mass+b.x*b.mass)/total, y:(a.y*a.mass+b.y*b.mass)/total, mass:total,
                            radius:massToRadius(total), vx:(a.vx+b.vx)/2, vy:(a.vy+b.vy)/2, splitTime:Math.max(a.splitTime,b.splitTime) };
            player.splitBalls.splice(j,1); player.splitBalls.splice(i,1); player.splitBalls.push(newBall);
            merged=true; break;
          }
        }
        if(merged) break;
      }
    }
    if(player.splitBalls.length===1){
      const b=player.splitBalls[0];
      player.split=false; player.x=b.x; player.y=b.y; player.mass=b.mass; player.radius=b.radius; player.vx=b.vx; player.vy=b.vy; player.splitBalls=[];
    }
  }
  // merge rápido de bolinhas muito pequenas
  for(let i=0;i<player.splitBalls.length;i++){
    const ball=player.splitBalls[i];
    if(ball.mass<15){
      const dt = t - ball.splitTime;
      if(dt>2000){
        let nearest=-1, best=Infinity;
        for(let j=0;j<player.splitBalls.length;j++){
          if(i===j) continue;
          const d=dist(ball.x,ball.y,player.splitBalls[j].x,player.splitBalls[j].y);
          if(d<best){ best=d; nearest=j; }
        }
        if(nearest!==-1){
          const other=player.splitBalls[nearest], total=ball.mass+other.mass;
          other.x=(ball.x*ball.mass+other.x*other.mass)/total;
          other.y=(ball.y*ball.mass+other.y*other.mass)/total;
          other.mass=total; other.radius=massToRadius(total);
          player.splitBalls.splice(i,1); i--;
        }
      }
    }
  }
}

/* ===== Sistemas (itens, rage, partículas, câmera) ===== */
function updateRage(){
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const b = powerUps[i];
    const hit = playerCells().some(c => dist(c.x,c.y,b.x,b.y) < c.radius + b.radius);
    if (!hit) continue;

    player.rageMode = true;
    player.rageEnd  = now() + RAGE_MS;
    createParticles(b.x,b.y,'#FF006E');
    for (let j=0;j<8;j++) createParticles(b.x + (Math.random()-0.5)*30, b.y + (Math.random()-0.5)*30, '#FF006E');
    powerUps.splice(i,1);
    safeSpawnRageLater();
  }
  if (player.rageMode && now() > player.rageEnd) player.rageMode = false;
}
function eatItems(list, radiusFn, massGainFn, color){
  outer: for (let i=list.length-1;i>=0;i--){
    const item=list[i];
    for(const c of playerCells()){
      if(dist(c.x,c.y,item.x,item.y) < c.radius + radiusFn(item)){
        createParticles(item.x,item.y,color);
        const gain = massGainFn(item) * (player.rageMode?3:1);
        c.mass += gain; c.radius = massToRadius(c.mass);
        score += 1; list.splice(i,1);
        if(player.rageMode) createParticles(c.x,c.y,'#FF006E');
        continue outer;
      }
    }
  }
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.95; p.vy*=0.95;
    if(now()>p.life) particles.splice(i,1);
  }
}
function updatePelletPhysics(){
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.98; p.vy*=0.98;
    if(now()>p.life || p.x<0||p.x>WORLD.w||p.y<0||p.y>WORLD.h) pellets.splice(i,1);
  }
}
function updateCamera(){
  const {x:cx,y:cy}=playerCentroid();
  const m = totalPlayerMass();
  const targetZoom = clamp(1-(m-10)/350, 0.45, 1.2);
  camera.zoom = lerp(camera.zoom, targetZoom, 0.03);
  camera.x = lerp(camera.x, cx, 0.08);
  camera.y = lerp(camera.y, cy, 0.08);
}

/* ===== Inimigos (interações) ===== */
function respawnEnemy(en){
  en.mass = 20 + Math.random()*40;
  en.radius = massToRadius(en.mass);
  en.x = Math.random()*WORLD.w; en.y = Math.random()*WORLD.h;
  en.behavior='wander'; en.target=null; en.fearLevel=0;
}
function eatEnemy(idxE){
  const en = enemies[idxE];
  createParticles(en.x,en.y,'#FF4444');
  const gain = en.mass*0.9*(player.rageMode?2:1);
  applyMassGainToPlayer(gain);
  if(player.rageMode){ for(let j=0;j<5;j++) createParticles(en.x+(Math.random()-0.5)*20, en.y+(Math.random()-0.5)*20, '#FF006E'); }
  respawnEnemy(en);
}
function resolvePlayerEnemyCollision(e, idx){
  // tenta por cada célula do player (lista pode mudar ao remover)
  for (let i=0; i<playerCells().length; i++){
    const cells = playerCells();
    const c = cells[i]; if(!c) break;
    if (dist(c.x,c.y,e.x,e.y) >= c.radius + e.radius) continue;

    if (c.mass > e.mass * ENEMY_EAT){
      eatEnemy(idx);
      return true;
    }
    if (e.mass > c.mass * PLAYER_DIE){
      createParticles(c.x,c.y,'#FF4444');
      e.mass += c.mass*0.8; e.radius = massToRadius(e.mass);
      if (!player.split){ endGame(); return true; }
      player.splitBalls.splice(i,1);
      if (player.splitBalls.length===0){ endGame(); return true; }
    }
  }
  return false;
}

/* ===== Partículas ===== */
function createParticles(x,y,color='#FFD700'){
  for(let i=0;i<6;i++){
    particles.push({ x:x+(Math.random()-0.5)*10, y:y+(Math.random()-0.5)*10, vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, life: now()+800, color, size: Math.random()*3+1 });
  }
}

/* ===== Loop principal ===== */
function loop(){ if(!gameRunning) return; update(); render(); requestAnimationFrame(loop); }

function update(){
  movePlayer();
  maybeMerge();

  updateRage();
  updateParticles();
  updatePelletPhysics();

  eatItems(food,    f => f.radius,  f => 0.25*f.radius, '#00FF88');
  eatItems(pellets, p => p.radius,  p => p.mass*0.8,    '#FFD700');

  // inimigos
  for(let i=0;i<enemies.length;i++){
    const e=enemies[i];
    updateEnemyAI(e, now()); moveEnemyAI(e);
    e.x = clamp(e.x, e.radius, WORLD.w - e.radius);
    e.y = clamp(e.y, e.radius, WORLD.h - e.radius);

    // inimigos comem entre si
    for(let j=i+1;j<enemies.length;j++){
      const o=enemies[j];
      if(dist(e.x,e.y,o.x,o.y) < e.radius+o.radius){
        if(e.mass>o.mass*ENEMY_EAT){
          createParticles(o.x,o.y,o.color); e.mass+=o.mass*0.9; e.radius=massToRadius(e.mass); respawnEnemy(o);
        } else if(o.mass>e.mass*ENEMY_EAT){
          createParticles(e.x,e.y,e.color); o.mass+=e.mass*0.9; o.radius=massToRadius(o.mass); respawnEnemy(e);
        }
      }
    }

    // inimigo come itens
    for(let k=food.length-1;k>=0;k--){
      const f=food[k]; if(dist(e.x,e.y,f.x,f.y)<e.radius+f.radius){ e.mass+=0.3*f.radius; e.radius=massToRadius(e.mass); food.splice(k,1); }
    }
    for(let k=pellets.length-1;k>=0;k--){
      const p=pellets[k]; if(dist(e.x,e.y,p.x,p.y)<e.radius+p.radius){ e.mass+=p.mass*0.9; e.radius=massToRadius(e.mass); pellets.splice(k,1); }
    }

    if (resolvePlayerEnemyCollision(e, i)){ if(!gameRunning) return; }
  }

  updateCamera();

  // HUD
  document.getElementById('score').textContent = score;
  document.getElementById('mass').textContent  = Math.floor(totalPlayerMass());

  // Rage status
  if(player.rageMode){
    const remain = Math.max(0, Math.ceil((player.rageEnd - now())/1000));
    document.getElementById('rageTime').textContent = remain;
    document.getElementById('rageStatus').style.display='block';
  } else {
    document.getElementById('rageStatus').style.display='none';
  }
}

/* ===== Render ===== */
function render(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);

  ctx.save();
  ctx.translate(W*0.5, H*0.5); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);

  // grid
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
  for(let x=0;x<WORLD.w;x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,WORLD.h); ctx.stroke(); }
  for(let y=0;y<WORLD.h;y+=50){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WORLD.w,y); ctx.stroke(); }

  // frutas
  for(const f of food){ ctx.font='18px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(f.emoji, f.x, f.y); }

  // bônus rage
  for(const bonus of powerUps){
    const t = now()*0.005;
    const pulse = 1 + Math.sin(t + bonus.pulse)*0.2;
    const pr = bonus.radius * pulse;
    ctx.shadowColor = bonus.color; ctx.shadowBlur = 15;
    ctx.fillStyle = bonus.color; ctx.beginPath(); ctx.arc(bonus.x, bonus.y, pr, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='20px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(bonus.emoji, bonus.x, bonus.y);
  }

  // pellets
  for(const p of pellets){
    ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.stroke();
  }

  // partículas
  for(const p of particles){
    const life = Math.max(0,(p.life-now())/800);
    if(life>0){ ctx.globalAlpha=life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.1,p.size*life),0,Math.PI*2); ctx.fill(); }
  }
  ctx.globalAlpha=1;

  // inimigos
  function renderEnemy(e){
    const t = now()*0.003; e.animPhase += 0.02;
    let display = e.color;
    if(e.behavior==='hunt_enemy') display='#FF0000';
    else if(e.behavior==='chase') display='#FF6B6B';
    else if(e.behavior==='flee') display='#4ECDC4';
    else if(e.behavior==='hunt_food') display='#45B7D1';
    else if(e.fearLevel>0) display='#FFD93D';

    switch(e.type){
      case 'basic':
        ctx.fillStyle=display; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : 'rgba(255,255,255,.45)'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:1; ctx.stroke();
        break;
      case 'aggressive': {
        const spikes=8, spikeLength=e.radius*(e.behavior==='hunt_enemy'?0.4:0.3);
        ctx.fillStyle=display; ctx.beginPath();
        for(let i=0;i<spikes;i++){
          const ang=(i/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          const innerR=e.radius-spikeLength*0.5;
          const outerR=e.radius + spikeLength*(0.5 + Math.sin(t*(e.behavior==='hunt_enemy'?4:2)+i)*0.3);
          if(i===0) ctx.moveTo(e.x+Math.cos(ang)*outerR, e.y+Math.sin(ang)*outerR);
          const nAng=((i+1)/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          ctx.lineTo(e.x+Math.cos(ang)*outerR, e.y+Math.sin(ang)*outerR);
          ctx.lineTo(e.x+Math.cos(nAng)*innerR, e.y+Math.sin(nAng)*innerR);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#CC0000' : '#FF0000'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:2; ctx.stroke();
        break; }
      case 'cautious': {
        ctx.fillStyle=display; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.stroke();
        const eye=e.radius*0.25, off=e.radius*0.4, nerv=Math.sin(t*8)*0.1;
        ctx.fillStyle='white'; ctx.beginPath();
        ctx.arc(e.x-off+nerv, e.y-off, eye,0,Math.PI*2);
        ctx.arc(e.x+off-nerv, e.y-off, eye,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=e.behavior==='hunt_enemy'?'red':'black'; ctx.beginPath();
        ctx.arc(e.x-off+nerv, e.y-off, eye*0.6,0,Math.PI*2);
        ctx.arc(e.x+off-nerv, e.y-off, eye*0.6,0,Math.PI*2); ctx.fill();
        break; }
      case 'speedy': {
        const tail = e.behavior==='hunt_enemy'?8:5;
        for(let i=0;i<tail;i++){
          const alpha=1-(i/tail), rr=e.radius*(1-i*0.08), tx=e.x-(e.vx||0)*i*3, ty=e.y-(e.vy||0)*i*3;
          ctx.globalAlpha=alpha*0.7; ctx.fillStyle=display; ctx.beginPath(); ctx.arc(tx,ty,rr,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha=1;
        ctx.fillStyle=display; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*0.8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=e.behavior==='hunt_enemy'?'#FF0000':'#FFFF00'; ctx.lineWidth=2; ctx.stroke();
        break; }
      case 'tank': {
        const segs=3;
        for(let i=0;i<segs;i++){
          const r=e.radius*(1-i*0.15), a=1-i*0.2;
          ctx.globalAlpha=a; ctx.fillStyle=display; ctx.beginPath(); ctx.arc(e.x,e.y,r,0,Math.PI*2); ctx.fill();
          if(i===0){ ctx.strokeStyle=e.behavior==='hunt_enemy'?'rgba(200,0,0,0.8)':'rgba(100,100,100,0.8)'; ctx.lineWidth=3; ctx.stroke(); }
        }
        ctx.globalAlpha=1; break; }
      case 'hunter':
        ctx.fillStyle=display; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.stroke();
        if(e.behavior==='chase' || e.behavior==='hunt_food' || e.behavior==='hunt_enemy'){
          ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : '#00FF00'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:2;
          const s=e.radius*(e.behavior==='hunt_enemy'?1.4:1.2);
          ctx.beginPath(); ctx.moveTo(e.x-s,e.y); ctx.lineTo(e.x+s,e.y); ctx.moveTo(e.x,e.y-s); ctx.lineTo(e.x,e.y+s); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*(e.behavior==='hunt_enemy'?1.5:1.3),0,Math.PI*2); ctx.stroke();
        }
        break;
    }
    if(e.behavior==='hunt_enemy'){ ctx.fillStyle='rgba(255,0,0,0.2)'; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*1.3,0,Math.PI*2); ctx.fill(); }
    if(e.fearLevel>3){ const shake=(Math.random()-0.5)*e.fearLevel; ctx.fillStyle='rgba(255,255,0,0.3)'; ctx.beginPath(); ctx.arc(e.x+shake,e.y+shake,e.radius*1.1,0,Math.PI*2); ctx.fill(); }
  }
  for(const e of enemies) renderEnemy(e);

  // player
  const t = now()*0.002;
  let pulse = 1 + Math.sin(t)*0.03; if(player.rageMode) pulse = 1 + Math.sin(t*3)*0.08;
  let center='#66B2FF', mid='#4A90E2', border='#2E5C8A', stroke='#1A4B73', glow=null, blur=0;
  if(player.rageMode){ center='#FF8FA3'; mid='#FF006E'; border='#CC0052'; stroke='#990040'; glow='#FF006E'; blur=20; }

  for(const c of playerCells()){
    const pr=c.radius*pulse;
    if(glow){ ctx.shadowColor=glow; ctx.shadowBlur=blur; }
    const g=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,pr);
    g.addColorStop(0,center); g.addColorStop(0.7,mid); g.addColorStop(1,border);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(c.x,c.y,pr,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.strokeStyle=stroke; ctx.lineWidth=player.rageMode?3:2; ctx.stroke();
  }

  ctx.restore();
  drawMini();
}

function drawMini(){
  if(minimapWrap.classList.contains('hidden')) return;
  const w=mini.width,h=mini.height; mctx.clearRect(0,0,w,h);
  mctx.fillStyle='#071c2d'; mctx.fillRect(0,0,w,h);
  const sx=w/WORLD.w, sy=h/WORLD.h;

  mctx.strokeStyle='#0ff7'; mctx.lineWidth=1.5; mctx.strokeRect(0,0,w,h);

  const halfW=(W*0.5)/camera.zoom, halfH=(H*0.5)/camera.zoom;
  mctx.strokeStyle='#ffffffb0'; mctx.lineWidth=1.5;
  mctx.strokeRect((camera.x-halfW)*sx,(camera.y-halfH)*sy,(halfW*2)*sx,(halfH*2)*sy);

  function dot(x,y,r,c){ mctx.fillStyle=c; mctx.beginPath(); mctx.arc(x*sx,y*sy,Math.max(2,r*sx*0.35),0,Math.PI*2); mctx.fill(); }
  for(const e of enemies) dot(e.x,e.y,e.radius,'#ff5577');
  for(const b of powerUps) dot(b.x,b.y,b.radius,'#FF006E');
  const {x:px,y:py}=playerCentroid();
  const pr = Math.max(...playerCells().map(c=>c.radius));
  dot(px,py,pr,'#00ff99');
}

/* ===== Visibilidade ===== */
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && gameRunning){ gameRunning=false; } });
