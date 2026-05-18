    // === 9. タイムコード・ドリフト・シーク・tick・割当ヘルパ（assignPair 等）
    function updateDriftAndOverlays() {
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        timecodeOverlayLeft.classList.toggle('video-timecode--idle', !dL);
        timecodeOverlayRight.classList.toggle('video-timecode--idle', !dR);
        timecodeOverlayLeft.textContent = dL ? formatTimecodeForSide(videoLeft.currentTime || 0, 'left') : '00:00:00:00';
        timecodeOverlayRight.textContent = dR ? formatTimecodeForSide(videoRight.currentTime || 0, 'right') : '00:00:00:00';

        const stackMode = isStackViewMode(getViewMode());
        if (timecodeOverlayStack) {
            timecodeOverlayStack.classList.toggle('video-timecode--idle', !stackMode || !bothReady());
            if (stackMode && bothReady()) {
                const t = Math.max(videoLeft.currentTime || 0, videoRight.currentTime || 0);
                const dur = masterDuration();
                timecodeOverlayStack.textContent = formatTimecodeForTransport(Math.min(t, dur));
            } else if (stackMode) {
                timecodeOverlayStack.textContent = '00:00:00:00';
            }
        }

        if (!bothReady()) {
            driftRow.hidden = true;
            return;
        }
        driftRow.hidden = false;
        if (videoLeft.ended || videoRight.ended) {
            driftMs.textContent = '----';
            driftFrames.textContent = '----';
            driftMs.classList.remove('tc-drift-ok', 'tc-drift-warn', 'tc-drift-bad');
            driftFrames.classList.remove('tc-drift-ok', 'tc-drift-warn', 'tc-drift-bad');
            return;
        }
        const tL = videoLeft.currentTime || 0;
        const tR = videoRight.currentTime || 0;
        const driftSec = Math.abs(tL - tR);
        const driftMilli = Math.round(driftSec * 1000);
        const msDisp = String(Math.min(9999, driftMilli)).padStart(4, '0');
        const mf = masterFpsIntForTransport();
        const frameDrift = Math.min(9999, Math.round(driftSec * mf));
        const frDisp = String(frameDrift).padStart(4, '0');
        driftMs.textContent = msDisp;
        driftFrames.textContent = frDisp;
        driftMs.classList.remove('tc-drift-ok', 'tc-drift-warn', 'tc-drift-bad');
        driftFrames.classList.remove('tc-drift-ok', 'tc-drift-warn', 'tc-drift-bad');
        const driftDangerFrames = Math.max(1, Math.round(0.08 * mf));
        let driftToneClass = 'tc-drift-warn';
        if (frameDrift === 0) driftToneClass = 'tc-drift-ok';
        else if (frameDrift > driftDangerFrames) driftToneClass = 'tc-drift-bad';
        driftMs.classList.add(driftToneClass);
        driftFrames.classList.add(driftToneClass);
    }

    function syncSeekMax() {
        refreshMasterFrameSec();
        const dur = masterDuration();
        seekBar.max = String(Math.max(dur, 0.01));
        seekBar.step = String(masterFrameSec);
        totalTimeEl.textContent = formatTimecodeForTransport(dur);
        updateSeekUiFromVideos();
    }

    function applyTimeToVideos(t) {
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        const setOne = (el, d) => {
            if (!d) return;
            let x = Math.min(t, d);
            if (t >= d) x = Math.max(0, d - masterFrameSec);
            el.currentTime = x;
        };
        setOne(videoLeft, dL);
        setOne(videoRight, dR);
    }

    /** 再生再開時に ended のまま固まるのを避ける */
    function releaseStuckEnded() {
        const t = parseFloat(seekBar.value) || 0;
        [videoLeft, videoRight].forEach((v) => {
            const d = getDuration(v);
            if (d && v.ended) {
                v.currentTime = Math.max(0, Math.min(t, d - masterFrameSec));
            }
        });
    }

    function updateSeekUiFromVideos() {
        const dur = masterDuration();
        if (!isSeeking && pendingRestoreTime != null && Number.isFinite(pendingRestoreTime)) {
            const t = Math.max(0, Math.min(pendingRestoreTime, dur - 0.001));
            seekBar.value = String(t);
            currentTimeEl.textContent = formatTimecodeForTransport(t);
            updateDriftAndOverlays();
            return;
        }
        const tL = videoLeft.currentTime || 0;
        const tR = videoRight.currentTime || 0;
        if (!isSeeking) {
            const t = Math.max(tL, tR);
            seekBar.value = String(Math.min(t, dur));
            currentTimeEl.textContent = formatTimecodeForTransport(Math.min(t, dur));
        }
        updateDriftAndOverlays();
    }

    function primePendingRestoreTransportUi() {
        if (pendingRestoreTime == null || !Number.isFinite(pendingRestoreTime)) return;
        const t = Math.max(0, pendingRestoreTime);
        seekBar.value = String(t);
        currentTimeEl.textContent = formatTimecodeForTransport(t);
    }

    /** 復元待ちのシーク位置を両 video に反映。seek 可能になるまで pending を維持 */
    function applyPendingTransportRestore() {
        if (pendingRestoreTime == null || !Number.isFinite(pendingRestoreTime)) return false;
        if (!bothReady()) return false;
        if (videoLeft.readyState < 2 || videoRight.readyState < 2) return false;
        const dur = masterDuration();
        const t = Math.max(0, Math.min(pendingRestoreTime, dur - 0.001));
        applyTimeToVideos(t);
        seekBar.value = String(t);
        currentTimeEl.textContent = formatTimecodeForTransport(t);
        updateDriftAndOverlays();
        const tL = videoLeft.currentTime || 0;
        const tR = videoRight.currentTime || 0;
        const drift = Math.max(Math.abs(tL - t), Math.abs(tR - t));
        if (t > 0.02 && drift > 0.2) return false;
        pendingRestoreTime = null;
        return true;
    }

    /**
     * 尺の短い側が終端付近で張り付き、長い側だけがマスター時刻まで進んでいる状態。
     * このときの currentTime 差は「同期不良」ではなくクリップ長の差なので +1f 補正をしない。
     */
    function isAsymmetricClipTailDrift() {
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        if (!dL || !dR) return false;
        const tL = videoLeft.currentTime || 0;
        const tR = videoRight.currentTime || 0;
        const eps = Math.max(masterFrameSec * 4, 0.12);
        const leftAtTail = tL >= dL - eps;
        const rightAtTail = tR >= dR - eps;
        return (leftAtTail && !rightAtTail) || (rightAtTail && !leftAtTail);
    }

    function maybeAutoSyncDriftOneFrame() {
        if (pipExportActive) return;
        if (!bothReady() || isSeeking) return;
        if (videoLeft.seeking || videoRight.seeking) return;
        if (videoLeft.paused || videoRight.paused) return;
        if (videoLeft.ended || videoRight.ended) return;
        if (isAsymmetricClipTailDrift()) return;
        const tL = videoLeft.currentTime || 0;
        const tR = videoRight.currentTime || 0;
        const driftMilli = Math.abs(tL - tR) * 1000;
        if (driftMilli < DRIFT_AUTO_FIX_MS) return;
        const now = performance.now();
        if (now - lastDriftFixAt < DRIFT_FIX_COOLDOWN_MS) return;
        lastDriftFixAt = now;
        const dur = masterDuration();
        const tMaster = Math.max(tL, tR);
        const tNew = Math.min(dur - 0.001, tMaster + masterFrameSec);
        applyTimeToVideos(tNew);
        if (now - lastDriftFixLogAt > 2200) {
            lastDriftFixLogAt = now;
            writeLog(
                'Sync auto-correct: master +1f on both (drift was ' +
                    String(Math.min(9999, Math.round(driftMilli))).padStart(4, '0') +
                    ' ms).'
            );
        }
    }

    function stopRaf() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    function tick() {
        updateSeekUiFromVideos();
        maybeAutoSyncDriftOneFrame();
        const anyPlaying = !videoLeft.paused || !videoRight.paused;
        const anySeeking = videoLeft.seeking || videoRight.seeking;
        if (anyPlaying || anySeeking) {
            rafId = requestAnimationFrame(tick);
        } else {
            rafId = 0;
        }
    }

    function setPlayingUi(playing) {
        if (playing) {
            playStopBtn.textContent = 'Pause';
            playStopBtn.classList.add('transport-toggle--stop');
            seekBarWrap.classList.add('seek-bar-wrap--playing');
        } else {
            playStopBtn.textContent = 'Play';
            playStopBtn.classList.remove('transport-toggle--stop');
            seekBarWrap.classList.remove('seek-bar-wrap--playing');
        }
    }

    function bothReady() {
        return getDuration(videoLeft) > 0 && getDuration(videoRight) > 0;
    }

    function pickWebMRecorderMimeType(withAudio) {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
        const wantA = !!withAudio;
        const candidates = wantA
            ? [
                  'video/webm;codecs=vp9,opus',
                  'video/webm;codecs=vp8,opus',
                  'video/webm;codecs=vp9',
                  'video/webm;codecs=vp8',
                  'video/webm',
              ]
            : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (let i = 0; i < candidates.length; i++) {
            if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
        }
        return '';
    }

    /** 長辺を抑えてメモリ・エンコード負荷を下げる（偶数ピクセル） */
    function computePipExportCanvasSize(vw, vh, maxLongEdge) {
        const cap = maxLongEdge > 0 ? maxLongEdge : 1920;
        let w = vw | 0;
        let h = vh | 0;
        if (w < 2 || h < 2) return null;
        const long = Math.max(w, h);
        if (long > cap) {
            const s = cap / long;
            w = Math.round(w * s);
            h = Math.round(h * s);
        }
        w = Math.max(2, w);
        h = Math.max(2, h);
        if (w % 2) w--;
        if (h % 2) h--;
        return { w: w, h: h };
    }

    function drawPipExportFrame(ctx, cw, ch, pipGeom) {
        const pg = pipGeom;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cw, ch);
        if (videoRight.readyState >= 2) {
            ctx.drawImage(videoRight, 0, 0, cw, ch);
        }
        if (videoLeft.readyState >= 2 && pg.pipW >= 2 && pg.pipH >= 2) {
            ctx.drawImage(videoLeft, pg.pipX, pg.pipY, pg.pipW, pg.pipH);
        }
    }

    function buildPipGeometry(cw, ch) {
        const lw = videoLeft.videoWidth | 0;
        const lh = videoLeft.videoHeight | 0;
        let pipW = Math.round(cw * 0.24);
        let pipH = lh > 0 && lw > 0 ? Math.round((pipW * lh) / lw) : Math.round(cw * 0.135);
        const maxPipH = Math.round(ch * 0.42);
        if (pipH > maxPipH && lh > 0 && lw > 0) {
            pipH = maxPipH;
            pipW = Math.round((pipH * lw) / lh);
        }
        const margin = Math.max(6, Math.round(cw * 0.015));
        const pipX = cw - pipW - margin;
        const pipY = ch - pipH - margin;
        return { pipW: pipW, pipH: pipH, pipX: pipX, pipY: pipY };
    }

    function drawExportTcOverlay(ctx, cw, ch, text) {
        if (!text) return;
        const pad = Math.max(6, Math.round(Math.min(cw, ch) * 0.014));
        const fontPx = Math.max(12, Math.min(26, Math.round(cw * 0.028)));
        ctx.save();
        ctx.font = '700 ' + fontPx + 'px Consolas, Monaco, "Cascadia Mono", monospace';
        const tw = Math.ceil(ctx.measureText(text).width);
        const th = Math.round(fontPx * 1.38);
        const bx = pad;
        const by = ch - pad - th;
        ctx.fillStyle = 'rgba(8, 10, 18, 0.82)';
        ctx.fillRect(bx - 6, by - 4, tw + 12, th + 8);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 5.5, by - 3.5, tw + 11, th + 7);
        ctx.fillStyle = '#fff4e8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
        ctx.shadowBlur = 3;
        ctx.fillText(text, bx, by + th / 2 + 1);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawExportFrameBundle(mode, ctx, cw, ch, pipGeom, burnTc, exportDur) {
        if (mode === 'compare-pip') {
            drawPipExportFrame(ctx, cw, ch, pipGeom);
            if (burnTc) {
                const t = Math.max(videoLeft.currentTime || 0, videoRight.currentTime || 0);
                drawExportTcOverlay(
                    ctx,
                    cw,
                    ch,
                    formatTimecodeForTransport(Math.min(t, exportDur))
                );
            }
        } else if (mode === 'solo-old') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cw, ch);
            if (videoLeft.readyState >= 2) {
                ctx.drawImage(videoLeft, 0, 0, cw, ch);
            }
            if (burnTc) {
                const t = videoLeft.currentTime || 0;
                const d = getDuration(videoLeft);
                const cl = d > 0 ? Math.min(t, d) : t;
                drawExportTcOverlay(ctx, cw, ch, formatTimecodeForSide(cl, 'left'));
            }
        } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cw, ch);
            if (videoRight.readyState >= 2) {
                ctx.drawImage(videoRight, 0, 0, cw, ch);
            }
            if (burnTc) {
                const t = videoRight.currentTime || 0;
                const d = getDuration(videoRight);
                const cl = d > 0 ? Math.min(t, d) : t;
                drawExportTcOverlay(ctx, cw, ch, formatTimecodeForSide(cl, 'right'));
            }
        }
    }

    function setExportBlockingVisible(visible) {
        const root = exportBlockingOverlay;
        if (!root) return;
        if (visible) {
            root.hidden = false;
            root.setAttribute('aria-hidden', 'false');
            if (exportBlockingSub) {
                exportBlockingSub.textContent = '';
            }
            try {
                root.focus({ preventScroll: true });
            } catch (_) {}
        } else {
            root.hidden = true;
            root.setAttribute('aria-hidden', 'true');
            if (exportBlockingSub) {
                exportBlockingSub.textContent = '';
            }
        }
    }

    function isSoloTcNoticeOpen() {
        return !!(soloTcNoticeOverlay && !soloTcNoticeOverlay.hidden);
    }

    function hideSoloTcNoticeDialog() {
        if (!soloTcNoticeOverlay) return;
        soloTcNoticeOverlay.hidden = true;
        soloTcNoticeOverlay.setAttribute('aria-hidden', 'true');
        try {
            if (exportBurnTcCheckbox) {
                exportBurnTcCheckbox.focus({ preventScroll: true });
            }
        } catch (_) {}
    }

    function showSoloTcNoticeDialog() {
        if (!soloTcNoticeOverlay) return;
        soloTcNoticeOverlay.hidden = false;
        soloTcNoticeOverlay.setAttribute('aria-hidden', 'false');
        try {
            if (soloTcNoticeOk) {
                soloTcNoticeOk.focus({ preventScroll: true });
            } else {
                soloTcNoticeOverlay.focus({ preventScroll: true });
            }
        } catch (_) {}
    }

    function updateExportBlockingSub(text) {
        if (exportBlockingSub && text != null) exportBlockingSub.textContent = text;
    }

    function tryCancelSilentWebmExportFromEsc() {
        if (!pipExportActive) return;
        pipExportUserCancel = true;
        updateExportBlockingSub('Cancelling…');
        if (currentExportRecorder && currentExportRecorder.state === 'recording') {
            try {
                currentExportRecorder.stop();
            } catch (_) {}
            return;
        }
        if (typeof pipExportEmergencyCleanup === 'function') {
            pipExportEmergencyCleanup();
        }
        pipExportUserCancel = false;
        writeLog('Export WebM: Cancelled (Escape).');
        flashSeekHint('Export', 'Cancelled', 'notice');
    }

    async function runSilentWebmExport() {
        if (pipExportActive || !pipExportCanvas || !exportPipBtn) return;
        if (!canExportWebm()) return;
        pipExportUserCancel = false;
        pipExportEmergencyCleanup = null;
        const mode = getExportMode();
        const burnTc = getExportBurnTc();
        let vw;
        let vh;
        let fpsCap;
        let exportDur;
        if (mode === 'compare-pip') {
            vw = videoRight.videoWidth | 0;
            vh = videoRight.videoHeight | 0;
            fpsCap = Math.min(60, Math.max(24, masterFpsIntForTransport()));
            exportDur = masterDuration();
        } else if (mode === 'solo-old') {
            vw = videoLeft.videoWidth | 0;
            vh = videoLeft.videoHeight | 0;
            fpsCap = Math.min(60, Math.max(24, roundedFpsForSide('left')));
            exportDur = getDuration(videoLeft);
        } else {
            vw = videoRight.videoWidth | 0;
            vh = videoRight.videoHeight | 0;
            fpsCap = Math.min(60, Math.max(24, roundedFpsForSide('right')));
            exportDur = getDuration(videoRight);
        }
        const size = computePipExportCanvasSize(vw, vh, 1920);
        if (!size) {
            writeLog('Export WebM: Could not read video resolution.');
            return;
        }
        const cw = size.w;
        const ch = size.h;
        pipExportCanvas.width = cw;
        pipExportCanvas.height = ch;
        const ctx = pipExportCanvas.getContext('2d', { alpha: false });
        if (!ctx) {
            writeLog('Export WebM: Failed to acquire Canvas 2D context.');
            return;
        }
        ctx.imageSmoothingEnabled = true;
        const pipGeom = mode === 'compare-pip' ? buildPipGeometry(cw, ch) : null;
        let stream;
        try {
            stream = pipExportCanvas.captureStream(fpsCap);
        } catch (e) {
            writeLog('Export WebM: captureStream failed — ' + (e && e.message ? e.message : String(e)));
            return;
        }
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            writeLog('Export WebM: No video track from canvas.captureStream().');
            return;
        }

        ensureWebAudioRouting();
        let audioAttachNote = '';
        const exportAudioMode = getAudioMode();
        try {
            if (audioCtx && mediaSrcL && mediaSrcR) {
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume();
                }
                const exportDest = audioCtx.createMediaStreamDestination();
                buildAudioGraph(exportAudioMode, exportDest);
                if (exportAudioMode !== 'mute') {
                    const aTr = exportDest.stream.getAudioTracks()[0];
                    if (aTr) {
                        stream.addTrack(aTr);
                    } else {
                        restorePlaybackAudioRouting();
                        audioAttachNote = ' (no audio track from Web Audio bus)';
                    }
                } else {
                    audioAttachNote = ' (Audio: Mute, video-only encode)';
                }
            } else {
                audioAttachNote = ' (Web Audio unavailable)';
            }
        } catch (eA) {
            restorePlaybackAudioRouting();
            audioAttachNote =
                ' (audio bus failed: ' + (eA && eA.message ? eA.message : String(eA)) + ')';
        }

        if (audioAttachNote) {
            writeLog('Export WebM: Audio attach note' + audioAttachNote);
        }

        const exportStreamHasAudio = stream.getAudioTracks().length > 0;
        const mime = pickWebMRecorderMimeType(exportStreamHasAudio);
        if (!mime) {
            restorePlaybackAudioRouting();
            writeLog('Export WebM: MediaRecorder WebM not supported in this browser.');
            flashSeekHint('Export', 'Not supported', 'notice');
            return;
        }

        const recorderOpts = {
            mimeType: mime,
            videoBitsPerSecond: cw * ch > 2073600 ? 12000000 : 8000000,
        };
        if (exportStreamHasAudio) {
            recorderOpts.audioBitsPerSecond = 160000;
        }

        let recorder;
        try {
            recorder = new MediaRecorder(stream, recorderOpts);
        } catch (e) {
            restorePlaybackAudioRouting();
            writeLog('Export WebM: MediaRecorder constructor failed — ' + (e && e.message ? e.message : String(e)));
            flashSeekHint('Export', 'Failed', 'notice');
            return;
        }
        currentExportRecorder = recorder;
        const chunks = [];
        const modeEn =
            mode === 'compare-pip' ? 'PiP compare' : mode === 'solo-old' ? 'older only' : 'newer only';
        const tcEn = burnTc ? 'with TC burn-in' : 'no TC burn-in';
        const audioEn = audioModeLabel(getAudioMode());
        pipExportActive = true;
        setExportBlockingVisible(true);
        updateExportBlockingSub('Preparing export…');
        try {
            const ae = document.activeElement;
            if (ae && ae !== document.body && typeof ae.blur === 'function') {
                ae.blur();
            }
        } catch (_) {}
        updateControlsEnabled();
        videoLeft.pause();
        videoRight.pause();
        stopRaf();
        setPlayingUi(false);
        applyTimeToVideos(0);
        seekBar.value = '0';
        currentTimeEl.textContent = formatTimecodeForTransport(0);
        updateDriftAndOverlays();
        await new Promise((r) => setTimeout(r, 80));
        drawExportFrameBundle(mode, ctx, cw, ch, pipGeom, burnTc, exportDur);
        let lastProgLog = 0;
        let recorderStopError = null;
        let pipUiCleaned = false;

        function cleanupPipExportShell() {
            if (pipUiCleaned) return;
            pipUiCleaned = true;
            setExportBlockingVisible(false);
            if (pipExportRaf) {
                cancelAnimationFrame(pipExportRaf);
                pipExportRaf = 0;
            }
            try {
                stream.getTracks().forEach((t) => t.stop());
            } catch (_) {}
            restorePlaybackAudioRouting();
            videoLeft.pause();
            videoRight.pause();
            pipExportActive = false;
            exportPipBtn.textContent = EXPORT_WEBM_BTN_LABEL;
            updateControlsEnabled();
            updateSeekUiFromVideos();
            currentExportRecorder = null;
            pipExportEmergencyCleanup = null;
        }
        pipExportEmergencyCleanup = cleanupPipExportShell;

        recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onerror = () => {
            if (!recorderStopError) recorderStopError = 'MediaRecorder reported an error.';
            try {
                if (recorder.state === 'recording') recorder.stop();
            } catch (_) {}
        };
        recorder.onstop = () => {
            cleanupPipExportShell();
            if (pipExportUserCancel) {
                pipExportUserCancel = false;
                writeLog('Export WebM: Cancelled (Escape).');
                flashSeekHint('Export', 'Cancelled', 'notice');
                return;
            }
            if (recorderStopError) {
                writeLog('Export WebM: ' + recorderStopError);
                flashSeekHint('Export', 'Failed', 'notice');
                return;
            }
            const blob = new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' });
            if (!blob.size) {
                writeLog('Export WebM: Output size is zero.');
                flashSeekHint('Export', 'Failed', 'notice');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            let fname = 'mga-export-';
            if (mode === 'compare-pip') fname += 'compare-pip-';
            else if (mode === 'solo-old') fname += 'solo-old-';
            else fname += 'solo-new-';
            if (burnTc) fname += 'tc-';
            fname += stamp + '.webm';
            a.download = fname;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            writeLog(
                'Export WebM: Done (' +
                    modeEn +
                    ', ' +
                    tcEn +
                    ', ' +
                    (exportStreamHasAudio ? 'audio ' + audioEn : 'no audio') +
                    ', ' +
                    Math.round(blob.size / 1024) +
                    ' KiB, ' +
                    cw +
                    '×' +
                    ch +
                    ')'
            );
            flashSeekHint('Export', 'Download started', 'notice');
        };
        try {
            recorder.start(400);
        } catch (e) {
            recorderStopError = 'record.start failed — ' + (e && e.message ? e.message : String(e));
            cleanupPipExportShell();
            writeLog('Export WebM: ' + recorderStopError);
            flashSeekHint('Export', 'Failed', 'notice');
            return;
        }
        updateExportBlockingSub('Recording… 0%');
        writeLog(
            'Export WebM: Started (' +
                modeEn +
                ', ' +
                tcEn +
                ', audio ' +
                audioEn +
                (exportStreamHasAudio ? ' -> export bus' : ' (video-only)') +
                ', ~' +
                fpsCap +
                ' fps target, duration ' +
                formatTimecodeForTransport(exportDur) +
                ', real-time encode)'
        );
        {
            let playLeftOk = false;
            try {
                await videoLeft.play();
                playLeftOk = !videoLeft.paused;
            } catch (_) {
                playLeftOk = false;
            }
            let playRightOk = false;
            try {
                await videoRight.play();
                playRightOk = !videoRight.paused;
            } catch (_) {
                playRightOk = false;
            }
            const am = exportStreamHasAudio ? getAudioMode() : null;
            const audioNeedL = !!(am && (am === 'split-mono' || am === 'old-stereo'));
            const audioNeedR = !!(am && (am === 'split-mono' || am === 'new-stereo'));
            const videoNeedL = mode === 'compare-pip' || mode === 'solo-old';
            const videoNeedR = mode === 'compare-pip' || mode === 'solo-new';
            const needL = videoNeedL || audioNeedL;
            const needR = videoNeedR || audioNeedR;
            const playOk = (!needL || playLeftOk) && (!needR || playRightOk);
            if (!playOk) {
                recorderStopError =
                    'play() failed — could not start every video element required for this export mode and Audio option.';
                try {
                    if (recorder.state === 'recording') recorder.stop();
                } catch (_) {}
                return;
            }
        }
        setPlayingUi(true);
        if (!rafId) rafId = requestAnimationFrame(tick);
        const drawLoop = () => {
            if (!pipExportActive) return;
            drawExportFrameBundle(mode, ctx, cw, ch, pipGeom, burnTc, exportDur);
            let tProg;
            if (mode === 'compare-pip') {
                tProg = Math.max(videoLeft.currentTime || 0, videoRight.currentTime || 0);
            } else if (mode === 'solo-old') {
                tProg = videoLeft.currentTime || 0;
            } else {
                tProg = videoRight.currentTime || 0;
            }
            const now = performance.now();
            if (now - lastProgLog > 900) {
                lastProgLog = now;
                const pct =
                    exportDur > 0 ? Math.min(100, Math.round((100 * tProg) / exportDur)) : 0;
                updateExportBlockingSub('Recording… ' + pct + '%');
            }
            if (tProg >= exportDur - 0.035) {
                pipExportRaf = 0;
                recorderStopError = null;
                try {
                    if (recorder.state === 'recording') recorder.stop();
                } catch (e2) {
                    recorderStopError = 'record.stop failed — ' + (e2 && e2.message ? e2.message : String(e2));
                    cleanupPipExportShell();
                    writeLog('Export WebM: ' + recorderStopError);
                    flashSeekHint('Export', 'Failed', 'notice');
                }
                return;
            }
            pipExportRaf = requestAnimationFrame(drawLoop);
        };
        pipExportRaf = requestAnimationFrame(drawLoop);
    }

    function updateControlsEnabled() {
        const readyTransport = bothReady();
        const xl = pipExportActive;
        seekBar.disabled = !readyTransport || xl;
        playStopBtn.disabled = !readyTransport || xl;
        if (exportModeSelect) exportModeSelect.disabled = xl;
        if (exportBurnTcCheckbox) {
            if (isSoloExportMode()) {
                exportBurnTcCheckbox.checked = true;
            }
            exportBurnTcCheckbox.disabled = xl;
        }
        if (exportPipBtn) exportPipBtn.disabled = !canExportWebm() || xl;
        if (!readyTransport) {
            setPlayingUi(false);
            stopRaf();
            driftRow.hidden = true;
        } else {
            updateDriftAndOverlays();
        }
    }

    function assignPairToVideos(olderFile, newerFile, opt) {
        revokeAll();
        autoPlayLatch = false;
        sessionRestoreListenersArmed = false;
        if (!opt || !opt.skipAutoPlay) autoPlayAfterUserLoad = true;
        fileLeft = olderFile;
        fileRight = newerFile;
        urlLeft = URL.createObjectURL(olderFile);
        urlRight = URL.createObjectURL(newerFile);
        videoLeft.src = urlLeft;
        videoRight.src = urlRight;
        nameLeft.textContent = olderFile.name;
        nameRight.textContent = newerFile.name;
        updatePanelInfoLine('left');
        updatePanelInfoLine('right');
        setLoaded(panelLeft, true);
        setLoaded(panelRight, true);
        if (!opt || !opt.skipPersist) {
            schedulePersistSession();
        }
        void refreshContainerFpsForCurrentFiles();
        applyViewMode(getViewMode());
    }

    function reorderTwoLoadedByDate() {
        if (!fileLeft || !fileRight) return;
        if (compareFileByModifiedThenName(fileLeft, fileRight) <= 0) {
            writeLog('Reorder: order already correct (no swap)');
            void refreshContainerFpsForCurrentFiles();
            applyViewMode(getViewMode());
            return;
        }
        const tmpF = containerFps.left;
        containerFps.left = containerFps.right;
        containerFps.right = tmpF;
        const tmp = fileLeft;
        fileLeft = fileRight;
        fileRight = tmp;
        if (urlLeft) URL.revokeObjectURL(urlLeft);
        if (urlRight) URL.revokeObjectURL(urlRight);
        urlLeft = URL.createObjectURL(fileLeft);
        urlRight = URL.createObjectURL(fileRight);
        videoLeft.src = urlLeft;
        videoRight.src = urlRight;
        nameLeft.textContent = fileLeft.name;
        nameRight.textContent = fileRight.name;
        videoLeft.load();
        videoRight.load();
        writeLog('Reorder: swapped sides by file modified date');
        schedulePersistSession();
        refreshMasterFrameSec();
        updatePanelInfoLine('left');
        updatePanelInfoLine('right');
        syncSeekMax();
        updateSeekUiFromVideos();
        void refreshContainerFpsForCurrentFiles();
        applyViewMode(getViewMode());
    }

