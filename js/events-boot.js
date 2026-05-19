    // イベント登録と起動処理
    function armAutoPlayGestureRetry() {
        if (autoPlayGestureRetryArmed || !getAutoPlayEnabled()) return;
        autoPlayGestureRetryArmed = true;
        const retry = () => {
            autoPlayGestureRetryArmed = false;
            document.removeEventListener('pointerdown', retry, true);
            document.removeEventListener('keydown', retry, true);
            if (!getAutoPlayEnabled() || !bothReady() || pipExportActive) return;
            if (!videoLeft.paused || !videoRight.paused) return;
            autoPlayLatch = false;
            requestAutoPlay('user gesture retry', true);
        };
        document.addEventListener('pointerdown', retry, true);
        document.addEventListener('keydown', retry, true);
    }

    async function waitUntilTransportPlaying(maxFrames) {
        const limit = maxFrames > 0 ? maxFrames : 15;
        for (let i = 0; i < limit; i++) {
            if (!videoLeft.paused && !videoRight.paused) return true;
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return !videoLeft.paused && !videoRight.paused;
    }

    function requestAutoPlay(source, force) {
        if (!bothReady()) {
            autoPlayLatch = false;
            return;
        }
        if (!getAutoPlayEnabled() || pipExportActive) return;
        if (transportPlayInFlight) return;
        if (!force && autoPlayLatch) return;
        if (!videoLeft.paused || !videoRight.paused) {
            autoPlayLatch = true;
            return;
        }
        autoPlayLatch = true;
        writeLog('Auto play: ' + source + ' — starting playback');
        applyTimeToVideos(parseFloat(seekBar.value) || 0);
        void resumeTransportPlaybackAfterSeek();
    }

    function maybeAutoPlayWhenBothReady() {
        requestAutoPlay('both videos ready', false);
    }

    function scheduleSessionTransportRestoreRetry() {
        if (sessionRestoreListenersArmed) return;
        sessionRestoreListenersArmed = true;
        let tries = 0;
        const tick = () => {
            if (!bothReady()) return;
            if (pendingRestoreTime == null) {
                sessionRestoreListenersArmed = false;
                return;
            }
            primePendingRestoreTransportUi();
            if (!applyPendingTransportRestore()) {
                if (tries++ < 24) requestAnimationFrame(tick);
                return;
            }
            writeLog(
                'Restored transport to ' + formatTimecodeForTransport(parseFloat(seekBar.value) || 0)
            );
            sessionRestoreListenersArmed = false;
        };
        tick();
        videoLeft.addEventListener('canplay', tick, { once: true });
        videoRight.addEventListener('canplay', tick, { once: true });
    }

    function onBothVideosMediaReady() {
        if (!bothReady()) return;
        if (pendingRestoreTime != null) {
            primePendingRestoreTransportUi();
            if (applyPendingTransportRestore()) {
                writeLog(
                    'Restored transport to ' + formatTimecodeForTransport(parseFloat(seekBar.value) || 0)
                );
            } else {
                scheduleSessionTransportRestoreRetry();
            }
            return;
        }
        if (!autoPlayAfterUserLoad) return;
        autoPlayAfterUserLoad = false;
        maybeAutoPlayWhenBothReady();
    }

    function onMetaFor(side) {
        updatePanelInfoLine(side);
        syncSeekMax();
        updateControlsEnabled();
        onBothVideosMediaReady();
    }
    videoLeft.addEventListener('loadedmetadata', () => onMetaFor('left'));
    videoRight.addEventListener('loadedmetadata', () => onMetaFor('right'));
    videoLeft.addEventListener('loadeddata', () => onMetaFor('left'));
    videoRight.addEventListener('loadeddata', () => onMetaFor('right'));
    videoLeft.addEventListener('durationchange', () => onMetaFor('left'));
    videoRight.addEventListener('durationchange', () => onMetaFor('right'));

    let durationProgressRaf = 0;
    function onDurationMaybeProgress() {
        if (durationProgressRaf) return;
        durationProgressRaf = requestAnimationFrame(() => {
            durationProgressRaf = 0;
            if (bothReady()) {
                onBothVideosMediaReady();
                return;
            }
            syncSeekMax();
            updateControlsEnabled();
            updatePanelInfoLine('left');
            updatePanelInfoLine('right');
            updateDriftAndOverlays();
        });
    }
    videoLeft.addEventListener('progress', onDurationMaybeProgress);
    videoRight.addEventListener('progress', onDurationMaybeProgress);
    document.querySelectorAll('input[name="audioMode"]').forEach((radio) => {
        radio.addEventListener('change', async (ev) => {
            writePrefs();
            if (ev.isTrusted) {
                writeLog('Audio output: ' + audioModeLabel(getAudioMode()));
                flashSeekHint('Audio', audioModeLabel(getAudioMode()), 'notice');
            }
            if (mediaSrcL && mediaSrcR && audioCtx) {
                try {
                    if (audioCtx.state === 'suspended') {
                        await audioCtx.resume();
                    }
                    buildAudioGraph(getAudioMode());
                } catch (err) {
                    writeLog('Audio route update error: ' + (err && err.message ? err.message : String(err)));
                }
            }
            schedulePersistSession();
            flashTransportOptBox('audio');
        });
    });

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', () => {
            applyLayoutSelection(null, 'Layout: ');
        });
    }

    if (loopPlaybackCheckbox) {
        loopPlaybackCheckbox.addEventListener('change', () => {
            logAndPersistLoopPlayback();
        });
    }

    if (autoPlayCheckbox) {
        autoPlayCheckbox.addEventListener('change', () => {
            logAndPersistAutoPlay();
        });
    }

    if (playbackSpeedDown) {
        playbackSpeedDown.addEventListener('click', () => {
            bumpPlaybackSpeedStep(-1, 'button');
        });
    }
    if (playbackSpeedUp) {
        playbackSpeedUp.addEventListener('click', () => {
            bumpPlaybackSpeedStep(1, 'button');
        });
    }

    if (exportPipBtn) {
        exportPipBtn.addEventListener('click', () => {
            void runSilentWebmExport();
        });
    }

    if (exportModeSelect) {
        exportModeSelect.addEventListener('change', () => {
            writePrefs();
            updateControlsEnabled();
        });
    }
    if (exportBurnTcCheckbox) {
        exportBurnTcCheckbox.addEventListener('change', () => {
            if (isSoloExportMode() && !exportBurnTcCheckbox.checked) {
                exportBurnTcCheckbox.checked = true;
                showSoloTcNoticeDialog();
                return;
            }
            writePrefs();
        });
    }
    if (soloTcNoticeOverlay) {
        soloTcNoticeOverlay.addEventListener('click', (e) => {
            if (e.target === soloTcNoticeOverlay) {
                hideSoloTcNoticeDialog();
            }
        });
    }
    if (soloTcNoticeOk) {
        soloTcNoticeOk.addEventListener('click', () => {
            hideSoloTcNoticeDialog();
        });
    }

    document.addEventListener(
        'wheel',
        (ev) => {
            if (pipExportActive) ev.preventDefault();
        },
        { passive: false, capture: true }
    );
    document.addEventListener(
        'touchmove',
        (ev) => {
            if (pipExportActive) ev.preventDefault();
        },
        { passive: false, capture: true }
    );

    seekBar.addEventListener('pointerdown', () => {
        isSeeking = true;
        writeLog('Seek bar: grab (scrub start)');
    });
    ['pointerup', 'pointercancel'].forEach((ev) => {
        seekBar.addEventListener(ev, () => {
            isSeeking = false;
            const t = parseFloat(seekBar.value) || 0;
            writeLog('Seek bar: release at ' + formatTimecodeForTransport(t));
            flashSeekHint('Scrub', formatTimecodeForTransport(t));
            updateSeekUiFromVideos();
            if (!videoLeft.paused || !videoRight.paused) {
                if (!rafId) rafId = requestAnimationFrame(tick);
            }
            if (document.activeElement === seekBar) {
                seekBar.blur();
            }
            writePrefs();
            schedulePersistSession();
        });
    });

    seekBar.addEventListener('input', () => {
        const t = parseFloat(seekBar.value);
        applyTimeToVideos(t);
        currentTimeEl.textContent = formatTimecodeForTransport(t);
        updateDriftAndOverlays();
        logSeekBarInputThrottled(t);
        flashSeekScrubThrottled(t);
    });

    /** シーク後に左右を再生（キー / Numpad ジャンプで止まったとき用。再生ボタンからも利用） */
    async function resumeTransportPlaybackAfterSeek() {
        if (!bothReady()) return false;
        if (transportPlayInFlight) return transportPlayInFlight;

        transportPlayInFlight = (async () => {
            ensureWebAudioRouting();
            if (audioCtx && audioCtx.state === 'suspended') {
                try {
                    await audioCtx.resume();
                } catch (_) {}
            }
            releaseStuckEnded();
            try {
                await videoLeft.play();
                await videoRight.play();
                if (!(await waitUntilTransportPlaying())) {
                    throw new Error('videos remain paused after play()');
                }
                applyPlaybackSpeedToVideos();
                setPlayingUi(true);
                if (!rafId) rafId = requestAnimationFrame(tick);
                return true;
            } catch (err) {
                autoPlayLatch = false;
                writeLog(
                    'Transport: resume failed — ' + (err && err.message ? err.message : String(err))
                );
                videoLeft.pause();
                videoRight.pause();
                setPlayingUi(false);
                if (getAutoPlayEnabled()) armAutoPlayGestureRetry();
                return false;
            } finally {
                transportPlayInFlight = null;
            }
        })();

        return transportPlayInFlight;
    }

    playStopBtn.addEventListener('click', async () => {
        if (!bothReady()) return;
        const playing = !videoLeft.paused || !videoRight.paused;
        if (playing) {
            writeLog('Transport: pause (button)');
            videoLeft.pause();
            videoRight.pause();
            setPlayingUi(false);
            stopRaf();
            updateSeekUiFromVideos();
            writePrefs();
            schedulePersistSession();
        } else {
            writeLog('Transport: play (button)');
            applyTimeToVideos(parseFloat(seekBar.value));
            await resumeTransportPlaybackAfterSeek();
        }
    });

    videoLeft.addEventListener('pause', () => {
        if (videoRight.paused) {
            setPlayingUi(false);
        }
    });
    videoRight.addEventListener('pause', () => {
        if (videoLeft.paused) {
            setPlayingUi(false);
        }
    });
    videoLeft.addEventListener('play', () => {
        if (!videoLeft.paused || !videoRight.paused) {
            setPlayingUi(true);
            if (!rafId) rafId = requestAnimationFrame(tick);
        }
    });
    videoRight.addEventListener('play', () => {
        if (!videoLeft.paused || !videoRight.paused) {
            setPlayingUi(true);
            if (!rafId) rafId = requestAnimationFrame(tick);
        }
    });

    function onVideoEnded(ev) {
        if (pipExportActive) return;
        const v = ev.target;
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        const masterEnd = Math.max(dL, dR);
        const d = getDuration(v);
        if (d < masterEnd - 1e-3) {
            return;
        }
        if (getLoopPlaybackEnabled()) {
            writeLog('Playback: loop restart (head)');
            applyTimeToVideos(0);
            seekBar.value = '0';
            currentTimeEl.textContent = formatTimecodeForTransport(0);
            updateDriftAndOverlays();
            writePrefs();
            schedulePersistSession();
            void resumeTransportPlaybackAfterSeek();
            return;
        }
        videoLeft.pause();
        videoRight.pause();
        stopRaf();
        setPlayingUi(false);
        updateSeekUiFromVideos();
        writeLog('Playback: end reached (transport stopped)');
    }
    videoLeft.addEventListener('ended', onVideoEnded);
    videoRight.addEventListener('ended', onVideoEnded);

    window.addEventListener('keydown', (e) => {
        if (isSoloTcNoticeOpen()) {
            if (e.code === 'Escape') {
                e.preventDefault();
                hideSoloTcNoticeDialog();
            }
            return;
        }
        if (pipExportActive) {
            if (e.code === 'Escape') {
                e.preventDefault();
                tryCancelSilentWebmExportFromEsc();
                return;
            }
            e.preventDefault();
            return;
        }
        if (isTypingTarget(e.target)) return;

        if (document.activeElement === seekBar) {
            const appKey =
                e.code === 'Space' ||
                e.code === 'ArrowLeft' ||
                e.code === 'ArrowRight' ||
                /^Numpad[0-9]$/.test(e.code) ||
                e.code === 'KeyB' ||
                e.code === 'KeyO' ||
                e.code === 'KeyN' ||
                e.code === 'KeyM' ||
                e.code === 'KeyV' ||
                e.code === 'KeyL' ||
                e.code === 'NumpadAdd' ||
                e.code === 'NumpadSubtract' ||
                e.code === 'NumpadMultiply' ||
                e.code === 'Comma' ||
                e.code === 'Period' ||
                e.code === 'Slash';
            if (appKey) seekBar.blur();
        }

        const isArrowKey = e.code === 'ArrowLeft' || e.code === 'ArrowRight';
        if (e.repeat && !isArrowKey) return;

        const audioByKey = { KeyB: 'split-mono', KeyO: 'old-stereo', KeyN: 'new-stereo', KeyM: 'mute' };
        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            Object.prototype.hasOwnProperty.call(audioByKey, e.code)
        ) {
            e.preventDefault();
            const mode = audioByKey[e.code];
            const rad = document.querySelector('input[name="audioMode"][value="' + mode + '"]');
            if (rad) {
                rad.checked = true;
                writeLog('Keyboard: ' + e.code + ' -> ' + audioModeLabel(mode));
                flashSeekHint('Audio', audioModeLabel(mode), 'notice');
                rad.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }

        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.code === 'KeyV'
        ) {
            if (!viewModeSelect) return;
            e.preventDefault();
            const cur = getViewMode();
            const i = Math.max(0, VIEW_MODE_VALUES.indexOf(cur));
            const next = VIEW_MODE_VALUES[(i + 1) % VIEW_MODE_VALUES.length];
            applyLayoutSelection(next, 'Keyboard: KeyV -> ');
            return;
        }

        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.code === 'KeyL'
        ) {
            if (!loopPlaybackCheckbox) return;
            e.preventDefault();
            loopPlaybackCheckbox.checked = !loopPlaybackCheckbox.checked;
            logAndPersistLoopPlayback();
            return;
        }

        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.code === 'KeyA'
        ) {
            if (!autoPlayCheckbox) return;
            e.preventDefault();
            autoPlayCheckbox.checked = !autoPlayCheckbox.checked;
            logAndPersistAutoPlay();
            return;
        }

        const playbackSpeedDeltaByKey = {
            NumpadAdd: 1,
            NumpadSubtract: -1,
            Period: 1,
            Comma: -1,
        };
        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            Object.prototype.hasOwnProperty.call(playbackSpeedDeltaByKey, e.code)
        ) {
            e.preventDefault();
            bumpPlaybackSpeedStep(playbackSpeedDeltaByKey[e.code], e.code);
            return;
        }

        if (
            !e.repeat &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            (e.code === 'NumpadMultiply' || e.code === 'Slash')
        ) {
            e.preventDefault();
            resetPlaybackSpeedStep(e.code);
            return;
        }

        const numpadSeekDigit = {
            Numpad0: 0,
            Numpad1: 1,
            Numpad2: 2,
            Numpad3: 3,
            Numpad4: 4,
            Numpad5: 5,
            Numpad6: 6,
            Numpad7: 7,
            Numpad8: 8,
            Numpad9: 9,
        };
        if (Object.prototype.hasOwnProperty.call(numpadSeekDigit, e.code)) {
            if (e.repeat) return;
            if (!bothReady()) return;
            e.preventDefault();
            const d = numpadSeekDigit[e.code];
            const dur = masterDuration();
            const target = Math.max(0, Math.min(dur - 0.001, (d / 10) * dur));
            const wasPlaying = !videoLeft.paused || !videoRight.paused;
            applyTimeToVideos(target);
            seekBar.value = String(target);
            currentTimeEl.textContent = formatTimecodeForTransport(target);
            updateDriftAndOverlays();
            writePrefs();
            schedulePersistSession();
            writeLog(
                'Seek keyboard: Numpad ' +
                    d +
                    ' -> ' +
                    formatTimecodeForTransport(target) +
                    ' (decile ' +
                    d +
                    '/10)'
            );
            flashSeekHint('Jump ' + d + '/10', formatTimecodeForTransport(target));
            if (wasPlaying) void resumeTransportPlaybackAfterSeek();
            return;
        }

        if (e.code === 'Space') {
            if (e.repeat) return;
            e.preventDefault();
            if (!playStopBtn.disabled) {
                writeLog('Keyboard: Space -> transport toggle');
                playStopBtn.click();
            }
            return;
        }

        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            if (!bothReady()) return;
            e.preventDefault();
            const wasPlaying = !videoLeft.paused || !videoRight.paused;
            const dur = masterDuration();
            const dir = e.code === 'ArrowRight' ? 1 : -1;
            let stepSec;
            if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                stepSec = 10;
            } else if (e.ctrlKey || e.metaKey) {
                stepSec = 5;
            } else if (e.shiftKey) {
                stepSec = 1;
            } else {
                stepSec = masterFrameSec;
            }
            const oneFrameStep = !e.shiftKey && !e.ctrlKey && !e.metaKey;
            if (oneFrameStep && wasPlaying) {
                videoLeft.pause();
                videoRight.pause();
                setPlayingUi(false);
                stopRaf();
                updateSeekUiFromVideos();
            }
            let t = (parseFloat(seekBar.value) || 0) + dir * stepSec;
            t = Math.max(0, Math.min(dur - 0.001, t));
            applyTimeToVideos(t);
            seekBar.value = String(t);
            currentTimeEl.textContent = formatTimecodeForTransport(t);
            updateDriftAndOverlays();
            writePrefs();
            schedulePersistSession();
            let stepLabel;
            if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                stepLabel = 'Ctrl+Shift ±10s';
            } else if (e.ctrlKey || e.metaKey) {
                stepLabel = 'Ctrl ±5s';
            } else if (e.shiftKey) {
                stepLabel = 'Shift ±1s';
            } else {
                stepLabel = 'Frame ±1f';
            }
            const arrow = e.code === 'ArrowRight' ? 'ArrowRight' : 'ArrowLeft';
            const line =
                'Seek keyboard: ' +
                arrow +
                ' (' +
                stepLabel +
                ') -> ' +
                formatTimecodeForTransport(t) +
                (e.repeat ? ' (repeat)' : '');
            if (!e.repeat) {
                writeLog(line);
            } else {
                logArrowSeekDebounced(line);
            }
            const sym = dir > 0 ? '→' : '←';
            let deltaTxt;
            if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                deltaTxt = dir > 0 ? '+10s' : '−10s';
            } else if (e.ctrlKey || e.metaKey) {
                deltaTxt = dir > 0 ? '+5s' : '−5s';
            } else if (e.shiftKey) {
                deltaTxt = dir > 0 ? '+1s' : '−1s';
            } else {
                deltaTxt = dir > 0 ? '+1f' : '−1f';
            }
            flashSeekHint(sym, deltaTxt);
            if (!oneFrameStep && wasPlaying) void resumeTransportPlaybackAfterSeek();
        }
    });

    syncSeekMax();
    updateControlsEnabled();

    function persistOnPageExit() {
        writePrefs();
        persistSessionToStorage().catch(() => {});
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            persistOnPageExit();
            persistSessionToStorage()
                .then(() => writeLog('Session: persisted (tab hidden)'))
                .catch((err) =>
                    writeLog(
                        'Session: persist failed — ' +
                            (err && err.message ? err.message : String(err))
                    )
                );
        }
    });
    window.addEventListener('pagehide', persistOnPageExit);
    window.addEventListener('beforeunload', persistOnPageExit);

    (async function boot() {
        try {
            await restoreSessionFromStorage();
        } catch (e) {
            writeLog('Session restore: ' + (e && e.message ? e.message : String(e)));
        }
        syncSeekMax();
        updateControlsEnabled();
        onBothVideosMediaReady();
    })();
