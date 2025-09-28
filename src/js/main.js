// ==============================
// Agar Mobile - main.js (Entry)
// ==============================

// Dificuldade
import { setDifficultyByName, getDifficulty } from './difficulty.js';

// Estado, canvas e elementos de UI
import {
  view,                 // { canvas, ctx, mini, mctx, W, H, DPR }
  state,                // { gameRunning, score, player, enemies, food, powerUps, pellets, particles, camera, moveTarget, splitEnd }
  fit, reset,           // ajuste de canvas e reset do estado
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

// IA dos inimigos
import { updateEnemyAI, moveEnemyAI } from './ai.js';

// Sistemas (rage/itens/partículas/câmera/interações)
import {
  updateRage,
  eatItems,
  updateParticles,
  updatePelletPhysics,
  updateCamera,
  runEnemyInteractions
} from './systems.js';

// Renderização
import { render } from './render.js';

//
// ---------- configurações iniciais ----------
setDifficultyByName('normal');            // defina 'easy' | 'normal' | 'hard' | 'insane'
fit();                                    // dimensiona o canvas ao carregar
addEventListener('resize', fit, { passive: true });

// (se houver <select id="difficulty"> no index.html, isto habilita a troca pela UI)
const diffSelect = document.getElementById('difficulty');
if (diffSelect) {
  diffSelect.addEventListener('change', (e) => {
    setDifficultyByName(e.target.value);
  });
}

//
// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const elScore = $('#score');
const elMass = $('#mass');
const elRageStatus = $('#rageStatus');
const elRageTime = $('#rageTime');

const btnStart   = $('#btnStart');
const btnRestart = $('#btnRestart');
const btnSplit   = $('#btnSplit');
const btnEject   = $('#btnEject');

function screenToWorld(clientX, clientY) {
  const rect = view.canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (view.W / rect.width);
  const y = (clientY - rect.top)  * (view.H / rect.height);
  const cx = view.W * 0.5, cy = view.H * 0.5;
  return {
    x: ((x - cx) / state.camera.zoom) + state.camera.x,
    y: ((y - cy) / state.camera.zoom) + state.camera.y
  };
}

//
// ---------- toque (mobile) ----------
let lastTap = 0;

function onTouchStart(e) {
  if (!state.gameRunning) return;
  const t = Date.now();
  if (t - lastTap < 250) splitPlayer(); // toque duplo => divide
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
view.canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });

//
// ---------- botões ----------
btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);
btnSplit.addEventListener('click', () => { if (state.gameRunning) splitPlayer(); });
btnEject.addEventListener('click', () => { if (state.gameRunning) ejectMass(); });

//
// ---------- fluxo do jogo ----------
function startGame(){
  // aplica a dificuldade atual
  const diff = getDifficulty();
  reset({
    foodCount:   diff.foodCount,
    enemyCount:  diff.enemyCount,
    initialRage: diff.initialRage
  });

  // liga o jogo e prepara UI
  state.gameRunning = true;
  window.__GAME_RUNNING__ = true;

  startPane.classList.add('hidden');
  overPane.classList.add('hidden');
  ui.classList.remove('hidden');
  minimapWrap.classList.remove('hidden');
  mobileBtns.classList.remove('hidden');

  // HUD inicial
  elScore.textContent = 0;
  elMass.textContent  = Math.floor(totalPlayerMass());
  if (elRageStatus) elRageStatus.style.display = 'none';

  requestAnimationFrame(loop);
}

function endGame() {
  state.gameRunning = false;
  ui.classList.add('hidden');
  minimapWrap.classList.add('hidden');
  mobileBtns.classList.add('hidden');

  $('#finalScore').textContent = state.score;
  $('#finalMass').textContent  = Math.floor(totalPlayerMass());

  overPane.classList.remove('hidden');
}

// pausa ao trocar de aba
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.gameRunning) state.gameRunning = false;
});

//
// ---------- loop ----------
function loop() {
  if (!state.gameRunning) return;
  update();
  render();
  requestAnimationFrame(loop);
}

function update() {
  // Player
  movePlayer();
  separatePlayerCells();       // evita sobrepor células divididas
  maybeMerge();

  // Sistemas
  updateRage();
  updateParticles();
  updatePelletPhysics();

  // Coleta do player
  eatItems(state.food,    (f) => f.radius, (f) => 0.25 * f.radius, '#00FF88');
  eatItems(state.pellets, (p) => p.radius, (p) => p.mass * 0.8,    '#FFD700');

  // IA + movimento
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    updateEnemyAI(e);
    moveEnemyAI(e);
  }

  // Interações (inimigos comem/morrem, player morre, etc.)
  runEnemyInteractions();

  // Câmera
  updateCamera();

  // HUD
  elScore.textContent = state.score;
  elMass.textContent  = Math.floor(totalPlayerMass());

  if (state.player.rageMode) {
    const remain = Math.max(0, Math.ceil((state.player.rageEnd - Date.now()) / 1000));
    elRageTime.textContent = remain;
    elRageStatus.style.display = 'block';
  } else {
    elRageStatus.style.display = 'none';
  }
}

// expõe se algum módulo precisar
export { startGame, endGame, loop, update };