    // 繧ｿ繧､繝繧ｳ繝ｼ繝峨√す繝ｼ繧ｯ縲∝酔譛溘仝ebM 譖ｸ縺榊・縺・
    function updateDriftAndOverlays() {
        if (typeof updatePlayerBurnInOverlays === 'function') {
            updatePlayerBurnInOverlays();
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

    /** 蜀咲函蜀埼幕譎ゅ↓ ended 縺ｮ縺ｾ縺ｾ蝗ｺ縺ｾ繧九・繧帝∩縺代ｋ */
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

    /** 蠕ｩ蜈・ｾ・■縺ｮ繧ｷ繝ｼ繧ｯ菴咲ｽｮ繧剃ｸ｡ video 縺ｫ蜿肴丐縲Ｔeek 蜿ｯ閭ｽ縺ｫ縺ｪ繧九∪縺ｧ pending 繧堤ｶｭ謖・*/
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
     * 蟆ｺ縺ｮ遏ｭ縺・・縺檎ｵらｫｯ莉倩ｿ代〒蠑ｵ繧贋ｻ倥″縲・聞縺・・縺縺代′繝槭せ繧ｿ繝ｼ譎ょ綾縺ｾ縺ｧ騾ｲ繧薙〒縺・ｋ迥ｶ諷九・
     * 縺薙・縺ｨ縺阪・ currentTime 蟾ｮ縺ｯ縲悟酔譛滉ｸ崎憶縲阪〒縺ｯ縺ｪ縺上け繝ｪ繝・・髟ｷ縺ｮ蟾ｮ縺ｪ縺ｮ縺ｧ +1f 陬懈ｭ｣繧偵＠縺ｪ縺・・
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

    /** 髟ｷ霎ｺ繧呈椛縺医※繝｡繝｢繝ｪ繝ｻ繧ｨ繝ｳ繧ｳ繝ｼ繝芽ｲ闕ｷ繧剃ｸ九￡繧具ｼ亥・謨ｰ繝斐け繧ｻ繝ｫ・・*/
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

    function drawPipExportFrame(ctx, cw, ch, pipGeom, frameSources) {
        const pg = pipGeom;
        const fs = frameSources || null;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cw, ch);
        if (fs && fs.right) {
            ctx.drawImage(fs.right, 0, 0, cw, ch);
        } else if (videoRight.readyState >= 2) {
            ctx.drawImage(videoRight, 0, 0, cw, ch);
        }
        if (fs && fs.left && pg.pipW >= 2 && pg.pipH >= 2) {
            ctx.drawImage(fs.left, pg.pipX, pg.pipY, pg.pipW, pg.pipH);
        } else if (videoLeft.readyState >= 2 && pg.pipW >= 2 && pg.pipH >= 2) {
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

    function burnInRoundRectPath(ctx, x, y, w, h, r) {
        const rad = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
    }

    function drawExportBurnOverlay(ctx, cw, ch, text) {
        if (!text) return;
        const m =
            typeof getBurnInDrawMetricsForExport === 'function'
                ? getBurnInDrawMetricsForExport(cw, ch, ctx, text)
                : null;
        const fontPx = m ? m.fontPx : Math.max(12, Math.round(ch * (14 / 440)));
        let boxW = m ? m.boxW : 0;
        let boxH = m ? m.boxH : 0;
        if (!m) {
            ctx.save();
            ctx.font = '700 ' + fontPx + 'px Consolas, Monaco, "Cascadia Mono", monospace';
            boxW = Math.ceil(ctx.measureText(text).width) + 16;
            boxH = Math.round(fontPx * 1.38) + 8;
            ctx.restore();
        }
        const padL = m ? m.padL : 8;
        const borderRadius = m ? m.borderRadius : 6;
        const pos =
            typeof computeBurnInPixelPosForExport === 'function'
                ? computeBurnInPixelPosForExport(cw, ch, boxW, boxH)
                : null;
        const boxLeft = pos ? pos.left : Math.max(0, Math.round(cw * 0.014) - padL);
        const boxTop = pos ? ch - pos.bottom - boxH : ch - Math.round(ch * 0.025) - boxH;
        const textX = boxLeft + (m ? m.textX : padL);
        const padTfb = m ? m.padT : 5;
        const padBfb = m ? m.padB : 3;
        const textCenterY = m ? m.textCenterY : padTfb + (boxH - padTfb - padBfb) / 2;
        const textY = boxTop + textCenterY;
        ctx.save();
        if (typeof applyBurnInCanvasTextStyle === 'function') {
            applyBurnInCanvasTextStyle(ctx, fontPx);
        } else {
            ctx.font = '700 ' + fontPx + 'px Consolas, Monaco, "Cascadia Mono", monospace';
        }
        ctx.fillStyle = 'rgba(8, 10, 18, 0.82)';
        burnInRoundRectPath(ctx, boxLeft, boxTop, boxW, boxH, borderRadius);
        ctx.fill();
        burnInRoundRectPath(ctx, boxLeft, boxTop, boxW, boxH, borderRadius);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff4e8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
        ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.2));
        ctx.fillText(text, textX, textY);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    /**
     * @param {object} [tcSec] 繧ｪ繝輔Λ繧､繝ｳ譖ｸ縺榊・縺礼畑 TC 遘抵ｼ域欠螳壽凾縺ｯ currentTime 繧剃ｽｿ繧上↑縺・ｼ・
     * @param {number} [tcSec.transportSec]
     * @param {number} [tcSec.leftSec]
     * @param {number} [tcSec.rightSec]
     */
    function drawExportFrameBundle(mode, ctx, cw, ch, pipGeom, exportDur, tcSec, frameSources) {
        const burnTc = getExportBurnTc();
        const burnCurrentFrames = getExportBurnCurrentFrames();
        const burnTotalFrames = getExportBurnTotalFrames();
        const fs = frameSources || null;
        if (mode === 'compare-pip') {
            drawPipExportFrame(ctx, cw, ch, pipGeom, fs);
        } else if (mode === 'solo-old') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cw, ch);
            if (fs && fs.left) {
                ctx.drawImage(fs.left, 0, 0, cw, ch);
            } else if (videoLeft.readyState >= 2) {
                ctx.drawImage(videoLeft, 0, 0, cw, ch);
            }
        } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cw, ch);
            if (fs && fs.right) {
                ctx.drawImage(fs.right, 0, 0, cw, ch);
            } else if (videoRight.readyState >= 2) {
                ctx.drawImage(videoRight, 0, 0, cw, ch);
            }
        }
        if (burnTc || burnCurrentFrames || burnTotalFrames) {
            const label = buildBurnInLabel(
                mode,
                exportDur,
                burnTc,
                burnCurrentFrames,
                burnTotalFrames,
                tcSec
            );
            drawExportBurnOverlay(ctx, cw, ch, label);
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
        if (typeof pipExportEmergencyCleanup === 'function') {
            pipExportEmergencyCleanup();
        }
    }


    function updateControlsEnabled() {
        const readyTransport = bothReady();
        const xl = pipExportActive;
        seekBar.disabled = !readyTransport || xl;
        playStopBtn.disabled = !readyTransport || xl;
        if (exportModeSelect) exportModeSelect.disabled = xl;
        if (exportBurnTcCheckbox) {
            exportBurnTcCheckbox.disabled = xl;
        }
        if (exportBurnCurrentFramesCheckbox) {
            exportBurnCurrentFramesCheckbox.disabled = xl;
        }
        if (exportBurnTotalFramesCheckbox) {
            exportBurnTotalFramesCheckbox.disabled = xl;
        }
        if (!xl && isSoloExportMode()) {
            enforceSoloExportBurnCheckboxes();
        }
        if (exportPipBtn) exportPipBtn.disabled = !canExportWebm() || xl;
        updatePlaybackSpeedUi();
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
        applyPlaybackSpeedToVideos();
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
        const tmpS = containerSampleCount.left;
        containerSampleCount.left = containerSampleCount.right;
        containerSampleCount.right = tmpS;
        const tmpStsz = containerStszSampleCount.left;
        containerStszSampleCount.left = containerStszSampleCount.right;
        containerStszSampleCount.right = tmpStsz;
        const tmpOff = containerTimelineFrameOffset.left;
        containerTimelineFrameOffset.left = containerTimelineFrameOffset.right;
        containerTimelineFrameOffset.right = tmpOff;
        const tmpMd = containerMediaDurationSec.left;
        containerMediaDurationSec.left = containerMediaDurationSec.right;
        containerMediaDurationSec.right = tmpMd;
        const tmpA = containerHasAudio.left;
        containerHasAudio.left = containerHasAudio.right;
        containerHasAudio.right = tmpA;
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
        applyPlaybackSpeedToVideos();
    }

