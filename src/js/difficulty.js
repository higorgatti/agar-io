// ==============================
// Agar Mobile - difficulty.js
// 4 níveis de dificuldade (config centralizada)
// ==============================

export const DIFFICULTIES = {
  easy: {
    name: 'Fácil',
    enemyCount: 12,         // menos inimigos
    foodCount: 400,         // mais comida
    initialRage: 6,         // mais power-ups iniciais
    enemySpeedMul: 0.7,     // inimigos mais lentos
    rageDelayMin: 2500,     // respawn de rage mais frequente
    rageDelayMax: 5000
  },
  normal: {
    name: 'Normal',
    enemyCount: 25,
    foodCount: 320,
    initialRage: 5,
    enemySpeedMul: 1.0,
    rageDelayMin: 3000,
    rageDelayMax: 8000
  },
  hard: {
    name: 'Difícil',
    enemyCount: 32,
    foodCount: 250,
    initialRage: 4,
    enemySpeedMul: 1.2,
    rageDelayMin: 5000,
    rageDelayMax: 10000
  },
  insane: {
    name: 'Insano',
    enemyCount: 45,
    foodCount: 200,
    initialRage: 3,
    enemySpeedMul: 1.4,
    rageDelayMin: 7000,
    rageDelayMax: 12000
  }
};

// estado interno do módulo (nível atual)
let _current = DIFFICULTIES.normal;

export function setDifficultyByName(name){
  _current = DIFFICULTIES[name] ?? DIFFICULTIES.normal;
  return _current;
}

export function getDifficulty(){
  return _current;
}