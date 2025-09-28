// ==============================
// Agar Mobile - state.js
// Mantém o estado global + canvas + reset/spawns
// ==============================

import {
  MAX_DPR,
  WORLD,
  INITIAL_MASS,
  FRUITS
} from './constants.js';

import {
  massToRadius
} from './utils.js';

// ---------- Canvas & UI ----------
const canvas = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const mini    = document.getElementById('minimap');
const mctx    = mini.getContext('2d');

export const ui          = document.getElementById('ui');
export const startPane   = document.getElementById('start');
export const overPane    = document.getElementById('over');
export const minimapWrap = document.getElementById('minimapWrap');
export const mobileBtns  = document.getElementById('mobileBtns');

// Medidas da viewport e DPR
export const view = {
  canvas, ctx, mini, mctx,
  W: innerWidth,
  H: innerHeight,
  DPR: Math.min(MAX_DPR, (window.devicePixelRatio || 1))
};

// ---------- Estado de jogo ----------
export const state = {
  gameRunning: false,
  score: 0,

  player: null,          // definido em reset()
  enemies: [],
  food: [],
  powerUps: [],
  pellets: [],
  particles: [],

  camera: { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 },
  moveTarget: null,
  splitEnd: 0
};

// ---------- Ajuste de canvas ----------
export function fit() {
  view.W   = innerWidth;
  view.H   = innerHeight;
  view.DPR = Math.min(MAX_DPR, (window.devicePixelRatio || 1));

  canvas.width  = view.W * view.DPR;
  canvas.height = view.H * view.DPR;

  // importante: desenhar sempre em "tamanho CSS"
  view.ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
}
addEventListener('resize', fit, { passive: true });
fit();

// ---------- Helpers de spawn (internos deste módulo) ----------
function rand(min, max){ return min + Math.random() * (max - min); }

function randFruit() {
  const emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  return { x: Math.random() * WORLD.w, y: Math.random() * WORLD.h, radius: 10, emoji };
}

function spawnRageBonus() {
  state.powerUps.push({
    x: Math.random() * WORLD.w,
    y: Math.random() * WORLD.h,
    radius: 15,
    type: 'rage',
    color: '#FF006E',
    emoji: '😡',
    pulse: Math.random() * 6.28
  });
}

// cria um inimigo com “tipo” básico (cores/atributos variam)
function spawnEnemy() {
  const types = ['basic', 'aggressive', 'cautious', 'speedy', 'tank', 'hunter'];
  const type  = types[Math.floor(Math.random() * types.length)];

  let e = {
    x: Math.random() * WORLD.w,
    y: Math.random() * WORLD.h,
    mass: 20 + Math.random() * 50,
    radius: 0,
    vx: 0, vy: 0,
    behavior: 'wander',
    target: null,
    fearLevel: 0,
    lastThink: 0,
    type,
    blinkTimer: Math.random() * 1000,
    animPhase: Math.random() * 6.28
  };

  switch (type) {
    case 'basic':
      e.color = `hsl(${200 + Math.random() * 60},60%,50%)`;
      e.baseSpeed = 0.3; e.aggressiveness = 0.3; break;
    case 'aggressive':
      e.color = `hsl(${0 + Math.random() * 30},70%,50%)`;
      e.mass = 30 + Math.random() * 40; e.baseSpeed = 0.4; e.aggressiveness = 0.8; break;
    case 'cautious':
      e.color = `hsl(${180 + Math.random() * 40},55%,60%)`;
      e.mass = 15 + Math.random() * 25; e.baseSpeed = 0.25; e.aggressiveness = 0.1; break;
    case 'speedy':
      e.color = `hsl(${60 + Math.random() * 40},65%,55%)`;
      e.mass = 10 + Math.random() * 20; e.baseSpeed = 0.6; e.aggressiveness = 0.4; break;
    case 'tank':
      e.color = `hsl(${280 + Math.random() * 40},50%,45%)`;
      e.mass = 50 + Math.random() * 60; e.baseSpeed = 0.15; e.aggressiveness = 0.2; break;
    case 'hunter':
      e.color = `hsl(${120 + Math.random() * 40},70%,45%)`;
      e.mass = 25 + Math.random() * 35; e.baseSpeed = 0.35; e.aggressiveness = 0.6; break;
  }

  e.radius = massToRadius(e.mass);
  state.enemies.push(e);
}

// ---------- Reset geral ----------
export function reset() {
  // Player
  state.player = {
    x: WORLD.w / 2,
    y: WORLD.h / 2,
    mass: INITIAL_MASS,
    radius: massToRadius(INITIAL_MASS),
    vx: 0, vy: 0,
    split: false,
    splitBalls: [],
    rageMode: false,
    rageEnd: 0
  };

  // Coleções
  state.enemies  = [];
  state.food     = [];
  state.powerUps = [];
  state.pellets  = [];
  state.particles= [];

  // Score/fluxo
  state.score    = 0;
  state.splitEnd = 0;
  state.moveTarget = null;

  // Spawns iniciais (ajuste as quantidades se quiser)
  for (let i = 0; i < 320; i++) state.food.push(randFruit());
  for (let i = 0; i < 25;  i++) spawnEnemy();
  for (let i = 0; i < 5;   i++) spawnRageBonus();

  // Câmera centralizada
  state.camera = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 };
}

// export prático do WORLD para outros módulos, se precisarem
export { WORLD };