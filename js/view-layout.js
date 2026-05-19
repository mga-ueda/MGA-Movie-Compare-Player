    // === 2. 映像レイアウト（VIEW_MODE）とループ UI
    const VIEW_MODE_VALUES = ['side-by-side', 'stack-diff', 'stack-cross'];

    function getViewMode() {
        if (!viewModeSelect) return 'side-by-side';
        const v = viewModeSelect.value || 'side-by-side';
        return VIEW_MODE_VALUES.indexOf(v) >= 0 ? v : 'side-by-side';
    }

    function applySavedViewMode(mode) {
        if (!viewModeSelect) return;
        let m;
        if (mode === 'stack-exclusion') {
            m = 'stack-diff';
        } else {
            m = VIEW_MODE_VALUES.indexOf(mode) >= 0 ? mode : 'side-by-side';
        }
        viewModeSelect.value = m;
    }

    function viewModeLabelEn(mode) {
        if (mode === 'stack-diff') return 'Difference';
        if (mode === 'stack-cross') return 'Overlay';
        return 'Side by Side';
    }

    function isStackViewMode(mode) {
        return mode != null && mode !== 'side-by-side';
    }

    function applyViewMode(modeOpt) {
        const mode =
            modeOpt != null && VIEW_MODE_VALUES.indexOf(modeOpt) >= 0 ? modeOpt : getViewMode();
        const composite = isStackViewMode(mode);
        if (compareStage) compareStage.classList.toggle('compare-stage--composite', composite);
        if (compareGrid) compareGrid.toggleAttribute('hidden', composite);
        if (compareComposite) compareComposite.toggleAttribute('hidden', !composite);

        videoLeft.classList.remove('video-stack-bottom');
        videoRight.classList.remove('video-stack-top--diff', 'video-stack-top--cross');
        if (composite && frameStack && timecodeOverlayStack) {
            videoLeft.classList.add('video-stack-bottom');
            if (mode === 'stack-diff') videoRight.classList.add('video-stack-top--diff');
            else if (mode === 'stack-cross') videoRight.classList.add('video-stack-top--cross');
            frameStack.insertBefore(videoLeft, timecodeOverlayStack);
            frameStack.insertBefore(videoRight, timecodeOverlayStack);
        } else if (frameLeft && frameRight && timecodeOverlayLeft && timecodeOverlayRight) {
            frameLeft.insertBefore(videoLeft, timecodeOverlayLeft);
            frameRight.insertBefore(videoRight, timecodeOverlayRight);
        }
        updateDriftAndOverlays();
    }

    /** プルダウンと映像 DOM を同じモードに揃える（キー / select 共通） */
    function applyLayoutSelection(modeOpt, logPrefix) {
        if (!viewModeSelect) return;
        let mode;
        if (modeOpt != null && VIEW_MODE_VALUES.indexOf(modeOpt) >= 0) {
            mode = modeOpt;
            viewModeSelect.value = mode;
        } else {
            mode = getViewMode();
        }
        applyViewMode(mode);
        writePrefs();
        if (logPrefix) writeLog(logPrefix + viewModeLabelEn(mode));
        flashSeekHint('Layout', viewModeLabelEn(mode), 'notice');
        schedulePersistSession();
        flashTransportOptBox('view');
    }

    function getLoopPlaybackEnabled() {
        return !!(loopPlaybackCheckbox && loopPlaybackCheckbox.checked);
    }

    function applySavedLoopPlayback(enabled) {
        if (!loopPlaybackCheckbox) return;
        loopPlaybackCheckbox.checked = enabled !== false;
    }

    function logAndPersistLoopPlayback() {
        const on = getLoopPlaybackEnabled();
        writePrefs();
        schedulePersistSession();
        writeLog('Loop playback: ' + (on ? 'ON' : 'OFF'));
        flashSeekHint('Loop', on ? 'ON' : 'OFF', 'notice');
        flashTransportOptBox('playback');
    }

    function getAutoPlayEnabled() {
        return !!(autoPlayCheckbox && autoPlayCheckbox.checked);
    }

    function applySavedAutoPlay(enabled) {
        if (!autoPlayCheckbox) return;
        autoPlayCheckbox.checked = enabled !== false;
    }

    function logAndPersistAutoPlay() {
        const on = getAutoPlayEnabled();
        writePrefs();
        writeLog('Auto play: ' + (on ? 'ON' : 'OFF'));
        flashSeekHint('Auto Play', on ? 'ON' : 'OFF', 'notice');
        flashTransportOptBox('playback');
    }

