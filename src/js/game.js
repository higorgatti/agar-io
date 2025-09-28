/* ===== Evita rolagem no iOS/Android durante o jogo ===== */
document.addEventListener('touchmove', (e)=>{ if (window.__GAME_RUNNING__) e.preventDefault(); }, {passive:false});

/* ===== Canvas e DPR ===== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const ui = document.getElementById('ui');
const startPane = document.getElementById('start');
const overPane = document.getElementById('over');
const minimapWrap = document.getElementById('minimapWrap');
const mobileBtns = document.getElementById('mobileBtns');

let W = innerWidth, H = innerHeight, DPR = Math.min(3, (window.devicePixelRatio||1));
function fit(){
  W = innerWidth; H = innerHeight; DPR = Math.min(3, (window.devicePixelRatio||1));
  canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', fit, {passive:true}); fit();

/* ===== Mundo ===== */
const WORLD_W = 2400, WORLD_H = 1800;
const FRUITS = ['🍎','🍌','🍇','🍓','🍊'];

let gameRunning=false, score=0;
let player, enemies=[], food=[], powerUps=[], pellets=[], particles=[];
let camera={x:WORLD_W/2,y:WORLD_H/2,zoom:1};
let moveTarget=null, lastTap=0, startTime=0, splitEnd=0;

const INITIAL_MASS=12;
function massToRadius(m){ return Math.sqrt(Math.max(0.0001,m))*2+5; }

/* ===== Utilitários para múltiplas células ===== */
function totalPlayerMass(){
  if (!player.split) return player.mass;
  return player.splitBalls.reduce((s,b)=>s+b.mass,0);
}
function playerCentroid(){
  if (!player.split) return {x:player.x, y:player.y};
  const tm = totalPlayerMass();
  let cx=0, cy=0;
  for (const b of player.splitBalls){ cx += b.x * b.mass; cy += b.y * b.mass; }
  return {x: cx/tm, y: cy/tm};
}
function playerAvgVelocity(){
  if (!player.split) return {vx: player.vx||0, vy: player.vy||0};
  let vx=0, vy=0; const n = player.splitBalls.length || 1;
  for (const b of player.splitBalls){ vx += (b.vx||0); vy += (b.vy||0); }
  return {vx: vx/n, vy: vy/n};
}

/* ===== Inimigos ===== */
function spawnEnemy(){
  const types = ['basic', 'aggressive', 'cautious', 'speedy', 'tank', 'hunter'];
  const type = types[Math.floor(Math.random() * types.length)];
  let enemy = {
    x: Math.random()*WORLD_W, y: Math.random()*WORLD_H,
    mass: 20+Math.random()*50, radius:0, vx:0, vy:0,
    behavior:'wander', target:null, fearLevel:0, lastThink:0,
    type, blinkTimer: Math.random()*1000, animPhase: Math.random()*6.28
  };
  switch(type){
    case 'basic': enemy.color=`hsl(${200+Math.random()*60},60%,50%)`; enemy.baseSpeed=0.3; enemy.aggressiveness=0.3; break;
    case 'aggressive': enemy.color=`hsl(${0+Math.random()*30},70%,50%)`; enemy.mass=30+Math.random()*40; enemy.baseSpeed=0.4; enemy.aggressiveness=0.8; break;
    case 'cautious': enemy.color=`hsl(${180+Math.random()*40},55%,60%)`; enemy.mass=15+Math.random()*25; enemy.baseSpeed=0.25; enemy.aggressiveness=0.1; break;
    case 'speedy': enemy.color=`hsl(${60+Math.random()*40},65%,55%)`; enemy.mass=10+Math.random()*20; enemy.baseSpeed=0.6; enemy.aggressiveness=0.4; break;
    case 'tank': enemy.color=`hsl(${280+Math.random()*40},50%,45%)`; enemy.mass=50+Math.random()*60; enemy.baseSpeed=0.15; enemy.aggressiveness=0.2; break;
    case 'hunter': enemy.color=`hsl(${120+Math.random()*40},70%,45%)`; enemy.mass=25+Math.random()*35; enemy.baseSpeed=0.35; enemy.aggressiveness=0.6; break;
  }
  enemy.radius = massToRadius(enemy.mass);
  enemies.push(enemy);
}

function spawnRageBonus(){
  powerUps.push({ x:Math.random()*WORLD_W, y:Math.random()*WORLD_H, radius:15, type:'rage', color:'#FF006E', emoji:'😡', pulse: Math.random()*6.28 });
}
function safeSpawnRageLater(){
  const delay = 3000 + Math.random()*5000;
  setTimeout(()=>{ if (gameRunning) spawnRageBonus(); }, delay);
}

/* ===== Reset ===== */
function reset(){
  player={x:WORLD_W/2,y:WORLD_H/2,mass:INITIAL_MASS,radius:massToRadius(INITIAL_MASS),vx:0,vy:0,split:false,splitBalls:[],
    rageMode:false, rageEnd:0
  };
  enemies=[]; food=[]; powerUps=[]; pellets=[]; particles=[];
  for(let i=0;i<320;i++){food.push(randFruit());}
  for(let i=0;i<25;i++){spawnEnemy();}
  for(let i=0;i<5;i++){spawnRageBonus();}
}
function randFruit(){ const e=FRUITS[Math.floor(Math.random()*FRUITS.length)]; return {x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,radius:10,emoji:e}; }

/* ===== IA inimigos ===== */
function updateEnemyAI(enemy, now){
  if(now - enemy.lastThink < 150) return;
  enemy.lastThink = now;

  const {x:pX, y:pY} = playerCentroid();
  const pMass = totalPlayerMass();
  const {vx:pVx, vy:pVy} = playerAvgVelocity();
  const distToPlayer = Math.hypot(enemy.x - pX, enemy.y - pY);

  let predictionTime = 1.0;
  if(enemy.type==='hunter') predictionTime=1.5;
  if(enemy.type==='aggressive') predictionTime=1.2;
  if(enemy.type==='cautious') predictionTime=0.8;
  if(enemy.type==='speedy') predictionTime=0.7;
  predictionTime *= Math.min(2.0, distToPlayer/100);

  const predictedX = pX + pVx * predictionTime * 60;
  const predictedY = pY + pVy * predictionTime * 60;

  enemy.fearLevel = Math.max(0, enemy.fearLevel - 0.5);

  // Caçar inimigos menores próximos
  let targetEnemy=null, closestEnemyDist=Infinity;
  for(const other of enemies){
    if(other===enemy) continue;
    const dist = Math.hypot(enemy.x-other.x, enemy.y-other.y);
    if(enemy.mass > other.mass*1.3 && dist<250 && dist<closestEnemyDist){
      targetEnemy = other; closestEnemyDist = dist;
    }
  }
  if(targetEnemy){
    enemy.behavior='hunt_enemy';
    const tVx = targetEnemy.vx||0, tVy = targetEnemy.vy||0;
    enemy.target = {x: targetEnemy.x + tVx*0.8*60, y: targetEnemy.y + tVy*0.8*60};
    return;
  }

  if(distToPlayer < 300){
    if(player.rageMode){
      enemy.behavior='flee'; enemy.target={x:predictedX, y:predictedY}; enemy.fearLevel=5;
    } else if(enemy.mass > pMass*1.2){
      enemy.behavior='chase'; enemy.target={x:predictedX,y:predictedY};
    } else if(pMass > enemy.mass*1.5){
      enemy.behavior='flee'; enemy.target={x:predictedX,y:predictedY}; enemy.fearLevel=3;
    } else {
      enemy.behavior='hunt_food';
    }
  } else {
    enemy.behavior='hunt_food';
  }

  if(enemy.behavior==='hunt_food'){
    let closestFood=null, closestDist=Infinity;
    for(const f of food){
      const d=Math.hypot(enemy.x-f.x, enemy.y-f.y);
      if(d<200 && d<closestDist){ closestFood=f; closestDist=d; }
    }
    if(closestFood) enemy.target={x:closestFood.x, y:closestFood.y};
    else enemy.behavior='wander';
  }
}
function moveEnemyAI(enemy){
  let targetX=enemy.x, targetY=enemy.y;
  let speed=(enemy.baseSpeed||0.3)*(30/(enemy.radius+10));

  if(enemy.type==='aggressive') speed*=1.3;
  else if(enemy.type==='cautious' && enemy.behavior==='flee') speed*=1.6;
  else if(enemy.type==='speedy') speed*=1.8;
  else if(enemy.type==='tank') speed*=0.7;
  else if(enemy.type==='hunter') speed*=1.2;

  switch(enemy.behavior){
    case 'hunt_enemy':
      if(enemy.target){ targetX=enemy.target.x; targetY=enemy.target.y; speed*=1.5; }
      break;
    case 'chase':
      if(enemy.target){ targetX=enemy.target.x; targetY=enemy.target.y; speed*=1.3; }
      break;
    case 'flee':
      if(enemy.target){
        const dx=enemy.x-enemy.target.x, dy=enemy.y-enemy.target.y, dist=Math.hypot(dx,dy)||1;
        targetX = enemy.x + (dx/dist)*120; targetY = enemy.y + (dy/dist)*120;
        speed *= (1.4 + enemy.fearLevel*0.1);
      }
      break;
    case 'hunt_food':
      if(enemy.target){ targetX=enemy.target.x; targetY=enemy.target.y; }
      break;
    default:
      targetX = enemy.x + (Math.random()-0.5)*80;
      targetY = enemy.y + (Math.random()-0.5)*80;
      speed *= 0.8;
  }

  const margin = enemy.radius + 50;
  if(enemy.x < margin) targetX = enemy.x + 120;
  if(enemy.x > WORLD_W - margin) targetX = enemy.x - 120;
  if(enemy.y < margin) targetY = enemy.y + 120;
  if(enemy.y > WORLD_H - margin) targetY = enemy.y - 120;

  const dx=targetX-enemy.x, dy=targetY-enemy.y, dist=Math.hypot(dx,dy)||1;
  const ax=(dx/dist)*speed, ay=(dy/dist)*speed;
  enemy.vx=(enemy.vx*0.75)+(ax*0.25); enemy.vy=(enemy.vy*0.75)+(ay*0.25);
  const v=Math.hypot(enemy.vx,enemy.vy), maxS=speed;
  if(v>maxS){ enemy.vx=(enemy.vx/v)*maxS; enemy.vy=(enemy.vy/v)*maxS; }
}

/* ===== Controles Mobile ===== */
canvas.addEventListener('touchstart', (e)=>{
  if(!gameRunning) return;
  const now=Date.now(); if(now-lastTap<250){ splitPlayer(); } lastTap=now;
  const t=e.touches[0]; const r=canvas.getBoundingClientRect();
  const x=(t.clientX-r.left)*(W/r.width), y=(t.clientY-r.top)*(H/r.height);
  const cx=W*0.5, cy=H*0.5; const wx=((x-cx)/camera.zoom)+camera.x, wy=((y-cy)/camera.zoom)+camera.y;
  moveTarget={x:wx,y:wy};
},{passive:false});
canvas.addEventListener('touchmove', (e)=>{
  if(!gameRunning) return;
  const t=e.touches[0]; const r=canvas.getBoundingClientRect();
  const x=(t.clientX-r.left)*(W/r.width), y=(t.clientY-r.top)*(H/r.height);
  const cx=W*0.5, cy=H*0.5; const wx=((x-cx)/camera.zoom)+camera.x, wy=((y-cy)/camera.zoom)+camera.y;
  moveTarget={x:wx,y:wy};
},{passive:false});

document.getElementById('btnStart').onclick = startGame;
document.getElementById('btnRestart').onclick = startGame;
document.getElementById('btnSplit').onclick = ()=>{ if(gameRunning) splitPlayer(); };
document.getElementById('btnEject').onclick = ()=>{ if(gameRunning) ejectMass(); };

/* ===== Jogo ===== */
function startGame(){
  reset();
  gameRunning=true; window.__GAME_RUNNING__=true;
  startTime=Date.now(); score=0; splitEnd=0; moveTarget=null;
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

function speedFromRadius(r){ return 12/Math.sqrt(r+30); }
function getTarget(){ return moveTarget?{x:moveTarget.x,y:moveTarget.y}:playerCentroid(); }

function movePlayer(){
  const t=getTarget();
  if(player.split && player.splitBalls.length){
    for(const b of player.splitBalls){
      const dx=t.x-b.x, dy=t.y-b.y, d=Math.hypot(dx,dy)||1;
      const speedBoost = Math.min(2.0, 1 + (player.splitBalls.length - 1) * 0.15);
      const ax=(dx/d)*0.6*speedBoost, ay=(dy/d)*0.6*speedBoost;
      const maxS=speedFromRadius(b.radius)*speedBoost;
      b.vx=(b.vx||0)*0.85+ax; b.vy=(b.vy||0)*0.85+ay;
      const v=Math.hypot(b.vx,b.vy); if(v>maxS){ b.vx=(b.vx/v)*maxS; b.vy=(b.vy/v)*maxS; }
      b.x+=b.vx; b.y+=b.vy;
      b.x=Math.max(b.radius,Math.min(WORLD_W-b.radius,b.x));
      b.y=Math.max(b.radius,Math.min(WORLD_H-b.radius,b.y));
    }
  }else{
    const dx=t.x-player.x, dy=t.y-player.y, d=Math.hypot(dx,dy)||1;
    const ax=(dx/d)*0.6, ay=(dy/d)*0.6, maxS=speedFromRadius(player.radius);
    player.vx=(player.vx||0)*0.85+ax; player.vy=(player.vy||0)*0.85+ay;
    const v=Math.hypot(player.vx,player.vy); if(v>maxS){ player.vx=(player.vx/v)*maxS; player.vy=(player.vy/v)*maxS; }
    player.x+=player.vx; player.y+=player.vy;
    player.x=Math.max(player.radius,Math.min(WORLD_W-player.radius,player.x));
    player.y=Math.max(player.radius,Math.min(WORLD_H-player.radius,player.y));
  }
}

function splitPlayer(){
  const maxSplits = 8;
  if(player.split && player.splitBalls.length >= maxSplits) return;
  if(!player.split && player.mass < 20) return;

  const t = getTarget();
  if(!player.split){
    const a = Math.atan2(t.y-player.y, t.x-player.x), d = 30, m = player.mass/2;
    player.split = true;
    player.splitBalls = [
      { x: player.x + Math.cos(a)*d, y: player.y + Math.sin(a)*d, mass:m, radius:massToRadius(m), vx:Math.cos(a)*4, vy:Math.sin(a)*4, splitTime:Date.now() },
      { x: player.x - Math.cos(a)*d, y: player.y - Math.sin(a)*d, mass:m, radius:massToRadius(m), vx:-Math.cos(a)*4, vy:-Math.sin(a)*4, splitTime:Date.now() }
    ];
    splitEnd = Date.now() + 8000;
  }else{
    const newBalls=[];
    for(const ball of player.splitBalls){
      if(ball.mass >= 20){
        const a = Math.atan2(t.y-ball.y, t.x-ball.x), dist=ball.radius+15, half=ball.mass/2;
        newBalls.push({ x:ball.x+Math.cos(a)*dist, y:ball.y+Math.sin(a)*dist, mass:half, radius:massToRadius(half), vx:Math.cos(a)*5, vy:Math.sin(a)*5, splitTime:Date.now() });
        newBalls.push({ x:ball.x-Math.cos(a)*dist, y:ball.y-Math.sin(a)*dist, mass:half, radius:massToRadius(half), vx:-Math.cos(a)*5, vy:-Math.sin(a)*5, splitTime:Date.now() });
      } else newBalls.push(ball);
    }
    player.splitBalls = newBalls.slice(0, maxSplits);
    const avgMass = player.splitBalls.reduce((s,b)=>s+b.mass,0) / player.splitBalls.length;
    const timeMultiplier = Math.min(3, player.splitBalls.length / 2);
    splitEnd = Date.now() + (4000 + avgMass * 20) * timeMultiplier;
  }
}

function ejectMass(){
  if(totalPlayerMass() < 15) return;
  const t=getTarget();
  const shoot = (x,y,r,vx,vy,setMass)=>{
    const a=Math.atan2(t.y-y, t.x-x), ejectAmount=2, speed=8;
    pellets.push({ x: x+Math.cos(a)*(r+5), y: y+Math.sin(a)*(r+5), vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, mass:ejectAmount, radius:4, life: Date.now()+5000 });
    setMass(-ejectAmount);
  };
  if(player.split){
    for(const b of player.splitBalls){
      if(b.mass < 15) continue;
      shoot(b.x,b.y,b.radius,b.vx,b.vy,(dm)=>{ b.mass+=dm; b.radius=massToRadius(b.mass); });
    }
  } else {
    shoot(player.x,player.y,player.radius,player.vx,player.vy,(dm)=>{ player.mass+=dm; player.radius=massToRadius(player.mass); });
  }
}

function maybeMerge(){
  if(!player.split) return;
  const now = Date.now();
  if(now >= splitEnd){
    let merged=true;
    while(merged && player.splitBalls.length>1){
      merged=false;
      for(let i=0;i<player.splitBalls.length;i++){
        for(let j=i+1;j<player.splitBalls.length;j++){
          const a=player.splitBalls[i], b=player.splitBalls[j];
          const dist=Math.hypot(a.x-b.x,a.y-b.y);
          if(dist<(a.radius+b.radius)*0.8){
            const total=a.mass+b.mass;
            const newBall={ x:(a.x*a.mass+b.x*b.mass)/total, y:(a.y*a.mass+b.y*b.mass)/total, mass:total, radius:massToRadius(total), vx:(a.vx+b.vx)/2, vy:(a.vy+b.vy)/2, splitTime:Math.max(a.splitTime,b.splitTime) };
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
  // Recombinação rápida para muito pequenas
  for(let i=0;i<player.splitBalls.length;i++){
    const ball=player.splitBalls[i];
    if(ball.mass<15){
      const timeSinceSplit = now - ball.splitTime;
      if(timeSinceSplit>2000){
        let nearest=-1, best=Infinity;
        for(let j=0;j<player.splitBalls.length;j++){
          if(i===j) continue;
          const d=Math.hypot(ball.x-player.splitBalls[j].x, ball.y-player.splitBalls[j].y);
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

/* ===== Partículas ===== */
function createParticles(x,y,color='#FFD700'){
  for(let i=0;i<6;i++){
    particles.push({ x:x+(Math.random()-0.5)*10, y:y+(Math.random()-0.5)*10, vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, life: Date.now()+800, color, size: Math.random()*3+1 });
  }
}

/* ===== Loop ===== */
function loop(){ if(!gameRunning) return; update(); render(); requestAnimationFrame(loop); }

function update(){
  movePlayer(); maybeMerge();

  const now=Date.now();
  if(player.rageMode && now>player.rageEnd) player.rageMode=false;

  // câmera
  const {x:cx,y:cy} = playerCentroid();
  const mass = totalPlayerMass();
  const targetZoom = Math.max(0.45, Math.min(1.2, 1-(mass-10)/350));
  camera.zoom += (targetZoom-camera.zoom)*0.03; camera.x += (cx-camera.x)*0.08; camera.y += (cy-camera.y)*0.08;

  // partículas
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.95; p.vy*=0.95;
    if(Date.now()>p.life) particles.splice(i,1);
  }

  // pellets
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.98; p.vy*=0.98;
    if(Date.now()>p.life || p.x<0||p.x>WORLD_W||p.y<0||p.y>WORLD_H) pellets.splice(i,1);
  }

  // bônus Rage
  for(let i=powerUps.length-1;i>=0;i--){
    const b=powerUps[i];
    const {x:px,y:py} = playerCentroid();
    const pr = player.split ? Math.max(...player.splitBalls.map(b=>b.radius)) : player.radius;
    if(Math.hypot(px-b.x,py-b.y) < pr + b.radius){
      player.rageMode=true; player.rageEnd=now+10000;
      createParticles(b.x,b.y,'#FF006E');
      for(let j=0;j<8;j++){ createParticles(b.x+(Math.random()-0.5)*30, b.y+(Math.random()-0.5)*30, '#FF006E'); }
      powerUps.splice(i,1);
      safeSpawnRageLater();
    }
  }

  // comer frutas
  for(let i=food.length-1;i>=0;i--){
    const f=food[i];
    if(player.split){
      for(const b of player.splitBalls){
        if(Math.hypot(b.x-f.x,b.y-f.y)<b.radius+f.radius){
          createParticles(f.x,f.y,'#00FF88');
          const gain = 0.25*f.radius * (player.rageMode?3:1);
          b.mass+=gain; b.radius=massToRadius(b.mass); score+=1; food.splice(i,1);
          if(player.rageMode) createParticles(b.x,b.y,'#FF006E');
          break;
        }
      }
    } else if(Math.hypot(player.x-f.x,player.y-f.y)<player.radius+f.radius){
      createParticles(f.x,f.y,'#00FF88');
      const gain = 0.25*f.radius * (player.rageMode?3:1);
      player.mass+=gain; player.radius=massToRadius(player.mass); score+=1; food.splice(i,1);
      if(player.rageMode) createParticles(player.x,player.y,'#FF006E');
    }
  }

  // comer pellets
  for(let i=pellets.length-1;i>=0;i--){
    const p=pellets[i];
    if(player.split){
      for(const b of player.splitBalls){
        if(Math.hypot(b.x-p.x,b.y-p.y)<b.radius+p.radius){
          createParticles(p.x,p.y,'#FFD700');
          const gain = p.mass*0.8 * (player.rageMode?3:1);
          b.mass+=gain; b.radius=massToRadius(b.mass); score+=1; pellets.splice(i,1);
          if(player.rageMode) createParticles(b.x,b.y,'#FF006E');
          break;
        }
      }
    } else if(Math.hypot(player.x-p.x,player.y-p.y)<player.radius+p.radius){
      createParticles(p.x,p.y,'#FFD700');
      const gain = p.mass*0.8 * (player.rageMode?3:1);
      player.mass+=gain; player.radius=massToRadius(player.mass); score+=1; pellets.splice(i,1);
      if(player.rageMode) createParticles(player.x,player.y,'#FF006E');
    }
  }

  // inimigos
  for(let i=0;i<enemies.length;i++){
    const e=enemies[i];
    updateEnemyAI(e, now); moveEnemyAI(e);
    e.x+=e.vx; e.y+=e.vy;
    e.x=Math.max(e.radius,Math.min(WORLD_W-e.radius,e.x));
    e.y=Math.max(e.radius,Math.min(WORLD_H-e.radius,e.y));

    // inimigos comem entre si
    for(let j=i+1;j<enemies.length;j++){
      const o=enemies[j], dist=Math.hypot(e.x-o.x,e.y-o.y);
      if(dist<e.radius+o.radius){
        if(e.mass>o.mass*1.15){
          createParticles(o.x,o.y,o.color); e.mass+=o.mass*0.9; e.radius=massToRadius(e.mass);
          o.mass=15+Math.random()*30; o.radius=massToRadius(o.mass); o.x=Math.random()*WORLD_W; o.y=Math.random()*WORLD_H; o.behavior='wander'; o.target=null; o.fearLevel=0;
        }else if(o.mass>e.mass*1.15){
          createParticles(e.x,e.y,e.color); o.mass+=e.mass*0.9; o.radius=massToRadius(o.mass);
          e.mass=15+Math.random()*30; e.radius=massToRadius(e.mass); e.x=Math.random()*WORLD_W; e.y=Math.random()*WORLD_H; e.behavior='wander'; e.target=null; e.fearLevel=0;
        }
      }
    }

    // inimigos comem frutas/pellets
    for(let k=food.length-1;k>=0;k--){
      const f=food[k]; if(Math.hypot(e.x-f.x,e.y-f.y)<e.radius+f.radius){ e.mass+=0.3*f.radius; e.radius=massToRadius(e.mass); food.splice(k,1); }
    }
    for(let k=pellets.length-1;k>=0;k--){
      const p=pellets[k]; if(Math.hypot(e.x-p.x,e.y-p.y)<e.radius+p.radius){ e.mass+=p.mass*0.9; e.radius=massToRadius(e.mass); pellets.splice(k,1); }
    }

    // colisão inimigo x player — checar por célula
    const pMass = totalPlayerMass();

    function eatEnemy(idxE){
      const en = enemies[idxE];
      createParticles(en.x,en.y,'#FF4444');
      const g=en.mass*0.9*(player.rageMode?2:1);

      if(player.split){
        const tm = totalPlayerMass();
        for(const b of player.splitBalls){
          const share = (b.mass/tm)||0;
          b.mass += g*share; b.radius=massToRadius(b.mass);
        }
      } else {
        player.mass+=g; player.radius=massToRadius(player.mass);
      }
      if(player.rageMode){ for(let j=0;j<5;j++){ createParticles(en.x+(Math.random()-0.5)*20, en.y+(Math.random()-0.5)*20, '#FF006E'); } }

      // respawn
      en.mass=20+Math.random()*40; en.radius=massToRadius(en.mass);
      en.x=Math.random()*WORLD_W; en.y=Math.random()*WORLD_H; en.behavior='wander'; en.target=null; en.fearLevel=0;
    }

    if(player.split){
      for(const b of player.splitBalls){
        const d=Math.hypot(b.x-e.x,b.y-e.y);
        if(d<b.radius+e.radius){
          if(b.mass>e.mass*1.15 || pMass>e.mass*1.15){ eatEnemy(i); }
          else if(e.mass>pMass*1.1){ endGame(); }
          break;
        }
      }
    } else {
      const d=Math.hypot(player.x-e.x,player.y-e.y);
      if(d<player.radius+e.radius){
        if(player.mass>e.mass*1.15){ eatEnemy(i); }
        else if(e.mass>player.mass*1.1){ endGame(); }
      }
    }
    if(!gameRunning) return;
  }

  // HUD
  document.getElementById('score').textContent=score;
  document.getElementById('mass').textContent=Math.floor(totalPlayerMass());

  // Rage status
  const now2 = Date.now();
  if(player.rageMode && now2<player.rageEnd){
    const remaining = Math.ceil((player.rageEnd - now2)/1000);
    document.getElementById('rageTime').textContent = remaining;
    document.getElementById('rageStatus').style.display='block';
  } else {
    document.getElementById('rageStatus').style.display='none';
  }
}

function render(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);

  ctx.save();
  ctx.translate(W*0.5, H*0.5); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);

  // grid
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
  for(let x=0;x<WORLD_W;x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,WORLD_H); ctx.stroke(); }
  for(let y=0;y<WORLD_H;y+=50){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WORLD_W,y); ctx.stroke(); }

  // frutas
  for(const f of food){ ctx.font='18px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(f.emoji, f.x, f.y); }

  // bônus rage
  for(const bonus of powerUps){
    const time = Date.now()*0.005;
    const pulse = 1 + Math.sin(time + bonus.pulse)*0.2;
    const pulseRadius = bonus.radius * pulse;
    ctx.shadowColor = bonus.color; ctx.shadowBlur = 15;
    ctx.fillStyle = bonus.color; ctx.beginPath(); ctx.arc(bonus.x, bonus.y, pulseRadius, 0, Math.PI*2); ctx.fill();
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
    const life = Math.max(0,(p.life-Date.now())/800);
    if(life>0){ ctx.globalAlpha=life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.1,p.size*life),0,Math.PI*2); ctx.fill(); }
  }
  ctx.globalAlpha=1;

  // inimigos (render por tipo)
  function renderEnemy(e){
    const time = Date.now()*0.003; e.animPhase += 0.02;
    let displayColor = e.color;
    if(e.behavior==='hunt_enemy') displayColor='#FF0000';
    else if(e.behavior==='chase') displayColor='#FF6B6B';
    else if(e.behavior==='flee') displayColor='#4ECDC4';
    else if(e.behavior==='hunt_food') displayColor='#45B7D1';
    else if(e.fearLevel>0) displayColor='#FFD93D';

    switch(e.type){
      case 'basic':
        ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : 'rgba(255,255,255,.45)'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:1; ctx.stroke();
        break;
      case 'aggressive': {
        const spikes=8, spikeLength=e.radius*(e.behavior==='hunt_enemy'?0.4:0.3);
        ctx.fillStyle=displayColor; ctx.beginPath();
        for(let i=0;i<spikes;i++){
          const angle=(i/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          const innerR=e.radius-spikeLength*0.5;
          const outerR=e.radius + spikeLength*(0.5 + Math.sin(time*(e.behavior==='hunt_enemy'?4:2)+i)*0.3);
          if(i===0) ctx.moveTo(e.x+Math.cos(angle)*outerR, e.y+Math.sin(angle)*outerR);
          const nextAngle=((i+1)/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          ctx.lineTo(e.x+Math.cos(angle)*outerR, e.y+Math.sin(angle)*outerR);
          ctx.lineTo(e.x+Math.cos(nextAngle)*innerR, e.y+Math.sin(nextAngle)*innerR);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#CC0000' : '#FF0000'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:2; ctx.stroke();
        break;
      }
      case 'cautious': {
        ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.stroke();
        const eyeSize=e.radius*0.25, eyeOffset=e.radius*0.4, nervousness=Math.sin(time*8)*0.1;
        ctx.fillStyle='white'; ctx.beginPath();
        ctx.arc(e.x-eyeOffset+nervousness, e.y-eyeOffset, eyeSize,0,Math.PI*2);
        ctx.arc(e.x+eyeOffset-nervousness, e.y-eyeOffset, eyeSize,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=e.behavior==='hunt_enemy'?'red':'black'; ctx.beginPath();
        ctx.arc(e.x-eyeOffset+nervousness, e.y-eyeOffset, eyeSize*0.6,0,Math.PI*2);
        ctx.arc(e.x+eyeOffset-nervousness, e.y-eyeOffset, eyeSize*0.6,0,Math.PI*2); ctx.fill();
        break;
      }
      case 'speedy': {
        const trailLength = e.behavior==='hunt_enemy'?8:5;
        for(let i=0;i<trailLength;i++){
          const alpha=1-(i/trailLength), trailRadius=e.radius*(1-i*0.08), trailX=e.x-(e.vx||0)*i*3, trailY=e.y-(e.vy||0)*i*3;
          ctx.globalAlpha=alpha*0.7; ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(trailX,trailY,trailRadius,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha=1;
        ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*0.8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=e.behavior==='hunt_enemy'?'#FF0000':'#FFFF00'; ctx.lineWidth=2; ctx.stroke();
        break;
      }
      case 'tank': {
        const segments=3;
        for(let i=0;i<segments;i++){
          const segmentRadius=e.radius*(1-i*0.15), alpha=1-i*0.2;
          ctx.globalAlpha=alpha; ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(e.x,e.y,segmentRadius,0,Math.PI*2); ctx.fill();
          if(i===0){ ctx.strokeStyle=e.behavior==='hunt_enemy'?'rgba(200,0,0,0.8)':'rgba(100,100,100,0.8)'; ctx.lineWidth=3; ctx.stroke(); }
        }
        ctx.globalAlpha=1; break;
      }
      case 'hunter':
        ctx.fillStyle=displayColor; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.stroke();
        if(e.behavior==='chase' || e.behavior==='hunt_food' || e.behavior==='hunt_enemy'){
          ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : '#00FF00'; ctx.lineWidth = e.behavior==='hunt_enemy'?3:2;
          const crossSize=e.radius*(e.behavior==='hunt_enemy'?1.4:1.2);
          ctx.beginPath(); ctx.moveTo(e.x-crossSize,e.y); ctx.lineTo(e.x+crossSize,e.y); ctx.moveTo(e.x,e.y-crossSize); ctx.lineTo(e.x,e.y+crossSize); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*(e.behavior==='hunt_enemy'?1.5:1.3),0,Math.PI*2); ctx.stroke();
        }
        break;
    }
    if(e.behavior==='hunt_enemy'){ ctx.fillStyle='rgba(255,0,0,0.2)'; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius*1.3,0,Math.PI*2); ctx.fill(); }
    if(e.fearLevel>3){ const shake=(Math.random()-0.5)*e.fearLevel; ctx.fillStyle='rgba(255,255,0,0.3)'; ctx.beginPath(); ctx.arc(e.x+shake,e.y+shake,e.radius*1.1,0,Math.PI*2); ctx.fill(); }
  }
  for(const e of enemies) renderEnemy(e);

  // player (pulse / rage)
  const time = Date.now()*0.002;
  let pulse = 1 + Math.sin(time)*0.03;
  if(player.rageMode) pulse = 1 + Math.sin(time*3)*0.08;

  let centerColor='#66B2FF', midColor='#4A90E2', borderColor='#2E5C8A', strokeColor='#1A4B73', glowColor=null, glowBlur=0;
  if(player.rageMode){ centerColor='#FF8FA3'; midColor='#FF006E'; borderColor='#CC0052'; strokeColor='#990040'; glowColor='#FF006E'; glowBlur=20; }

  if(player.split){
    for(const b of player.splitBalls){
      const pr=b.radius*pulse;
      if(glowColor){ ctx.shadowColor=glowColor; ctx.shadowBlur=glowBlur; }
      const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,pr);
      g.addColorStop(0,centerColor); g.addColorStop(0.7,midColor); g.addColorStop(1,borderColor);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,pr,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.strokeStyle=strokeColor; ctx.lineWidth=player.rageMode?3:2; ctx.stroke();
    }
  } else {
    const pr=player.radius*pulse;
    if(glowColor){ ctx.shadowColor=glowColor; ctx.shadowBlur=glowBlur; }
    const g=ctx.createRadialGradient(player.x,player.y,0,player.x,player.y,pr);
    g.addColorStop(0,centerColor); g.addColorStop(0.7,midColor); g.addColorStop(1,borderColor);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(player.x,player.y,pr,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.strokeStyle=strokeColor; ctx.lineWidth=player.rageMode?3:2; ctx.stroke();
  }

  ctx.restore();
  drawMini();
}

function drawMini(){
  if(minimapWrap.classList.contains('hidden')) return;
  const w=mini.width,h=mini.height; mctx.clearRect(0,0,w,h);
  mctx.fillStyle='#071c2d'; mctx.fillRect(0,0,w,h);
  const sx=w/WORLD_W, sy=h/WORLD_H;

  // borda do mundo
  mctx.strokeStyle='#0ff7'; mctx.lineWidth=1.5; mctx.strokeRect(0,0,w,h);

  const halfW=(W*0.5)/camera.zoom, halfH=(H*0.5)/camera.zoom;
  mctx.strokeStyle='#ffffffb0'; mctx.lineWidth=1.5;
  mctx.strokeRect((camera.x-halfW)*sx,(camera.y-halfH)*sy,(halfW*2)*sx,(halfH*2)*sy);

  function dot(x,y,r,c){ mctx.fillStyle=c; mctx.beginPath(); mctx.arc(x*sx,y*sy,Math.max(2,r*sx*0.35),0,Math.PI*2); mctx.fill(); }
  for(const e of enemies) dot(e.x,e.y,e.radius,'#ff5577');
  for(const bonus of powerUps) dot(bonus.x,bonus.y,bonus.radius,'#FF006E');
  const {x:px,y:py} = playerCentroid();
  const pr = player.split ? Math.max(...player.splitBalls.map(b=>b.radius)) : player.radius;
  dot(px,py,pr,'#00ff99');
}

/* ===== Visibilidade (pausa simples) ===== */
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && gameRunning){ gameRunning=false; } });
