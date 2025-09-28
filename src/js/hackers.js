// hackers.js — lógica do modal Hackers
let selectedHackers = new Set(['speed','shield','magnet','splitbomb','sizeboost','invisibility','freeze']);
const hackersModal = document.getElementById('hackersModal');
const btnHackers   = document.getElementById('btnHackers');
const hackersClose = document.getElementById('hackersClose');
const hackersSave  = document.getElementById('hackersSave');
const hackersAll   = document.getElementById('hackersAll');
const hackersClear = document.getElementById('hackersClear');
const hackersBadge = document.getElementById('hackersBadge');

function openHackers(){ hackersModal.classList.remove('hidden'); }
function closeHackers(){ hackersModal.classList.add('hidden'); }

btnHackers.addEventListener('click', openHackers);
hackersClose.addEventListener('click', closeHackers);

hackersAll.addEventListener('click', () => {
  document.querySelectorAll('#hackersModal input[type="checkbox"]').forEach(cb => cb.checked = true);
});
hackersClear.addEventListener('click', () => {
  document.querySelectorAll('#hackersModal input[type="checkbox"]').forEach(cb => cb.checked = false);
});

hackersSave.addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('#hackersModal input[type="checkbox"]:checked')).map(cb => cb.value);
  selectedHackers = new Set(checked);
  hackersBadge.textContent = checked.length;
  btnHackers.classList.toggle('active', checked.length > 0);
  closeHackers();
});

hackersBadge.textContent = selectedHackers.size;

export function getHackersSelection(){ return selectedHackers; }
