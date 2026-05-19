    // 起動時のプリファレンス適用
    (function initPrefsFromStorage() {
        try {
            const p = readPrefs();
            if (p.audioMode) applySavedAudioToRadios(p.audioMode);
            applySavedViewMode(p.viewMode);
            applySavedLoopPlayback(p.loopPlayback);
            applySavedAutoPlay(p.autoPlay);
            applySavedExportWebmPrefs(p);
            applyViewMode(getViewMode());
        } catch (_) {}
    })();

    writeLog('MGA Movie Compare Player started (' + APP_VERSION_LABEL + ').');

