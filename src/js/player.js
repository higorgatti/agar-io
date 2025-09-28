// ==============================
// Agar Mobile - player.js
// Movimento, divisão, ejetar, merge e utilidades do player
// ==============================

import { WORLD, MAX_SPLITS, SPLIT_LOCK_MS } from './constants.js';
import { now, dist, clamp, massToRadius, speedFromRadius } from './utils.js';
import { state } from './state.js';

/* ---------- Helpers de células ---------- */
export function playerCells(){
  return state.player.split ? state.player.splitBalls : [state.player];
}

export function totalPlayerMass(){
  return playerCells().reduce((s,c)=> s + c.mass, 0);
}

export function playerCentroid(){
  const cells = playerCells();
  const tm = totalPlayerMass() || 1;
  let x=0, y=0;
  for(const c of cells){ x += c.x * c.mass; y += c.y * c.mass; }
  return { x: x/tm, y: y/tm };
}

// usado por sistemas que querem distribuir ganho entre células
export function applyMassGainToPlayer(totalGain){
  const cells = playerCells();
  const tm = totalPlayerMass() || 1;
  for(const c of cells){
    const share = c.mass / tm;
    c.mass += totalGain * share;
    c.radius = massToRadius(c.mass);
  }
}

/* ---------- Alvo de movimento ---------- */
function getTarget(){
  if (state.moveTarget) return { x: state.moveTarget.x, y: state.moveTarget.y };
  return playerCentroid();
}

/* ---------- Movimento do player ---------- */
export function movePlayer(){
  const t = getTarget();
  const cells = playerCells();

  for (const c of cells){
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d  = Math.hypot(dx, dy) || 1;

    // bônus leve de velocidade quando dividido (mais células = um pouco mais ágil)
    const splits = state.player.split ? cells.length : 1;
    const speedBoost = Math.min(2.0, 1 + (splits - 1) * 0.15);

    const ax = (dx / d) * 0.6 * speedBoost;
    const ay = (dy / d) * 0.6 * speedBoost;
    const maxS = speedFromRadius(c.radius) * speedBoost;

    c.vx = (c.vx || 0) * 0.85 + ax;
    c.vy = (c.vy || 0) * 0.85 + ay;

    const v = Math.hypot(c.vx, c.vy);
    if (v > maxS){
      c.vx = (c.vx / v) * maxS;
      c.vy = (c.vy / v) * maxS;
    }

    c.x += c.vx; c.y += c.vy;
    c.x = clamp(c.x, c.radius, WORLD.w - c.radius);
    c.y = clamp(c.y, c.radius, WORLD.h - c.radius);
  }

  // se não está dividido, manter a entidade principal sincronizada
  if(!state.player.split){
    state.player.x  = cells[0].x;
    state.player.y  = cells[0].y;
    state.player.vx = cells[0].vx;
    state.player.vy = cells[0].vy;
  }
}

/* ---------- Dividir ---------- */
export function splitPlayer(){
  const cells = playerCells();
  if (state.player.split && cells.length >= MAX_SPLITS) return;
  if (!state.player.split && state.player.mass < 20)   return;

  const t = getTarget();

  if (!state.player.split){
    // primeira divisão em 2
    const a = Math.atan2(t.y - state.player.y, t.x - state.player.x);
    const d = 30;
    const m = state.player.mass / 2;

    state.player.split = true;
    state.player.splitBalls = [
      {
        x: state.player.x + Math.cos(a)*d,
        y: state.player.y + Math.sin(a)*d,
        mass: m,
        radius: massToRadius(m),
        vx: Math.cos(a)*4, vy: Math.sin(a)*4,
        splitTime: now()
      },
      {
        x: state.player.x - Math.cos(a)*d,
        y: state.player.y - Math.sin(a)*d,
        mass: m,
        radius: massToRadius(m),
        vx: -Math.cos(a)*4, vy: -Math.sin(a)*4,
        splitTime: now()
      }
    ];

    // trava a recombinação por 10s
    state.splitEnd = now() + SPLIT_LOCK_MS;

  } else {
    // já dividido: cada bola grande o suficiente divide em 2
    const newBalls = [];
    for (const ball of state.player.splitBalls){
      if (ball.mass >= 20){
        const a = Math.atan2(t.y - ball.y, t.x - ball.x);
        const d = ball.radius + 15;
        const half = ball.mass / 2;

        newBalls.push({
          x: ball.x + Math.cos(a)*d,
          y: ball.y + Math.sin(a)*d,
          mass: half,
          radius: massToRadius(half),
          vx: Math.cos(a)*5, vy: Math.sin(a)*5,
          splitTime: now()
        });
        newBalls.push({
          x: ball.x - Math.cos(a)*d,
          y: ball.y - Math.sin(a)*d,
          mass: half,
          radius: massToRadius(half),
          vx: -Math.cos(a)*5, vy: -Math.sin(a)*5,
          splitTime: now()
        });
      } else {
        newBalls.push(ball);
      }
    }
    state.player.splitBalls = newBalls.slice(0, MAX_SPLITS);

    // toda nova divisão renova o travamento
    state.splitEnd = now() + SPLIT_LOCK_MS;
  }
}

/* ---------- Ejetar massa ---------- */
export function ejectMass(){
  if (totalPlayerMass() < 15) return;

  const t = getTarget();
  const shoot = (x, y, r, setMass) => {
    const a = Math.atan2(t.y - y, t.x - x);
    const amount = 2, speed = 8;

    // pellets vivem em state.pellets (adicionados por systems.js)
    state.pellets.push({
      x: x + Math.cos(a)*(r + 5),
      y: y + Math.sin(a)*(r + 5),
      vx: Math.cos(a)*speed,
      vy: Math.sin(a)*speed,
      mass: amount,
      radius: 4,
      life: now() + 5000
    });

    setMass(-amount);
  };

  if (state.player.split){
    for (const b of state.player.splitBalls){
      if (b.mass < 15) continue;
      shoot(b.x, b.y, b.radius, (dm) => {
        b.mass += dm; b.radius = massToRadius(b.mass);
      });
    }
  } else {
    shoot(state.player.x, state.player.y, state.player.radius, (dm) => {
      state.player.mass += dm; state.player.radius = massToRadius(state.player.mass);
    });
  }
}

/* ---------- Impedir sobreposição (separação física) ---------- */
export function separatePlayerCells(){
  if(!state.player.split) return;
  const cells = state.player.splitBalls;

  for (let i=0; i<cells.length; i++){
    for (let j=i+1; j<cells.length; j++){
      const a = cells[i], b = cells[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (d === 0) d = 0.01; // evita divisão por zero

      if (d < minDist){
        const overlap = (minDist - d) + 0.5; // pequena folga
        const nx = dx / d, ny = dy / d;

        // empurra meio-a-meio
        a.x -= nx * (overlap * 0.5);
        a.y -= ny * (overlap * 0.5);
        b.x += nx * (overlap * 0.5);
        b.y += ny * (overlap * 0.5);

        // amortecer velocidades para não vibrar
        a.vx = (a.vx || 0) * 0.7; a.vy = (a.vy || 0) * 0.7;
        b.vx = (b.vx || 0) * 0.7; b.vy = (b.vy || 0) * 0.7;
      }
    }
  }

  // mantém dentro da arena
  for (const c of cells){
    c.x = clamp(c.x, c.radius, WORLD.w - c.radius);
    c.y = clamp(c.y, c.radius, WORLD.h - c.radius);
  }
}

/* ---------- Merge (recombinação) ---------- */
export function maybeMerge(){
  if (!state.player.split) return;

  const t = now();

  // só permite merge depois do lock (10s)
  if (t >= state.splitEnd){
    let merged = true;

    while (merged && state.player.splitBalls.length > 1){
      merged = false;

      for (let i=0; i<state.player.splitBalls.length; i++){
        for (let j=i+1; j<state.player.splitBalls.length; j++){
          const a = state.player.splitBalls[i];
          const b = state.player.splitBalls[j];
          if (dist(a.x,a.y,b.x,b.y) < (a.radius + b.radius) * 0.8){
            const total = a.mass + b.mass;
            const newBall = {
              x: (a.x*a.mass + b.x*b.mass)/total,
              y: (a.y*a.mass + b.y*b.mass)/total,
              mass: total,
              radius: massToRadius(total),
              vx: (a.vx + b.vx)/2,
              vy: (a.vy + b.vy)/2,
              splitTime: Math.max(a.splitTime, b.splitTime)
            };
            state.player.splitBalls.splice(j,1);
            state.player.splitBalls.splice(i,1);
            state.player.splitBalls.push(newBall);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    // se sobrou só uma, volta ao modo não dividido
    if (state.player.splitBalls.length === 1){
      const b = state.player.splitBalls[0];
      state.player.split = false;
      state.player.x = b.x; state.player.y = b.y;
      state.player.mass = b.mass; state.player.radius = b.radius;
      state.player.vx = b.vx; state.player.vy = b.vy;
      state.player.splitBalls = [];
    }
  }

  // merge “rápido” de bolinhas muito pequenas após 2s da sua criação
  if (state.player.split){
    for (let i=0; i<state.player.splitBalls.length; i++){
      const ball = state.player.splitBalls[i];
      if (ball.mass < 15){
        const dt = t - ball.splitTime;
        if (dt > 2000){
          let nearest = -1, best = Infinity;
          for (let j=0; j<state.player.splitBalls.length; j++){
            if (i === j) continue;
            const d = dist(ball.x, ball.y, state.player.splitBalls[j].x, state.player.splitBalls[j].y);
            if (d < best){ best = d; nearest = j; }
          }
          if (nearest !== -1){
            const other = state.player.splitBalls[nearest];
            const total = ball.mass + other.mass;
            other.x = (ball.x*ball.mass + other.x*other.mass)/total;
            other.y = (ball.y*ball.mass + other.y*other.mass)/total;
            other.mass = total; other.radius = massToRadius(total);
            state.player.splitBalls.splice(i,1); i--;
          }
        }
      }
    }
  }
}