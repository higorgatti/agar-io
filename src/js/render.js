// ==============================
// Agar Mobile - render.js
// Desenho do mundo, entidades e minimapa
// ==============================

import { WORLD } from './constants.js';
import { now } from './utils.js';
import { state, view, minimapWrap } from './state.js';
import { playerCells, playerCentroid, totalPlayerMass } from './player.js';

/* ======================
   Render principal
   ====================== */
export function render(){
  const { ctx } = view;

  // reset transform (tamanho CSS)
  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  ctx.clearRect(0, 0, view.W, view.H);

  ctx.save();
  // câmera
  ctx.translate(view.W * 0.5, view.H * 0.5);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  // --- GRID ---
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD.w; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke();
  }
  for (let y = 0; y < WORLD.h; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
  }

  // --- COMIDA (emoji) ---
  for (const f of state.food) {
    ctx.font = '18px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.emoji, f.x, f.y);
  }

  // --- BÔNUS RAGE ---
  for (const bonus of state.powerUps) {
    const t = now() * 0.005;
    const pulse = 1 + Math.sin(t + bonus.pulse) * 0.2;
    const pr = bonus.radius * pulse;

    ctx.shadowColor = bonus.color;
    ctx.shadowBlur  = 15;
    ctx.fillStyle   = bonus.color;
    ctx.beginPath(); ctx.arc(bonus.x, bonus.y, pr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = '20px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(bonus.emoji, bonus.x, bonus.y);
  }

  // --- PELLETS ---
  for (const p of state.pellets) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
  }

  // --- PARTÍCULAS ---
  for (const p of state.particles) {
    const life = Math.max(0, (p.life - now()) / 800);
    if (life > 0) {
      ctx.globalAlpha = life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.size * life), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // --- INIMIGOS ---
  function renderEnemy(e){
    const t = now() * 0.003;
    e.animPhase += 0.02;

    // cor base por comportamento
    let display = e.color;
    if      (e.behavior === 'hunt_enemy') display = '#FF0000';
    else if (e.behavior === 'chase')      display = '#FF6B6B';
    else if (e.behavior === 'flee')       display = '#4ECDC4';
    else if (e.behavior === 'hunt_food')  display = '#45B7D1';
    else if (e.fearLevel > 0)             display = '#FFD93D';

    switch (e.type) {
      case 'basic':
        ctx.fillStyle = display;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : 'rgba(255,255,255,.45)';
        ctx.lineWidth   = e.behavior==='hunt_enemy' ? 3 : 1;
        ctx.stroke();
        break;

      case 'aggressive': {
        const spikes = 8, spikeLength = e.radius * (e.behavior==='hunt_enemy' ? 0.4 : 0.3);
        ctx.fillStyle = display;
        ctx.beginPath();
        for (let i=0; i<spikes; i++){
          const ang  = (i/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          const nAng = ((i+1)/spikes)*Math.PI*2 + e.animPhase*(e.behavior==='hunt_enemy'?1:0.5);
          const innerR = e.radius - spikeLength * 0.5;
          const outerR = e.radius + spikeLength * (0.5 + Math.sin(t*(e.behavior==='hunt_enemy'?4:2)+i)*0.3);
          if (i===0) ctx.moveTo(e.x + Math.cos(ang)*outerR, e.y + Math.sin(ang)*outerR);
          ctx.lineTo(e.x + Math.cos(ang)*outerR, e.y + Math.sin(ang)*outerR);
          ctx.lineTo(e.x + Math.cos(nAng)*innerR, e.y + Math.sin(nAng)*innerR);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#CC0000' : '#FF0000';
        ctx.lineWidth   = e.behavior==='hunt_enemy' ? 3 : 2;
        ctx.stroke();
        break;
      }

      case 'cautious': {
        ctx.fillStyle = display;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke();

        const eye = e.radius*0.25, off = e.radius*0.4, nerv = Math.sin(t*8)*0.1;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(e.x-off+nerv, e.y-off, eye, 0, Math.PI*2);
        ctx.arc(e.x+off-nerv, e.y-off, eye, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = e.behavior==='hunt_enemy' ? 'red' : 'black';
        ctx.beginPath();
        ctx.arc(e.x-off+nerv, e.y-off, eye*0.6, 0, Math.PI*2);
        ctx.arc(e.x+off-nerv, e.y-off, eye*0.6, 0, Math.PI*2);
        ctx.fill();
        break;
      }

      case 'speedy': {
        const tail = e.behavior==='hunt_enemy' ? 8 : 5;
        for (let i=0; i<tail; i++){
          const alpha = 1 - (i / tail);
          const rr = e.radius * (1 - i * 0.08);
          const tx = e.x - (e.vx || 0) * i * 3;
          const ty = e.y - (e.vy || 0) * i * 3;
          ctx.globalAlpha = alpha * 0.7;
          ctx.fillStyle = display;
          ctx.beginPath(); ctx.arc(tx, ty, rr, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = display;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius*0.8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : '#FFFF00';
        ctx.lineWidth = 2; ctx.stroke();
        break;
      }

      case 'tank': {
        const segs = 3;
        for (let i=0;i<segs;i++){
          const r = e.radius * (1 - i*0.15);
          const a = 1 - i*0.2;
          ctx.globalAlpha = a;
          ctx.fillStyle = display;
          ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.fill();
          if (i===0){
            ctx.strokeStyle = e.behavior==='hunt_enemy' ? 'rgba(200,0,0,0.8)' : 'rgba(100,100,100,0.8)';
            ctx.lineWidth = 3; ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'hunter':
        ctx.fillStyle = display;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke();
        if (e.behavior==='chase' || e.behavior==='hunt_food' || e.behavior==='hunt_enemy'){
          ctx.strokeStyle = e.behavior==='hunt_enemy' ? '#FF0000' : '#00FF00';
          ctx.lineWidth   = e.behavior==='hunt_enemy' ? 3 : 2;
          const s = e.radius * (e.behavior==='hunt_enemy' ? 1.4 : 1.2);
          ctx.beginPath(); ctx.moveTo(e.x - s, e.y); ctx.lineTo(e.x + s, e.y);
          ctx.moveTo(e.x, e.y - s); ctx.lineTo(e.x, e.y + s); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * (e.behavior==='hunt_enemy' ? 1.5 : 1.3), 0, Math.PI*2); ctx.stroke();
        }
        break;
    }

    if (e.behavior === 'hunt_enemy'){
      ctx.fillStyle = 'rgba(255,0,0,0.2)';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius*1.3, 0, Math.PI*2); ctx.fill();
    }
    if (e.fearLevel > 3){
      const shake = (Math.random()-0.5) * e.fearLevel;
      ctx.fillStyle = 'rgba(255,255,0,0.3)';
      ctx.beginPath(); ctx.arc(e.x+shake, e.y+shake, e.radius*1.1, 0, Math.PI*2); ctx.fill();
    }
  }
  for (const e of state.enemies) renderEnemy(e);

  // --- PLAYER ---
  const tNow = now() * 0.002;
  let pulse = 1 + Math.sin(tNow) * 0.03;
  if (state.player.rageMode) pulse = 1 + Math.sin(tNow * 3) * 0.08;

  // cores normais vs rage
  let center = '#66B2FF', mid = '#4A90E2', border = '#2E5C8A', stroke = '#1A4B73', glow = null, blur = 0;
  if (state.player.rageMode){
    center = '#FF8FA3'; mid = '#FF006E'; border = '#CC0052'; stroke = '#990040'; glow = '#FF006E'; blur = 20;
  }

  for (const c of playerCells()){
    const pr = c.radius * pulse;
    if (glow){ ctx.shadowColor = glow; ctx.shadowBlur = blur; }
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, pr);
    g.addColorStop(0, center);
    g.addColorStop(0.7, mid);
    g.addColorStop(1, border);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, pr, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = stroke; ctx.lineWidth = state.player.rageMode ? 3 : 2; ctx.stroke();
  }

  ctx.restore();

  // --- MINIMAPA ---
  drawMini();
}

/* ======================
   Minimap
   ====================== */
export function drawMini(){
  if (minimapWrap.classList.contains('hidden')) return;

  const { mctx, mini } = view;
  const w = mini.width, h = mini.height;

  mctx.clearRect(0,0,w,h);
  mctx.fillStyle = '#071c2d';
  mctx.fillRect(0,0,w,h);

  const sx = w / WORLD.w, sy = h / WORLD.h;

  // borda
  mctx.strokeStyle = '#0ff7';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(0,0,w,h);

  // viewport da câmera
  const halfW = (view.W * 0.5) / state.camera.zoom;
  const halfH = (view.H * 0.5) / state.camera.zoom;
  mctx.strokeStyle = '#ffffffb0';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(
    (state.camera.x - halfW) * sx,
    (state.camera.y - halfH) * sy,
    (halfW * 2) * sx,
    (halfH * 2) * sy
  );

  // helper ponto
  function dot(x,y,r,c){
    mctx.fillStyle = c;
    mctx.beginPath();
    mctx.arc(x*sx, y*sy, Math.max(2, r*sx*0.35), 0, Math.PI*2);
    mctx.fill();
  }

  // inimigos
  for (const e of state.enemies) dot(e.x, e.y, e.radius, '#ff5577');
  // bônus
  for (const b of state.powerUps) dot(b.x, b.y, b.radius, '#FF006E');
  // player
  const { x:px, y:py } = playerCentroid();
  const pr = Math.max(...playerCells().map(c => c.radius));
  dot(px, py, pr, '#00ff99');
}