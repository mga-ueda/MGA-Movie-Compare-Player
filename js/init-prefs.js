    // === 6. 起動時プリファレンス適用（IDB リストアは末尾の boot）
    (function initPrefsFromStorage() {
        try {
            const p = readPrefs();
            if (p.audioMode) applySavedAudioToRadios(p.audioMode);
            applySavedViewMode(p.viewMode);
            applySavedLoopPlayback(p.loopPlayback);
            applySavedExportWebmPrefs(p);
            applyViewMode(getViewMode());
        } catch (_) {}
    })();

    writeLog('MGA Movie Compare Player started (v1.0).');

