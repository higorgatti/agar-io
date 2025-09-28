// ==============================
// Agar Mobile - systems.js
// Rage, itens, pellets, partículas, câmera e interações
// ==============================

import {
  WORLD,
  RAGE_MS,
  ENEMY_EAT,
  PLAYER_DIE
} from './constants.js';

import {
  now, dist, clamp, lerp, massToRadius
} from './utils.js';

import {
  state, ui, overPane, minimapWrap, mobileBtns
} from './state.js';

import {
  playerCells,
  totalPlayerMass,
  applyMassGainToPlayer
} from './player.js';

/* ======================
   Partículas / Pellets
   ====================== */
export function createParticles(x, y, color = '#FFD700'){
  for(let i=0;i<6;i++){
    state.particles.push({
      x: x + (Math.random()-0.5)*10,
      y: y + (Math.random()-0.5)*10,
      vx: (Math.random()-0.5)*4,
      vy: (Math.random()-0.5)*4,
      life: now() + 800,
      color,
      size: Math.random()*3 + 1
    });
  }
}

export function updateParticles(){
  for(let i=state.particles.length-1; i>=0; i--){
    const p = state.particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.95; p.vy *= 0.95;
    if (now() > p.life) state.particles.splice(i,1);
  }
}

export function updatePelletPhysics(){
  for(let i=state.pellets.length-1; i>=0; i--){
    const p = state.pellets[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.98; p.vy *= 0.98;
    if (now() > p.life || p.x<0 || p.x>WORLD.w || p.y<0 || p.y>WORLD.h){
      state.pellets.splice(i,1);
    }
  }
}

/* ======================
   Rage mode
   ====================== */
function safeSpawnRageLater(){
  const delay = 3000 + Math.random()*5000;
  setTimeout(()=>{ if (state.gameRunning) spawnRageBonus(); }, delay);
}
function spawnRageBonus(){
  state.powerUps.push({
    x: Math.random()*WORLD.w,
    y: Math.random()*WORLD.h,
    radius: 15,
    type: 'rage',
    color: '#FF006E',
    emoji: '😡',
    pulse: Math.random()*6.28
  });
}

export function updateRage(){
  // player coleta bônus rage
  for (let i = state.powerUps.length - 1; i >= 0; i--){
    const b = state.powerUps[i];
    let hit = false;
    for (const c of playerCells()){
      if (dist(c.x,c.y,b.x,b.y) < c.radius + b.radius){ hit = true; break; }
    }
    if (!hit) continue;

    state.player.rageMode = true;
    state.player.rageEnd  = now() + RAGE_MS;
    createParticles(b.x, b.y, '#FF006E');
    for (let j=0;j<8;j++) createParticles(b.x + (Math.random()-0.5)*30, b.y + (Math.random()-0.5)*30, '#FF006E');

    state.powerUps.splice(i,1);
    safeSpawnRageLater();
  }

  if (state.player.rageMode && now() > state.player.rageEnd){
    state.player.rageMode = false;
  }
}

/* ======================
   Comida / Itens genéricos
   ====================== */
export function eatItems(list, radiusFn, massGainFn, color){
  outer: for (let i=list.length-1; i>=0; i--){
    const item = list[i];
    for (const c of playerCells()){
      if (dist(c.x,c.y,item.x,item.y) < c.radius + radiusFn(item)){
        createParticles(item.x,item.y,color);
        const gain = massGainFn(item) * (state.player.rageMode ? 3 : 1);
        c.mass += gain; c.radius = massToRadius(c.mass);
        state.score += 1; list.splice(i,1);
        if (state.player.rageMode) createParticles(c.x,c.y,'#FF006E');
        continue outer;
      }
    }
  }
}

/* ======================
   Inimigos: interações e respawn
   ====================== */
function respawnEnemy(en){
  en.mass = 20 + Math.random()*40;
  en.radius = massToRadius(en.mass);
  en.x = Math.random()*WORLD.w;
  en.y = Math.random()*WORLD.h;
  en.behavior = 'wander';
  en.target = null;
  en.fearLevel = 0;
}

function eatEnemy(idxE){
  const en = state.enemies[idxE];
  createParticles(en.x, en.y, '#FF4444');
  const gain = en.mass * 0.9 * (state.player.rageMode ? 2 : 1);
  applyMassGainToPlayer(gain);
  if (state.player.rageMode){
    for(let j=0;j<5;j++){
      createParticles(en.x + (Math.random()-0.5)*20, en.y + (Math.random()-0.5)*20, '#FF006E');
    }
  }
  respawnEnemy(en);
}

/* Game Over local para evitar dependência circular com main.js */
function endGameLocal(){
  state.gameRunning = false;
  ui.classList.add('hidden');
  minimapWrap.classList.add('hidden');
  mobileBtns.classList.add('hidden');

  // UI final
  const finalScore = document.getElementById('finalScore');
  const finalMass  = document.getElementById('finalMass');
  if (finalScore) finalScore.textContent = state.score;
  if (finalMass)  finalMass.textContent  = Math.floor(totalPlayerMass());

  overPane.classList.remove('hidden');
}

/* Resolve colisão player × inimigo (come/morre) */
function resolvePlayerEnemyCollision(e, idx){
  const cellsRef = playerCells();

  for (let i=0; i<cellsRef.length; i++){
    const cells = playerCells(); // pode mudar ao remover uma célula
    const c = cells[i]; if (!c) break;

    if (dist(c.x,c.y,e.x,e.y) >= c.radius + e.radius) continue;

    // player (célula) come o inimigo
    if (c.mass > e.mass * ENEMY_EAT){
      eatEnemy(idx);
      return true; // este inimigo já foi respawnado
    }

    // inimigo come a célula do player
    if (e.mass > c.mass * PLAYER_DIE){
      createParticles(c.x, c.y, '#FF4444');
      e.mass += c.mass * 0.8; e.radius = massToRadius(e.mass);

      if (!state.player.split){
        endGameLocal(); // fim de jogo
        return true;
      }
      // remove a célula comida
      state.player.splitBalls.splice(i,1);
      if (state.player.splitBalls.length === 0){
        endGameLocal();
        return true;
      }
    }
  }
  return false;
}

/* ======================
   Interações por frame
   ====================== */
export function runEnemyInteractions(){
  // Para cada inimigo, processar interações básicas e com o player
  for (let i=0; i<state.enemies.length; i++){
    const e = state.enemies[i];

    // inimigos comem comida
    for (let k=state.food.length-1; k>=0; k--){
      const f = state.food[k];
      if (dist(e.x,e.y,f.x,f.y) < e.radius + f.radius){
        e.mass += 0.3 * f.radius; e.radius = massToRadius(e.mass);
        state.food.splice(k,1);
      }
    }

    // inimigos comem pellets
    for (let k=state.pellets.length-1; k>=0; k--){
      const p = state.pellets[k];
      if (dist(e.x,e.y,p.x,p.y) < e.radius + p.radius){
        e.mass += p.mass * 0.9; e.radius = massToRadius(e.mass);
        state.pellets.splice(k,1);
      }
    }

    // inimigos comem outros inimigos
    for (let j=i+1; j<state.enemies.length; j++){
      const o = state.enemies[j];
      if (dist(e.x,e.y,o.x,o.y) < e.radius + o.radius){
        if (e.mass > o.mass * ENEMY_EAT){
          createParticles(o.x,o.y,o.color);
          e.mass += o.mass * 0.9; e.radius = massToRadius(e.mass);
          respawnEnemy(o);
        } else if (o.mass > e.mass * ENEMY_EAT){
          createParticles(e.x,e.y,e.color);
          o.mass += e.mass * 0.9; o.radius = massToRadius(o.mass);
          respawnEnemy(e);
        }
      }
    }

    // player × inimigo (pode encerrar o jogo)
    if (resolvePlayerEnemyCollision(e, i)){
      if (!state.gameRunning) return; // jogo acabou
    }
  }
}

/* ======================
   Câmera
   ====================== */
export function updateCamera(){
  const m = totalPlayerMass();
  const targetZoom = clamp(1 - (m - 10)/350, 0.45, 1.2);

  state.camera.zoom = lerp(state.camera.zoom, targetZoom, 0.03);

  // segue o centro de massa do player
  const cells = playerCells();
  const tm = m || 1;
  let cx=0, cy=0;
  for (const c of cells){ cx += c.x * c.mass; cy += c.y * c.mass; }
  cx /= tm; cy /= tm;

  state.camera.x = lerp(state.camera.x, cx, 0.08);
  state.camera.y = lerp(state.camera.y, cy, 0.08);
}