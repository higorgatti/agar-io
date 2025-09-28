// game.js — loop básico
import { getHackersSelection } from './hackers.js';

let score = 0;
let ctx, canvas;
let running = false;

export function startGameLoop(){
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  running = true;
  loop();
}

function resizeCanvas(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function loop(){
  if(!running) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#0f0';
  ctx.font = '20px Arial';
  ctx.fillText('Game running...', 50,50);
  ctx.fillText('Itens ativos: ' + Array.from(getHackersSelection()).join(', '), 50,80);
  requestAnimationFrame(loop);
}
