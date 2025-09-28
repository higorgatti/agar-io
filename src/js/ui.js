// ui.js — manipulação da UI básica
document.querySelectorAll('.diffBtn[data-diff]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diffBtn[data-diff]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});
