    // WebCodecs オフライン・バウンス（フレーム単位・TC 精度優先）
    function isOfflineWebCodecsExportSupported() {
        return (
            typeof VideoEncoder !== 'undefined' &&
            typeof VideoFrame !== 'undefined' &&
            typeof EncodedVideoChunk !== 'undefined' &&
            typeof VideoEncoder.isConfigSupported === 'function'
        );
    }

    function loadWebmMuxerModule() {
        if (typeof WebMMuxer !== 'undefined' && WebMMuxer.Muxer && WebMMuxer.ArrayBufferTarget) {
            return Promise.resolve(WebMMuxer);
        }
        return import('./vendor/webm-muxer.mjs');
    }

    function getOfflineExportFpsAndDur(mode) {
        if (mode === 'compare-pip') {
            return { fps: masterFpsIntForTransport(), exportDur: masterDuration() };
        }
        if (mode === 'solo-old') {
            return { fps: roundedFpsForSide('left'), exportDur: getDuration(videoLeft) };
        }
        return { fps: roundedFpsForSide('right'), exportDur: getDuration(videoRight) };
    }

    function offlineExportFrameCount(exportDur, fps) {
        const f = Math.max(1, fps | 0);
        return Math.max(1, Math.floor(exportDur * f + 1e-9));
    }

    function buildTcSecForOfflineFrame(mode, frameIndex, fps, exportDur) {
        const sec = Math.min(frameIndex / fps, exportDur);
        if (mode === 'compare-pip') return { transportSec: sec };
        if (mode === 'solo-old') return { leftSec: sec };
        return { rightSec: sec };
    }

    function offlineFrameTimestampUs(frameIndex, fps) {
        const f = Math.max(1, fps | 0);
        return Math.round((frameIndex * 1_000_000) / f);
    }

    function offlineFrameDurationUs(fps) {
        const f = Math.max(1, fps | 0);
        return Math.round(1_000_000 / f);
    }

    async function pickOfflineVideoEncoderCodec(width, height, fps) {
        const candidates = [
            { codec: 'vp09.00.10.08', muxCodec: 'V_VP9' },
            { codec: 'vp09.00.41.08', muxCodec: 'V_VP9' },
            { codec: 'vp8', muxCodec: 'V_VP8' },
        ];
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            try {
                const r = await VideoEncoder.isConfigSupported({
                    codec: c.codec,
                    width: width,
                    height: height,
                    bitrate: width * height > 2073600 ? 12_000_000 : 8_000_000,
                    framerate: fps,
                });
                if (r.supported) return c;
            } catch (_) {}
        }
        return null;
    }

    async function seekVideoElementToForExport(v, t) {
        if (Math.abs((v.currentTime || 0) - t) < 1e-5) {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return;
        }
        await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            }, 3000);
            const onSeeked = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const onError = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('video seek failed'));
            };
            const cleanup = () => {
                clearTimeout(timeout);
                v.removeEventListener('seeked', onSeeked);
                v.removeEventListener('error', onError);
            };
            v.addEventListener('seeked', onSeeked);
            v.addEventListener('error', onError);
            try {
                v.currentTime = t;
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    const EXPORT_MP4_DECODE_PREP_TIMEOUT_MS = 14000;

    async function createOfflineExportDecodeSources(mode, fps) {
        const empty = { useDecode: false, left: null, right: null };
        if (typeof isExportMp4WebCodecsDecodeAvailable === 'function' && !isExportMp4WebCodecsDecodeAvailable()) {
            return empty;
        }
        if (typeof createExportMp4VideoSourceWithTimeout !== 'function') {
            if (typeof createExportMp4VideoSource !== 'function') return empty;
        }
        const prep =
            typeof createExportMp4VideoSourceWithTimeout === 'function'
                ? createExportMp4VideoSourceWithTimeout
                : function (file, f, label, ms) {
                      return Promise.race([
                          createExportMp4VideoSource(file, f),
                          new Promise((r) => setTimeout(() => r(null), ms)),
                      ]);
                  };

        if (mode === 'compare-pip') {
            if (!fileLeft || !fileRight) return empty;
            updateExportBlockingSub('Preparing export…');
            const leftRight = await Promise.all([
                prep(fileLeft, fps, 'L', EXPORT_MP4_DECODE_PREP_TIMEOUT_MS),
                prep(fileRight, fps, 'R', EXPORT_MP4_DECODE_PREP_TIMEOUT_MS),
            ]);
            const left = leftRight[0];
            const right = leftRight[1];
            if (!left || !right) {
                if (left && typeof left.close === 'function') left.close();
                if (right && typeof right.close === 'function') right.close();
                writeLog('Export offline: MP4 decode unavailable — using video seek (fallback).');
            }
            return { useDecode: !!(left && right), left: left, right: right };
        }
        if (mode === 'solo-old') {
            if (!fileLeft) return empty;
            updateExportBlockingSub('Preparing export…');
            const left = await prep(fileLeft, fps, 'L', EXPORT_MP4_DECODE_PREP_TIMEOUT_MS);
            if (!left) writeLog('Export offline: MP4 decode unavailable — using video seek (fallback).');
            return { useDecode: !!left, left: left, right: null };
        }
        if (!fileRight) return empty;
        updateExportBlockingSub('Preparing export…');
        const right = await prep(fileRight, fps, 'R', EXPORT_MP4_DECODE_PREP_TIMEOUT_MS);
        if (!right) writeLog('Export offline: MP4 decode unavailable — using video seek (fallback).');
        return { useDecode: !!right, left: null, right: right };
    }

    function closeOfflineExportDecodeSources(sources) {
        if (!sources) return;
        try {
            if (sources.left && typeof sources.left.close === 'function') sources.left.close();
        } catch (_) {}
        try {
            if (sources.right && typeof sources.right.close === 'function') sources.right.close();
        } catch (_) {}
    }

    async function seekVideosForOfflineFrame(mode, t) {
        if (mode === 'solo-old') {
            const d = getDuration(videoLeft);
            const x = d > 0 ? Math.min(t, Math.max(0, d - 1e-6)) : t;
            await seekVideoElementToForExport(videoLeft, x);
            return;
        }
        if (mode === 'solo-new') {
            const d = getDuration(videoRight);
            const x = d > 0 ? Math.min(t, Math.max(0, d - 1e-6)) : t;
            await seekVideoElementToForExport(videoRight, x);
            return;
        }
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        const xL = dL > 0 ? Math.min(t, Math.max(0, dL - 1e-6)) : t;
        const xR = dR > 0 ? Math.min(t, Math.max(0, dR - 1e-6)) : t;
        await Promise.all([
            seekVideoElementToForExport(videoLeft, xL),
            seekVideoElementToForExport(videoRight, xR),
        ]);
    }

    const OFFLINE_AUDIO_DECODE_TIMEOUT_MS = 120000;
    const OFFLINE_AUDIO_RENDER_TIMEOUT_MS = 300000;

    function clipAudioBufferToExportDur(buffer, exportDur) {
        if (!buffer || !(exportDur > 0)) return buffer;
        const maxLen = Math.min(buffer.length, Math.ceil(exportDur * buffer.sampleRate));
        if (maxLen >= buffer.length) return buffer;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return buffer;
        const ctx = new Ctx();
        try {
            const out = ctx.createBuffer(buffer.numberOfChannels, maxLen, buffer.sampleRate);
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                out.copyToChannel(buffer.getChannelData(c).subarray(0, maxLen), c, 0);
            }
            return out;
        } catch (_) {
            return buffer;
        } finally {
            try {
                ctx.close();
            } catch (_) {}
        }
    }

    async function waitAudioEncoderQueueDrain(audioEncoder, maxMs) {
        const budget = maxMs != null ? maxMs : 4000;
        const start = performance.now();
        while (audioEncoder.encodeQueueSize > 0 && performance.now() - start < budget) {
            await new Promise((r) => setTimeout(r, 0));
        }
        return audioEncoder.encodeQueueSize === 0;
    }

    /** encode() 送信後、output コールバックが落ち着くまで待つ（Opus は入力チャンク数≠出力数） */
    async function waitAudioEncoderOutputsSettled(audioEncoder, buffered, maxMs) {
        const budget = maxMs != null ? maxMs : 45000;
        let lastLen = -1;
        let stableAt = performance.now();
        const start = performance.now();
        while (performance.now() - start < budget) {
            await waitAudioEncoderQueueDrain(audioEncoder, 2000);
            const len = buffered.length;
            if (len === lastLen && len > 0) {
                if (performance.now() - stableAt >= 120) return true;
            } else {
                lastLen = len;
                stableAt = performance.now();
            }
            await new Promise((r) => setTimeout(r, 8));
        }
        return buffered.length > 0;
    }

    async function closeAudioEncoderAfterExport(audioEncoder) {
        try {
            await Promise.race([
                audioEncoder.flush(),
                new Promise((resolve) => setTimeout(resolve, 8000)),
            ]);
        } catch (_) {}
        try {
            if (audioEncoder.state !== 'closed') audioEncoder.close();
        } catch (_) {}
    }

    function muxBufferedAudioChunks(muxer, buffered) {
        for (let i = 0; i < buffered.length; i++) {
            const item = buffered[i];
            muxer.addAudioChunk(item.chunk, item.meta);
        }
    }

    async function ensureContainerHasAudioKnown(side, file) {
        if (containerHasAudio[side] !== null) return containerHasAudio[side];
        const probed = await extractMp4HasAudioTrackFromFile(file);
        if (probed === null) return null;
        containerHasAudio[side] = !!probed;
        return containerHasAudio[side];
    }

    async function decodeFileToAudioBufferSafe(file) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        const ctx = new Ctx();
        try {
            const ab = await file.arrayBuffer();
            const decoded = await Promise.race([
                ctx.decodeAudioData(ab),
                new Promise((_, reject) => {
                    setTimeout(
                        () => reject(new Error('decodeAudioData timeout')),
                        OFFLINE_AUDIO_DECODE_TIMEOUT_MS
                    );
                }),
            ]);
            return decoded;
        } catch (_) {
            return null;
        } finally {
            try {
                await ctx.close();
            } catch (_) {}
        }
    }

    /**
     * 音声トラックが無い／未確認で失敗した側は null（デコードしない）
     * @returns {Promise<AudioBuffer|null>}
     */
    async function resolveSideAudioBufferForExport(file, side) {
        if (!file) return null;
        let known = containerHasAudio[side];
        if (known === null) {
            known = await ensureContainerHasAudioKnown(side, file);
        }
        if (known === false) return null;
        const buf = await decodeFileToAudioBufferSafe(file);
        if (!buf) {
            containerHasAudio[side] = false;
        } else if (known === null) {
            containerHasAudio[side] = true;
        }
        return buf;
    }

    function connectOfflineBufferToDest(offlineCtx, buffer, dest, swapSplitMonoLR) {
        const bs = offlineCtx.createBufferSource();
        bs.buffer = buffer;
        if (typeof offlineCtx.createStereoPanner !== 'function') {
            bs.connect(dest);
            bs.start(0);
            return bs;
        }
        const splitter = offlineCtx.createChannelSplitter(Math.min(2, buffer.numberOfChannels));
        const g0 = offlineCtx.createGain();
        const g1 = offlineCtx.createGain();
        g0.gain.value = 0.5;
        g1.gain.value = 0.5;
        const pan = offlineCtx.createStereoPanner();
        pan.pan.value = swapSplitMonoLR ? 1 : -1;
        bs.connect(splitter);
        splitter.connect(g0, 0);
        if (buffer.numberOfChannels > 1) splitter.connect(g1, 1);
        else splitter.connect(g1, 0);
        g0.connect(pan);
        g1.connect(pan);
        pan.connect(dest);
        bs.start(0);
        return bs;
    }

    function connectOfflineBufferDirect(offlineCtx, buffer, dest) {
        const bs = offlineCtx.createBufferSource();
        bs.buffer = buffer;
        bs.connect(dest);
        bs.start(0);
        return bs;
    }

    function connectOfflineBufferMute(offlineCtx, buffer, dest) {
        const bs = offlineCtx.createBufferSource();
        bs.buffer = buffer;
        const g = offlineCtx.createGain();
        g.gain.value = 0;
        bs.connect(g);
        g.connect(dest);
        bs.start(0);
        return bs;
    }

    function offlineExportNeedsSideAudio(exportAudioMode, side) {
        if (exportAudioMode === 'mute') return false;
        if (side === 'left') {
            return exportAudioMode === 'split-mono' || exportAudioMode === 'old-stereo';
        }
        return exportAudioMode === 'split-mono' || exportAudioMode === 'new-stereo';
    }

    /** 選択モードで必要な側がすべて「音声なし」と既知なら true */
    function offlineExportAllNeededSidesKnownWithoutAudio(exportAudioMode) {
        if (exportAudioMode === 'mute') return true;
        if (
            offlineExportNeedsSideAudio(exportAudioMode, 'left') &&
            containerHasAudio.left !== false
        ) {
            return false;
        }
        if (
            offlineExportNeedsSideAudio(exportAudioMode, 'right') &&
            containerHasAudio.right !== false
        ) {
            return false;
        }
        return true;
    }

    async function renderOfflineExportAudio(mode, exportDur, exportAudioMode) {
        if (exportAudioMode === 'mute') return null;
        if (!fileLeft || !fileRight) return null;

        const needL = exportAudioMode === 'split-mono' || exportAudioMode === 'old-stereo';
        const needR = exportAudioMode === 'split-mono' || exportAudioMode === 'new-stereo';
        const skipNotes = [];

        let bufL = null;
        let bufR = null;
        if (needL) {
            if (containerHasAudio.left === false) {
                skipNotes.push('L: no audio track');
            } else {
                updateExportBlockingSub('Rendering audio (decode L)…');
                bufL = await resolveSideAudioBufferForExport(fileLeft, 'left');
                if (bufL) bufL = clipAudioBufferToExportDur(bufL, exportDur);
                if (!bufL) skipNotes.push('L: decode skipped');
            }
        }
        if (needR) {
            if (containerHasAudio.right === false) {
                skipNotes.push('R: no audio track');
            } else {
                updateExportBlockingSub('Rendering audio (decode R)…');
                bufR = await resolveSideAudioBufferForExport(fileRight, 'right');
                if (bufR) bufR = clipAudioBufferToExportDur(bufR, exportDur);
                if (!bufR) skipNotes.push('R: decode skipped');
            }
        }
        if (skipNotes.length) {
            writeLog('Export offline: Audio — ' + skipNotes.join('; ') + '.');
        }

        const hasL = !!bufL;
        const hasR = !!bufR;
        if (exportAudioMode === 'split-mono') {
            if (!hasL && !hasR) return null;
        } else if (exportAudioMode === 'old-stereo') {
            if (!hasL) return null;
        } else if (exportAudioMode === 'new-stereo') {
            if (!hasR) return null;
        }

        const sampleRate = 48000;
        const length = Math.max(1, Math.ceil(exportDur * sampleRate));
        const offline = new OfflineAudioContext(2, length, sampleRate);
        const dest = offline.destination;
        const swapBothLR = mode === 'compare-pip' && exportAudioMode === 'split-mono';

        if (exportAudioMode === 'split-mono') {
            if (hasL) connectOfflineBufferToDest(offline, bufL, dest, swapBothLR);
            if (hasR) connectOfflineBufferToDest(offline, bufR, dest, !swapBothLR);
        } else if (exportAudioMode === 'old-stereo') {
            connectOfflineBufferDirect(offline, bufL, dest);
            if (hasR) connectOfflineBufferMute(offline, bufR, dest);
        } else if (exportAudioMode === 'new-stereo') {
            if (hasL) connectOfflineBufferMute(offline, bufL, dest);
            connectOfflineBufferDirect(offline, bufR, dest);
        }

        updateExportBlockingSub('Rendering audio (mix)…');
        const renderTimeoutMs = Math.max(
            OFFLINE_AUDIO_RENDER_TIMEOUT_MS,
            Math.ceil(exportDur * 1000 * 4)
        );
        return await Promise.race([
            offline.startRendering(),
            new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error('OfflineAudioContext render timeout')),
                    renderTimeoutMs
                );
            }),
        ]);
    }

    async function pickOfflineAudioEncoderConfig() {
        if (typeof AudioEncoder === 'undefined' || typeof AudioEncoder.isConfigSupported !== 'function') {
            return null;
        }
        try {
            const r = await AudioEncoder.isConfigSupported({
                codec: 'opus',
                sampleRate: 48000,
                numberOfChannels: 2,
                bitrate: 160000,
            });
            if (r.supported) return r.config;
        } catch (_) {}
        return null;
    }

    /**
     * 音声を Opus にエンコードしてバッファへ蓄積（muxer にはまだ渡さない）
     * @returns {Promise<Array<{chunk: EncodedAudioChunk, meta: object}>>}
     */
    async function encodeRenderedAudioToBuffer(rendered, audioConfig, encoderErrorRef) {
        const buffered = [];
        const audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
                buffered.push({ chunk: chunk, meta: meta });
            },
            error: (e) => {
                if (encoderErrorRef) encoderErrorRef.error = e;
            },
        });
        audioEncoder.configure(audioConfig);

        const sampleRate = 48000;
        const ch0 = rendered.getChannelData(0);
        const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
        const framesPerChunk = 960;
        const totalChunks = Math.max(1, Math.ceil(rendered.length / framesPerChunk));
        let timestampUs = 0;
        let chunkIndex = 0;
        for (let offset = 0; offset < rendered.length; offset += framesPerChunk) {
            if (encoderErrorRef && encoderErrorRef.error) {
                throw encoderErrorRef.error;
            }
            await waitAudioEncoderQueueDrain(audioEncoder, 4000);
            const frameCount = Math.min(framesPerChunk, rendered.length - offset);
            const interleaved = new Float32Array(frameCount * 2);
            for (let i = 0; i < frameCount; i++) {
                interleaved[i * 2] = ch0[offset + i];
                interleaved[i * 2 + 1] = ch1[offset + i];
            }
            const ad = new AudioData({
                format: 'f32',
                sampleRate: sampleRate,
                numberOfFrames: frameCount,
                numberOfChannels: 2,
                timestamp: timestampUs,
                data: interleaved,
            });
            audioEncoder.encode(ad);
            ad.close();
            timestampUs += Math.round((frameCount / sampleRate) * 1_000_000);
            chunkIndex++;
            if (chunkIndex % 24 === 0 || offset + framesPerChunk >= rendered.length) {
                const pct = Math.min(100, Math.round((100 * chunkIndex) / totalChunks));
                updateExportBlockingSub('Encoding audio… ' + pct + '%');
            }
        }

        updateExportBlockingSub('Encoding audio… finalizing');
        const settled = await waitAudioEncoderOutputsSettled(audioEncoder, buffered, 45000);
        if (!settled) {
            writeLog(
                'Export offline: Audio encoder outputs still pending (' +
                    buffered.length +
                    ' chunks), continuing…'
            );
        }
        await closeAudioEncoderAfterExport(audioEncoder);

        if (encoderErrorRef && encoderErrorRef.error) {
            throw encoderErrorRef.error;
        }
        if (!buffered.length) {
            throw new Error('AudioEncoder produced no output chunks');
        }
        return buffered;
    }

    function downloadOfflineWebmBlob(blob, mode) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        let fname = 'mga-export-';
        if (mode === 'compare-pip') fname += 'compare-pip-';
        else if (mode === 'solo-old') fname += 'solo-old-';
        else fname += 'solo-new-';
        if (getExportBurnTc()) fname += 'tc-';
        if (getExportBurnCurrentFrames()) fname += 'curf-';
        if (getExportBurnTotalFrames()) fname += 'totf-';
        fname += stamp + '.webm';
        a.download = fname;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function isOfflineExportCancelled(err) {
        if (pipExportUserCancel) return true;
        if (!err) return false;
        if (err.message === 'cancelled') return true;
        if (err.name === 'AbortError') return true;
        return false;
    }

    function finishOfflineExportCancelled() {
        pipExportUserCancel = false;
        writeLog('Export offline: Cancelled.');
        flashSeekHint('Export', 'Cancelled', 'notice');
    }

    function cleanupOfflineExportUiAfterAbort() {
        pipExportActive = false;
        pipExportEmergencyCleanup = null;
        setExportBlockingVisible(false);
        videoLeft.pause();
        videoRight.pause();
        stopRaf();
        setPlayingUi(false);
        updateControlsEnabled();
        if (exportPipBtn) exportPipBtn.textContent = EXPORT_WEBM_BTN_LABEL;
    }

    async function runOfflineWebmExport() {
        if (pipExportActive || !pipExportCanvas || !exportPipBtn) return;
        if (!canExportWebm()) return;
        if (!isOfflineWebCodecsExportSupported()) {
            writeLog('Export offline: WebCodecs VideoEncoder is not available in this browser.');
            flashSeekHint('Export', 'WebCodecs N/A', 'notice');
            return;
        }

        let muxerMod;
        try {
            muxerMod = await loadWebmMuxerModule();
        } catch (e) {
            writeLog(
                'Export offline: Failed to load webm-muxer — ' + (e && e.message ? e.message : String(e))
            );
            flashSeekHint('Export', 'Muxer load failed', 'notice');
            return;
        }

        const Muxer = muxerMod.Muxer;
        const ArrayBufferTarget = muxerMod.ArrayBufferTarget;
        if (!Muxer || !ArrayBufferTarget) {
            writeLog('Export offline: webm-muxer module is missing exports.');
            flashSeekHint('Export', 'Muxer invalid', 'notice');
            return;
        }

        pipExportUserCancel = false;
        pipExportEmergencyCleanup = null;
        const mode = getExportMode();
        const burnTc = getExportBurnTc();
        const burnCurrentFrames = getExportBurnCurrentFrames();
        const burnTotalFrames = getExportBurnTotalFrames();
        const { fps, exportDur } = getOfflineExportFpsAndDur(mode);
        const totalFromContainer = exportTotalFrameCount(mode, exportDur);
        const totalFrames =
            totalFromContainer > 0
                ? totalFromContainer
                : offlineExportFrameCount(exportDur, fps);
        const frameDurUs = offlineFrameDurationUs(fps);

        let vw;
        let vh;
        if (mode === 'compare-pip') {
            vw = videoRight.videoWidth | 0;
            vh = videoRight.videoHeight | 0;
        } else if (mode === 'solo-old') {
            vw = videoLeft.videoWidth | 0;
            vh = videoLeft.videoHeight | 0;
        } else {
            vw = videoRight.videoWidth | 0;
            vh = videoRight.videoHeight | 0;
        }

        const size = computePipExportCanvasSize(vw, vh, 1920);
        if (!size) {
            writeLog('Export offline: Could not read video resolution.');
            return;
        }
        const cw = size.w;
        const ch = size.h;
        const codecPick = await pickOfflineVideoEncoderCodec(cw, ch, fps);
        if (!codecPick) {
            writeLog('Export offline: No supported VP8/VP9 VideoEncoder configuration.');
            flashSeekHint('Export', 'Codec N/A', 'notice');
            return;
        }

        pipExportCanvas.width = cw;
        pipExportCanvas.height = ch;
        const ctx = pipExportCanvas.getContext('2d', { alpha: false });
        if (!ctx) {
            writeLog('Export offline: Failed to acquire Canvas 2D context.');
            return;
        }
        ctx.imageSmoothingEnabled = true;
        const pipGeom = mode === 'compare-pip' ? buildPipGeometry(cw, ch) : null;

        const exportAudioMode = getAudioMode();
        let includeAudio = exportAudioMode !== 'mute';
        let audioNote = '';
        const audioConfig = includeAudio ? await pickOfflineAudioEncoderConfig() : null;
        if (includeAudio && !audioConfig) {
            includeAudio = false;
            audioNote = ' (audio skipped: AudioEncoder/opus unavailable)';
        }

        const modeEn =
            mode === 'compare-pip' ? 'PiP compare' : mode === 'solo-old' ? 'older only' : 'newer only';
        const burnParts = [];
        if (burnTc) burnParts.push('Time Code');
        if (burnCurrentFrames) burnParts.push('Current Frame');
        if (burnTotalFrames) burnParts.push('Total Frame');
        const tcEn = burnParts.length ? burnParts.join('+') + ' burn-in' : 'no burn-in';
        const audioEn = audioModeLabel(exportAudioMode);

        pipExportActive = true;
        resetPlaybackSpeedForExport();
        setExportBlockingVisible(true);
        updateExportBlockingSub('Preparing offline bounce…');
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

        let preRenderedAudio = null;
        if (includeAudio && typeof AudioData !== 'undefined') {
            if (pipExportUserCancel) {
                cleanupOfflineExportUiAfterAbort();
                finishOfflineExportCancelled();
                return;
            }
            if (offlineExportAllNeededSidesKnownWithoutAudio(exportAudioMode)) {
                includeAudio = false;
                audioNote = ' (no audio tracks in source)';
                writeLog('Export offline: Skipping audio render — no audio tracks for this Audio mode.');
            } else {
                updateExportBlockingSub('Rendering audio…');
                preRenderedAudio = await renderOfflineExportAudio(mode, exportDur, exportAudioMode);
                if (pipExportUserCancel) {
                    cleanupOfflineExportUiAfterAbort();
                    finishOfflineExportCancelled();
                    return;
                }
                if (!preRenderedAudio) {
                    includeAudio = false;
                    audioNote += ' (audio render failed)';
                }
            }
        } else if (includeAudio) {
            includeAudio = false;
            audioNote = ' (audio skipped: AudioData API unavailable)';
        }

        const target = new ArrayBufferTarget();
        const muxerOpts = {
            target: target,
            video: {
                codec: codecPick.muxCodec,
                width: cw,
                height: ch,
                frameRate: fps,
            },
            firstTimestampBehavior: 'strict',
        };
        if (includeAudio) {
            muxerOpts.audio = {
                codec: 'A_OPUS',
                sampleRate: 48000,
                numberOfChannels: 2,
            };
        }
        const muxer = new Muxer(muxerOpts);

        let encoderError = null;
        const audioEncoderErrorRef = { error: null };
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => {
                encoderError = e;
            },
        });
        videoEncoder.configure({
            codec: codecPick.codec,
            width: cw,
            height: ch,
            bitrate: cw * ch > 2073600 ? 12_000_000 : 8_000_000,
            framerate: fps,
        });

        let uiCleaned = false;
        function cleanupOfflineExportShell() {
            if (uiCleaned) return;
            uiCleaned = true;
            setExportBlockingVisible(false);
            videoLeft.pause();
            videoRight.pause();
            stopRaf();
            setPlayingUi(false);
            applyTimeToVideos(0);
            seekBar.value = '0';
            currentTimeEl.textContent = formatTimecodeForTransport(0);
            updateDriftAndOverlays();
            pipExportActive = false;
            exportPipBtn.textContent = EXPORT_WEBM_BTN_LABEL;
            updateControlsEnabled();
            pipExportEmergencyCleanup = null;
            try {
                if (videoEncoder.state !== 'closed') videoEncoder.close();
            } catch (_) {}
        }
        pipExportEmergencyCleanup = cleanupOfflineExportShell;

        let decodeSources = { useDecode: false, left: null, right: null };
        if (!pipExportUserCancel) {
            decodeSources = await createOfflineExportDecodeSources(mode, fps);
            if (pipExportUserCancel) {
                closeOfflineExportDecodeSources(decodeSources);
                cleanupOfflineExportUiAfterAbort();
                finishOfflineExportCancelled();
                return;
            }
        }

        const videoPathEn = decodeSources.useDecode
            ? 'MP4 WebCodecs decode'
            : 'video seek (fallback)';

        writeLog(
            'Export offline: Started (' +
                modeEn +
                ', ' +
                tcEn +
                ', audio ' +
                audioEn +
                (includeAudio ? ' -> OfflineAudio' : ' (video-only)') +
                audioNote +
                ', ' +
                fps +
                ' fps, ' +
                totalFrames +
                ' frames, ' +
                videoPathEn +
                ', WebCodecs ' +
                codecPick.codec +
                ')'
        );

        try {
            if (pipExportUserCancel) throw new Error('cancelled');

            let lastPct = -1;
            let frameLeftVf = null;
            let frameRightVf = null;
            try {
                for (let n = 0; n < totalFrames; n++) {
                    if (pipExportUserCancel) throw new Error('cancelled');
                    if (encoderError && !pipExportUserCancel) throw encoderError;

                    const tcSec = buildTcSecForOfflineFrame(mode, n, fps, exportDur);
                    let frameSources = null;
                    if (decodeSources.useDecode) {
                        if (decodeSources.left) {
                            frameLeftVf = await decodeSources.left.getVideoFrameForExportIndex(n);
                        }
                        if (decodeSources.right) {
                            frameRightVf = await decodeSources.right.getVideoFrameForExportIndex(n);
                        }
                        frameSources = { left: frameLeftVf, right: frameRightVf };
                    } else {
                        const t = n / fps;
                        await seekVideosForOfflineFrame(mode, t);
                    }
                    drawExportFrameBundle(
                        mode,
                        ctx,
                        cw,
                        ch,
                        pipGeom,
                        exportDur,
                        tcSec,
                        frameSources
                    );
                    if (frameLeftVf) {
                        try {
                            frameLeftVf.close();
                        } catch (_) {}
                        frameLeftVf = null;
                    }
                    if (frameRightVf) {
                        try {
                            frameRightVf.close();
                        } catch (_) {}
                        frameRightVf = null;
                    }

                    const tsUs = offlineFrameTimestampUs(n, fps);
                    const vf = new VideoFrame(pipExportCanvas, {
                        timestamp: tsUs,
                        duration: frameDurUs,
                    });
                    const keyFrame = n === 0 || n % Math.max(1, fps) === 0;
                    videoEncoder.encode(vf, { keyFrame: keyFrame });
                    vf.close();

                    const pct = Math.min(100, Math.round((100 * (n + 1)) / totalFrames));
                    if (pct !== lastPct && (pct % 2 === 0 || n === totalFrames - 1)) {
                        lastPct = pct;
                        updateExportBlockingSub('Offline bounce… ' + pct + '% (' + (n + 1) + '/' + totalFrames + ')');
                    }
                    if (n % 4 === 3) {
                        await new Promise((r) => setTimeout(r, 0));
                    }
                }
            } finally {
                closeOfflineExportDecodeSources(decodeSources);
            }

            if (pipExportUserCancel) throw new Error('cancelled');

            if (includeAudio && preRenderedAudio && audioConfig) {
                updateExportBlockingSub('Encoding audio… 0%');
                try {
                    const bufferedAudio = await encodeRenderedAudioToBuffer(
                        preRenderedAudio,
                        audioConfig,
                        audioEncoderErrorRef
                    );
                    updateExportBlockingSub('Encoding audio… mux');
                    muxBufferedAudioChunks(muxer, bufferedAudio);
                } catch (audioEncErr) {
                    writeLog(
                        'Export offline: Audio encode failed — ' +
                            (audioEncErr && audioEncErr.message
                                ? audioEncErr.message
                                : String(audioEncErr))
                    );
                    throw audioEncErr;
                }
            }

            if (pipExportUserCancel) throw new Error('cancelled');
            updateExportBlockingSub('Finalizing…');
            await videoEncoder.flush();
            await videoEncoder.close();
            muxer.finalize();

            const buffer = target.buffer;
            if (!buffer || !buffer.byteLength) {
                throw new Error('output buffer is empty');
            }
            const blob = new Blob([buffer], { type: 'video/webm' });
            cleanupOfflineExportShell();
            downloadOfflineWebmBlob(blob, mode);
            writeLog(
                'Export offline: Done (' +
                    modeEn +
                    ', ' +
                    tcEn +
                    ', ' +
                    (includeAudio ? 'audio ' + audioEn : 'no audio') +
                    ', ' +
                    Math.round(blob.size / 1024) +
                    ' KiB, ' +
                    cw +
                    '×' +
                    ch +
                    ', ' +
                    totalFrames +
                    ' frames)'
            );
            flashSeekHint('Export', 'Offline done', 'notice');
        } catch (err) {
            closeOfflineExportDecodeSources(decodeSources);
            cleanupOfflineExportShell();
            if (isOfflineExportCancelled(err)) {
                finishOfflineExportCancelled();
                return;
            }
            writeLog('Export offline: ' + (err && err.message ? err.message : String(err)));
            flashSeekHint('Export', 'Failed', 'notice');
        }
    }
