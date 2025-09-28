// ==============================
// Agar Mobile - main.js (Entry)
// ==============================

// Constantes (se precisar em main)
import { /* WORLD, */ } from './constants.js';

// Estado, canvas e elementos de UI
import {
  view,       // { canvas, ctx, mini, mctx, W, H, DPR }
  state,      // { gameRunning, score, player, enemies, food, powerUps, pellets, particles, camera, moveTarget, splitEnd }
  fit, reset, // ajuste de canvas e reset do estado
  ui, startPane, overPane, minimapWrap, mobileBtns
} from './state.js';

// Player (movimento/ações)
import {
  playerCells,
  playerCentroid,
  totalPlayerMass,
  movePlayer,
  splitPlayer,
  ejectMass,
  maybeMerge,
  separatePlayerCells
} from './player.js';

// IA de inimigos
import { updateEnemyAI, moveEnemyAI } from './ai.js';

// Sistemas gerais (rage/itens/partículas/câmera)
import {
  updateRage,
  eatItems,
  updateParticles,
  updatePelletPhysics,
  updateCamera
} from './systems.js';

// Renderização
import { render } from './render.js';

//
// ---------- DOM refs auxiliares ----------
const $ = (sel) => document.querySelector(sel);
const elScore = $('#score');
const elMass = $('#mass');
const elRageStatus = $('#rageStatus');
const elRageTime = $('#rageTime');

const btnStart = $('#btnStart');
const btnRestart = $('#btnRestart');
const btnSplit = $('#btnSplit');
const btnEject = $('#btnEject');

//
// ---------- Helpers ----------
function screenToWorld(clientX, clientY) {
  const rect = view.canvas.getBoundingClientRect();
  // normaliza para o tamanho CSS (não o pixel ratio)
  const x = (clientX - rect.left) * (view.W / rect.width);
  const y = (clientY - rect.top) * (view.H / rect.height);
  // converte para o mundo (câmera/zoom)
  const cx = view.W * 0.5;
  const cy = view.H * 0.5;
  const wx = ((x - cx) / state.camera.zoom) + state.camera.x;
  const wy = ((y - cy) / state.camera.zoom) + state.camera.y;
  return { x: wx, y: wy };
}

//
// ---------- Entrada (toque) ----------
let lastTap = 0;

function onTouchStart(e) {
  if (!state.gameRunning) return;
  const t = Date.now();
  if (t - lastTap < 250) {
    // toque duplo => dividir
    splitPlayer();
  }
  lastTap = t;

  const touch = e.touches[0];
  const p = screenToWorld(touch.clientX, touch.clientY);
  state.moveTarget = { x: p.x, y: p.y };
}

function onTouchMove(e) {
  if (!state.gameRunning) return;
  const touch = e.touches[0];
  const p = screenToWorld(touch.clientX, touch.clientY);
  state.moveTarget = { x: p.x, y: p.y };
}

// evita scroll do navegador durante o jogo
document.addEventListener('touchmove', (e) => {
  if (state.gameRunning) e.preventDefault();
}, { passive: false });

// registra eventos no canvas
view.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
view.canvas.addEventListener('touchmove', onTouchMove, { passive: false });

//
// ---------- Botões UI ----------
btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);
btnSplit.addEventListener('click', () => { if (state.gameRunning) splitPlayer(); });
btnEject.addEventListener('click', () => { if (state.gameRunning) ejectMass(); });

//
// ---------- Fluxo do jogo ----------
function startGame() {
  reset();
  state.gameRunning = true;
  startPane.classList.add('hidden');
  overPane.classList.add('hidden');
  ui.classList.remove('hidden');
  minimapWrap.classList.remove('hidden');
  mobileBtns.classList.remove('hidden');
  requestAnimationFrame(loop);
}

function endGame() {
  state.gameRunning = false;
  ui.classList.add('hidden');
  minimapWrap.classList.add('hidden');
  mobileBtns.classList.add('hidden');

  // atualiza UI de fim de jogo
  $('#finalScore').textContent = state.score;
  $('#finalMass').textContent = Math.floor(totalPlayerMass());

  overPane.classList.remove('hidden');
}

// pausa ao mudar de aba
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.gameRunning) state.gameRunning = false;
});

//
// ---------- Loop ----------
function loop() {
  if (!state.gameRunning) return;
  update();
  render(); // usa o estado atual pra desenhar
  requestAnimationFrame(loop);
}

function update() {
  // Movimento e lógica do player
  movePlayer();
  separatePlayerCells(); // evita sobreposição das células divididas
  maybeMerge();

  // Sistemas gerais
  updateRage();
  updateParticles();
  updatePelletPhysics();

  // Coleta de itens do jogador (aproveita helper genérico)
  eatItems(state.food,    (f) => f.radius, (f) => 0.25 * f.radius, '#00FF88');
  eatItems(state.pellets, (p) => p.radius, (p) => p.mass * 0.8,    '#FFD700');

  // IA + interações de inimigos
  const N = state.enemies.length;
  for (let i = 0; i < N; i++) {
    const e = state.enemies[i];
    updateEnemyAI(e);
    moveEnemyAI(e);
  }

  // Câmera
  updateCamera();

  // HUD
  elScore.textContent = state.score;
  elMass.textContent  = Math.floor(totalPlayerMass());

  // Rage status
  if (state.player.rageMode) {
    const remain = Math.max(0, Math.ceil((state.player.rageEnd - Date.now()) / 1000));
    elRageTime.textContent = remain;
    elRageStatus.style.display = 'block';
  } else {
    elRageStatus.style.display = 'none';
  }
}

// ajuste de canvas no resize
addEventListener('resize', fit, { passive: true });

// Exponha endGame se algum módulo precisar encerrar o jogo
export { startGame, endGame, loop, update };