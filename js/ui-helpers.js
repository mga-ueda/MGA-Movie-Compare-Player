    // === 1. UI 補助（トランスポート枠の glow・マニュアル accordion）
    const transportOptGlowClearTimers = { view: 0, speed: 0, playback: 0, audio: 0 };
    function flashTransportOptBox(which) {
        const sel =
            which === 'view'
                ? '.transport-opt-box--view'
                : which === 'speed'
                  ? '.transport-opt-box--speed'
                  : which === 'playback'
                    ? '.transport-opt-box--playback'
                    : which === 'loop'
                      ? '.transport-opt-box--playback'
                      : '.transport-opt-box--audio';
        const box = document.querySelector(sel);
        if (!box) return;
        box.classList.remove('transport-opt-box--glow');
        if (transportOptGlowClearTimers[which]) {
            clearTimeout(transportOptGlowClearTimers[which]);
            transportOptGlowClearTimers[which] = 0;
        }
        void box.offsetWidth;
        box.classList.add('transport-opt-box--glow');
        transportOptGlowClearTimers[which] = setTimeout(() => {
            box.classList.remove('transport-opt-box--glow');
            transportOptGlowClearTimers[which] = 0;
        }, 900);
    }

    (function bindAppDocFoldAccordion() {
        const folds = document.querySelectorAll('details.app-doc-fold');
        if (!folds.length) return;
        folds.forEach((d) => {
            d.addEventListener('toggle', () => {
                if (!d.open) return;
                folds.forEach((other) => {
                    if (other !== d) other.removeAttribute('open');
                });
            });
        });
    })();

