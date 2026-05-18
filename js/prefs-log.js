    // === 4. ログ・シークフラッシュ・localStorage prefs
    const LOG_MAX_LINES = 500;
    function syncLogPanelHeightToShortcutGuide() {
        const guide = document.querySelector('.bottom-info .shortcut-guide');
        if (!guide || !logEl) return;
        const h = Math.max(120, guide.offsetHeight);
        logEl.style.height = h + 'px';
        logEl.style.minHeight = h + 'px';
        logEl.style.maxHeight = h + 'px';
    }
    function writeLog(m) {
        if (!logEl) return;
        const now = new Date();
        const time =
            '[' +
            String(now.getHours()).padStart(2, '0') +
            ':' +
            String(now.getMinutes()).padStart(2, '0') +
            ':' +
            String(now.getSeconds()).padStart(2, '0') +
            ']';
        const cur = logEl.innerText;
        const lines = cur ? cur.split('\n') : [];
        lines.push(time + ' - ' + m);
        if (lines.length > LOG_MAX_LINES) {
            lines.splice(0, lines.length - LOG_MAX_LINES);
        }
        logEl.innerText = lines.join('\n');
        logEl.scrollTop = logEl.scrollHeight;
        syncLogPanelHeightToShortcutGuide();
    }

    function logArrowSeekDebounced(msg) {
        const now = performance.now();
        if (now - lastArrowSeekLogAt < 220) return;
        lastArrowSeekLogAt = now;
        writeLog(msg);
    }

    function logSeekBarInputThrottled(t) {
        const now = performance.now();
        if (now - lastSeekBarInputLogAt < 160) return;
        lastSeekBarInputLogAt = now;
        writeLog('Seek bar: scrub to ' + formatTimecodeForTransport(t));
    }

    let seekFlashHideTimer = 0;
    let seekFlashAriaTimer = 0;

    function flashSeekHint(primary, secondary, kind) {
        const root = document.getElementById('seekFlashOverlay');
        const pEl = document.getElementById('seekFlashPrimary');
        const sEl = document.getElementById('seekFlashSecondary');
        if (!root || !pEl || !sEl) return;
        clearTimeout(seekFlashHideTimer);
        clearTimeout(seekFlashAriaTimer);

        pEl.textContent = primary != null ? String(primary) : '';
        const sec = secondary != null && secondary !== '' ? String(secondary) : '';
        sEl.textContent = sec;
        sEl.hidden = !sec;

        root.setAttribute('aria-hidden', 'false');
        if (!root.classList.contains('seek-flash--visible')) {
            requestAnimationFrame(() => {
                root.classList.add('seek-flash--visible');
            });
        } else {
            root.classList.add('seek-flash--visible');
        }

        const isNotice = kind === 'notice';
        const holdMs = isNotice ? 2100 : 340;
        const fadeOutMs = 820;
        seekFlashHideTimer = setTimeout(() => {
            root.classList.remove('seek-flash--visible');
        }, holdMs);
        seekFlashAriaTimer = setTimeout(() => {
            seekFlashAriaTimer = 0;
            root.setAttribute('aria-hidden', 'true');
        }, holdMs + fadeOutMs + 40);
    }

    function flashSeekScrubThrottled(t) {
        const now = performance.now();
        if (now - lastSeekFlashScrubAt < 200) return;
        lastSeekFlashScrubAt = now;
        flashSeekHint('Scrub', formatTimecodeForTransport(t));
    }

    (function initLogShortcutHeightSync() {
        const g = document.querySelector('.bottom-info .shortcut-guide');
        const scheduleSync = () => {
            requestAnimationFrame(() => {
                syncLogPanelHeightToShortcutGuide();
                requestAnimationFrame(syncLogPanelHeightToShortcutGuide);
            });
        };
        if (g && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => syncLogPanelHeightToShortcutGuide()).observe(g);
        }
        scheduleSync();
        window.addEventListener('load', scheduleSync);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleSync).catch(() => {});
        }
    })();

    function readPrefs() {
        try {
            const raw = localStorage.getItem(LS_PREFS_KEY);
            if (!raw) return {};
            const j = JSON.parse(raw);
            return j && typeof j === 'object' ? j : {};
        } catch (_) {
            return {};
        }
    }

    const EXPORT_WEBM_MODE_VALUES = ['compare-pip', 'solo-old', 'solo-new'];

    function getExportMode() {
        if (!exportModeSelect) return 'compare-pip';
        const v = exportModeSelect.value || 'compare-pip';
        return EXPORT_WEBM_MODE_VALUES.indexOf(v) >= 0 ? v : 'compare-pip';
    }

    function isSoloExportMode() {
        const m = getExportMode();
        return m === 'solo-old' || m === 'solo-new';
    }

    function getExportBurnTc() {
        if (isSoloExportMode()) return true;
        return !!(exportBurnTcCheckbox && exportBurnTcCheckbox.checked);
    }

    function canExportWebm() {
        if (pipExportActive) return false;
        const m = getExportMode();
        if (m === 'compare-pip') return bothReady();
        if (m === 'solo-old') return getDuration(videoLeft) > 0;
        if (m === 'solo-new') return getDuration(videoRight) > 0;
        return false;
    }

    function applySavedExportWebmPrefs(p) {
        if (!p || typeof p !== 'object') return;
        if (exportModeSelect && p.exportMode) {
            const m = EXPORT_WEBM_MODE_VALUES.indexOf(p.exportMode) >= 0 ? p.exportMode : 'compare-pip';
            exportModeSelect.value = m;
        }
        if (exportBurnTcCheckbox && typeof p.exportBurnTc === 'boolean') {
            exportBurnTcCheckbox.checked = p.exportBurnTc;
        }
    }

    function writePrefs() {
        try {
            localStorage.setItem(
                LS_PREFS_KEY,
                JSON.stringify({
                    audioMode: getAudioMode(),
                    transportTime: parseFloat(seekBar.value) || 0,
                    viewMode: getViewMode(),
                    loopPlayback: getLoopPlaybackEnabled(),
                    exportMode: getExportMode(),
                    exportBurnTc: getExportBurnTc(),
                })
            );
        } catch (_) {}
    }

    function applySavedAudioToRadios(mode) {
        const allowed = ['split-mono', 'old-stereo', 'new-stereo', 'mute'];
        const m = allowed.indexOf(mode) >= 0 ? mode : 'split-mono';
        const el = document.querySelector('input[name="audioMode"][value="' + m + '"]');
        if (el) el.checked = true;
    }

    function audioModeLabel(mode) {
        if (mode === 'split-mono') return 'Both (Mono + Pan)';
        if (mode === 'old-stereo') return 'Older Only (Stereo)';
        if (mode === 'new-stereo') return 'Newer Only (Stereo)';
        if (mode === 'mute') return 'Mute';
        return String(mode);
    }

