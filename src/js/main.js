import './ui.js';
import './hackers.js';
import { startGameLoop } from './game.js';

document.getElementById('btnStart').addEventListener('click', () => {
  document.getElementById('start').classList.remove('active');
  document.getElementById('hud').classList.add('active');
  startGameLoop();
});
