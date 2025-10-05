let selectedDifficulty = 'easy';
document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        selectedDifficulty = this.dataset.diff;
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const soloBtn = document.querySelector('.mode-solo');
    if (soloBtn) {
        soloBtn.addEventListener('click', () => {
            if (window.gameMain && window.gameMain.startGame) {
                window.gameMain.startGame();
            }
        });
    }
});
window.menuSystem = {
    getSelectedDifficulty: () => selectedDifficulty
};
