// ==============================
// Agar Mobile - utils.js
// Funções auxiliares usadas em todo o jogo
// ==============================

// Tempo atual (ms)
export const now = () => Date.now();

// Distância entre 2 pontos
export const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

// Mantém valor dentro de um intervalo [a, b]
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Interpolação linear
export const lerp = (a, b, t) => a + (b - a) * t;

// Número aleatório entre a e b
export const rand = (a, b) => a + Math.random() * (b - a);

// Converte massa em raio
export function massToRadius(m) {
  return Math.sqrt(Math.max(0.0001, m)) * 2 + 5;
}

// Calcula velocidade a partir do raio
export function speedFromRadius(r) {
  return 12 / Math.sqrt(r + 30);
}