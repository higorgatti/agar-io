// ==============================
// Agar Mobile - ai.js
// IA dos inimigos: decidir comportamento e mover
// ==============================
import { getDifficulty } from './difficulty.js';
import { WORLD } from './constants.js';
import { now, dist, clamp } from './utils.js';
import { state } from './state.js';
import { playerCentroid, totalPlayerMass } from './player.js';

/**
 * Decide o comportamento do inimigo e define um alvo (e.target)
 * Possíveis behaviors: 'wander' | 'hunt_food' | 'chase' | 'flee' | 'hunt_enemy'
 */
export function updateEnemyAI(e) {
  const t = now();
  if (t - e.lastThink < 150) return; // pensa a cada ~150ms
  e.lastThink = t;

  const { x: pX, y: pY } = playerCentroid();

  // velocidade média do player (estimativa leve)
  const pv = (function avgVel() {
    const cells = state.player.split ? state.player.splitBalls : [state.player];
    let vx = 0, vy = 0;
    for (const c of cells) { vx += (c.vx || 0); vy += (c.vy || 0); }
    const n = Math.max(1, cells.length);
    return { vx: vx / n, vy: vy / n };
  })();

  const dToPlayer = dist(e.x, e.y, pX, pY);

  // predição leve (varia por tipo e distância)
  let predict = 1.0;
  if (e.type === 'hunter')      predict = 1.5;
  else if (e.type === 'aggressive') predict = 1.2;
  else if (e.type === 'cautious')   predict = 0.8;
  else if (e.type === 'speedy')     predict = 0.7;

  predict *= Math.min(2.0, dToPlayer / 100);
  const predicted = { x: pX + pv.vx * predict * 60, y: pY + pv.vy * predict * 60 };

  // arrefece medo com o tempo
  e.fearLevel = Math.max(0, e.fearLevel - 0.5);

  // 1) chance de caçar outro inimigo menor por perto
  let targetEnemy = null;
  let closest = Infinity;
  for (const o of state.enemies) {
    if (o === e) continue;
    const d = dist(e.x, e.y, o.x, o.y);
    if (e.mass > o.mass * 1.3 && d < 250 && d < closest) {
      targetEnemy = o; closest = d;
    }
  }
  if (targetEnemy) {
    e.behavior = 'hunt_enemy';
    const tVx = targetEnemy.vx || 0, tVy = targetEnemy.vy || 0;
    e.target = { x: targetEnemy.x + tVx * 0.8 * 60, y: targetEnemy.y + tVy * 0.8 * 60 };
    return;
  }

  // 2) relação com o player
  const pMass = totalPlayerMass();
  if (dToPlayer < 300) {
    if (state.player.rageMode) {
      e.behavior = 'flee'; e.target = predicted; e.fearLevel = 5;
    } else if (e.mass > pMass * 1.2) {
      e.behavior = 'chase'; e.target = predicted;
    } else if (pMass > e.mass * 1.5) {
      e.behavior = 'flee'; e.target = predicted; e.fearLevel = 3;
    } else {
      e.behavior = 'hunt_food';
    }
  } else {
    e.behavior = 'hunt_food';
  }

  // 3) se for caçar comida, pega a mais próxima num raio
  if (e.behavior === 'hunt_food') {
    let closestF = null, cd = Infinity;
    for (const f of state.food) {
      const d = dist(e.x, e.y, f.x, f.y);
      if (d < 200 && d < cd) { closestF = f; cd = d; }
    }
    if (closestF) e.target = { x: closestF.x, y: closestF.y };
    else e.behavior = 'wander';
  }
}

/**
 * Move o inimigo na direção do objetivo, com ajustes por tipo/behavior.
 */
export function moveEnemyAI(e) {
  let targetX = e.x, targetY = e.y;

  // velocidade-base por tipo + escala por tamanho
  let speed = (e.baseSpeed || 0.3) * (30 / (e.radius + 10));
  if (e.type === 'aggressive')       speed *= 1.3;
  else if (e.type === 'cautious' && e.behavior === 'flee') speed *= 1.6;
  else if (e.type === 'speedy')      speed *= 1.8;
  else if (e.type === 'tank')        speed *= 0.7;
  else if (e.type === 'hunter')      speed *= 1.2;

  switch (e.behavior) {
    case 'hunt_enemy':
      if (e.target) { targetX = e.target.x; targetY = e.target.y; speed *= 1.5; }
      break;
    case 'chase':
      if (e.target) { targetX = e.target.x; targetY = e.target.y; speed *= 1.3; }
      break;
    case 'flee':
      if (e.target) {
        const dx = e.x - e.target.x, dy = e.y - e.target.y;
        const d = Math.hypot(dx, dy) || 1;
        targetX = e.x + (dx / d) * 120;
        targetY = e.y + (dy / d) * 120;
        speed  *= (1.4 + e.fearLevel * 0.1);
      }
      break;
    case 'hunt_food':
      if (e.target) { targetX = e.target.x; targetY = e.target.y; }
      break;
    default: // wander
      targetX = e.x + (Math.random() - 0.5) * 80;
      targetY = e.y + (Math.random() - 0.5) * 80;
      speed *= 0.8;
  }

  // manter distância das bordas
  const margin = e.radius + 50;
  if (e.x < margin)               targetX = e.x + 120;
  if (e.x > WORLD.w - margin)     targetX = e.x - 120;
  if (e.y < margin)               targetY = e.y + 120;
  if (e.y > WORLD.h - margin)     targetY = e.y - 120;

  // aceleração amortecida
  const dx = targetX - e.x, dy = targetY - e.y;
  const d  = Math.hypot(dx, dy) || 1;
  const ax = (dx / d) * speed, ay = (dy / d) * speed;

  e.vx = (e.vx * 0.75) + (ax * 0.25);
  e.vy = (e.vy * 0.75) + (ay * 0.25);

  // limitar velocidade
  const v = Math.hypot(e.vx, e.vy), maxS = speed;
  if (v > maxS) { e.vx = (e.vx / v) * maxS; e.vy = (e.vy / v) * maxS; }

  // aplicar movimento + clamping na arena
  e.x += e.vx; e.y += e.vy;
  e.x = clamp(e.x, e.radius, WORLD.w - e.radius);
  e.y = clamp(e.y, e.radius, WORLD.h - e.radius);
}