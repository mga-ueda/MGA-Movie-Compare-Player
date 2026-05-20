    // ファイル選別とパネル表示
    /** 拡張子が動画っぽいもの（OS が MIME を付けない場合の補助） */
    const VIDEO_FILE_EXT = new Set([
        '.mp4',
        '.m4v',
        '.webm',
        '.ogv',
        '.mov',
        '.qt',
        '.avi',
        '.mkv',
        '.wmv',
        '.flv',
        '.ts',
        '.mts',
        '.m2ts',
        '.mpg',
        '.mpeg',
        '.m1v',
        '.m2v',
        '.3gp',
        '.3g2',
        '.asf',
        '.f4v',
    ]);

    function fileExtLower(name) {
        const s = String(name || '').toLowerCase();
        const dot = s.lastIndexOf('.');
        if (dot < 0) return '';
        return s.slice(dot);
    }

    function mimeTypeHintForVideoFileName(name) {
        const ext = fileExtLower(name);
        const map = {
            '.webm': 'video/webm',
            '.mp4': 'video/mp4',
            '.m4v': 'video/mp4',
            '.mov': 'video/quicktime',
            '.qt': 'video/quicktime',
            '.ogv': 'video/ogg',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.ts': 'video/mp2t',
            '.mts': 'video/mp2t',
            '.m2ts': 'video/mp2t',
            '.mpg': 'video/mpeg',
            '.mpeg': 'video/mpeg',
            '.m1v': 'video/mpeg',
            '.m2v': 'video/mpeg',
            '.3gp': 'video/3gpp',
            '.3g2': 'video/3gpp2',
            '.asf': 'video/x-ms-asf',
            '.f4v': 'video/mp4',
        };
        return map[ext] || 'application/octet-stream';
    }

    function isUsableVideoFile(f) {
        const type = (f.type || '').toLowerCase();
        if (type.startsWith('video/')) return true;
        if (type === 'application/mp4' || type === 'application/x-mp4') return true;
        if (type.startsWith('audio/') || type.startsWith('image/') || type.startsWith('text/')) {
            return false;
        }
        const ext = fileExtLower(f.name);
        if (!ext || !VIDEO_FILE_EXT.has(ext)) return false;
        return !type || type === 'application/octet-stream' || type.startsWith('application/');
    }

    function pickVideoFiles(fileList) {
        return Array.from(fileList).filter(isUsableVideoFile);
    }

    function compareFileByModifiedThenName(a, b) {
        const d = a.lastModified - b.lastModified;
        if (d !== 0) return d;
        return String(a.name).localeCompare(String(b.name), 'ja');
    }

    /** 複数選択時は最終更新が最も古いファイルと最も新しいファイルを比較用に選ぶ */
    function pickOldestAndNewest(videos) {
        if (videos.length === 0) return null;
        const sorted = [...videos].sort(compareFileByModifiedThenName);
        return [sorted[0], sorted[sorted.length - 1]];
    }

    function formatFileDateEn(ms) {
        try {
            return new Date(ms).toLocaleString('en-CA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
        } catch (_) {
            return '';
        }
    }

    function updatePanelInfoLine(side) {
        const file = side === 'left' ? fileLeft : fileRight;
        const el = side === 'left' ? infoLeft : infoRight;
        const v = side === 'left' ? videoLeft : videoRight;
        if (!file) {
            el.hidden = true;
            el.textContent = '';
        } else {
            const mod = 'Modified: ' + formatFileDateEn(file.lastModified);
            const d = getDuration(v);
            if (!d) {
                el.hidden = false;
                el.textContent = mod;
            } else {
                const c = containerFps[side];
                const totalF = totalFrameCountForSide(side);
                let fpsStr;
                if (c != null && c > 0) {
                    fpsStr = c + ' fps';
                } else {
                    fpsStr = 'FPS n/a (~' + DISPLAY_FPS + ' est.)';
                }
                el.hidden = false;
                el.textContent = mod + ' · ' + fpsStr + ' · Total: ' + totalF + ' f';
            }
        }
    }

    function revokeAll() {
        containerFps.left = null;
        containerFps.right = null;
        containerSampleCount.left = null;
        containerSampleCount.right = null;
        containerStszSampleCount.left = null;
        containerStszSampleCount.right = null;
        containerTimelineFrameOffset.left = 0;
        containerTimelineFrameOffset.right = 0;
        containerMediaDurationSec.left = null;
        containerMediaDurationSec.right = null;
        containerHasAudio.left = null;
        containerHasAudio.right = null;
        infoLeft.hidden = true;
        infoLeft.textContent = '';
        infoRight.hidden = true;
        infoRight.textContent = '';
        if (urlLeft) {
            URL.revokeObjectURL(urlLeft);
            urlLeft = null;
        }
        if (urlRight) {
            URL.revokeObjectURL(urlRight);
            urlRight = null;
        }
        fileLeft = null;
        fileRight = null;
    }

    function setLoaded(panel, loaded) {
        panel.classList.toggle('loaded', loaded);
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    /** 総フレーム数の桁数（ラベル幅を途中で変えないための現在フレーム表示幅） */
    function burnInFrameDigitWidth(totalFrames) {
        const t = Math.max(0, totalFrames | 0);
        if (t <= 0) return 1;
        return String(t).length;
    }

    function formatBurnInCurrentFrame(cur, digitWidth) {
        const w = Math.max(1, digitWidth | 0);
        return String(Math.max(0, cur | 0)).padStart(w, '0');
    }

    function fpsFloatForSide(side) {
        const c = containerFps[side];
        return c != null && c > 0 ? c : DISPLAY_FPS;
    }

    function masterFpsFloatForTransport() {
        return Math.max(fpsFloatForSide('left'), fpsFloatForSide('right'));
    }

    function fpsFloatForExportMode(mode) {
        if (mode === 'compare-pip') return masterFpsFloatForTransport();
        if (mode === 'solo-old') return fpsFloatForSide('left');
        return fpsFloatForSide('right');
    }

    const NTSC_24000_1001 = 24000 / 1001;
    const NTSC_30000_1001 = 30000 / 1001;
    const NTSC_60000_1001 = 60000 / 1001;

    /** 23.976 / 29.97 / 59.94 のみ（整数 24・30・60 は含めない） */
    function ntscFrameRateKind(fps) {
        if (!Number.isFinite(fps) || fps <= 0) return null;
        if (Math.abs(fps - NTSC_30000_1001) < 0.04) return '30000_1001';
        if (Math.abs(fps - NTSC_24000_1001) < 0.04) return '24000_1001';
        if (Math.abs(fps - NTSC_60000_1001) < 0.04) return '60000_1001';
        return null;
    }

    /** TC の ff 桁（29.97 系は 30、59.94p は 60、23.976 は 24） */
    function tcModulusFps(fpsFloat) {
        const kind = ntscFrameRateKind(fpsFloat);
        if (kind === '30000_1001') return 30;
        if (kind === '60000_1001') return 60;
        if (kind === '24000_1001') return 24;
        return Math.max(1, Math.round(fpsFloat));
    }

    /** タイムコード・焼き込みフレーム番号用の 0 始まりインデックス */
    function linearFrameIndexFromSec(sec, fpsFloat) {
        if (!Number.isFinite(sec) || sec < 0) sec = 0;
        const kind = ntscFrameRateKind(fpsFloat);
        if (kind === '30000_1001') {
            return Math.max(0, Math.floor((sec * 30000) / 1001 + 1e-9));
        }
        if (kind === '24000_1001') {
            return Math.max(0, Math.floor((sec * 24000) / 1001 + 1e-9));
        }
        if (kind === '60000_1001') {
            return Math.max(0, Math.floor(sec * 60 + 1e-9));
        }
        return Math.max(0, Math.floor(sec * fpsFloat + 1e-9));
    }

    /** duration 境界の直前フレームの 0 始まりインデックス（終端で +1 しない） */
    function lastFrameIndexFromDurationSec(sec, fpsFloat) {
        if (!Number.isFinite(sec) || sec <= 0) return -1;
        const fMod = tcModulusFps(fpsFloat);
        const probeSec = Math.max(0, sec - 1 / fMod);
        return linearFrameIndexFromSec(probeSec, fpsFloat);
    }

    /** クリップのフレーム個数（最終インデックス + 1） */
    function frameCountFromDurationSec(sec, fpsFloat) {
        const last = lastFrameIndexFromDurationSec(sec, fpsFloat);
        return last >= 0 ? last + 1 : 0;
    }

    function clampFrameIndexToClip(idx, side) {
        const total = totalFrameCountForSide(side);
        if (total > 0) return Math.max(0, Math.min(idx | 0, total - 1));
        return Math.max(0, idx | 0);
    }

    function clampFrameIndexToExportMode(idx, mode) {
        let total = 0;
        if (mode === 'solo-old') total = totalFrameCountForSide('left');
        else if (mode === 'solo-new') total = totalFrameCountForSide('right');
        else total = Math.max(totalFrameCountForSide('left'), totalFrameCountForSide('right'));
        if (total > 0) return Math.max(0, Math.min(idx | 0, total - 1));
        return Math.max(0, idx | 0);
    }

    function mediaDurationSecForSide(side) {
        const md = containerMediaDurationSec[side];
        const v = side === 'left' ? videoLeft : videoRight;
        const d = getDuration(v);
        if (md != null && md > 0 && d > 0) return Math.max(md, d);
        if (md != null && md > 0) return md;
        return d;
    }

    /** 再生位置の 0 始まりフレーム（クリップ内にクランプ。elst は加算しない） */
    function playbackFrameIndexForSide(sec, side) {
        const base = linearFrameIndexFromSec(sec, fpsFloatForSide(side));
        return clampFrameIndexToClip(base, side);
    }

    function playbackFrameIndexForExportMode(sec, mode) {
        const base = linearFrameIndexFromSec(sec, fpsFloatForExportMode(mode));
        return clampFrameIndexToExportMode(base, mode);
    }

    function totalFrameCountForSide(side) {
        const stsz = containerStszSampleCount[side];
        const dur = mediaDurationSecForSide(side);
        const fps = fpsFloatForSide(side);
        const fromDur = dur > 0 ? frameCountFromDurationSec(dur, fps) : 0;
        if (stsz != null && stsz > 0) {
            const n = stsz | 0;
            return fromDur > 0 ? Math.min(n, fromDur) : n;
        }
        const samples = containerSampleCount[side];
        if (samples != null && samples > 0) {
            const n = samples | 0;
            return fromDur > 0 ? Math.min(n, fromDur) : n;
        }
        return fromDur;
    }

    function reconcileContainerSampleCountForSide(side) {
        const total = totalFrameCountForSide(side);
        if (total > 0) containerSampleCount[side] = total;
    }

    /** moov から FPS が取れないとき、サンプル数と尺から推定（60fps 付近を優先） */
    function inferContainerFpsForSide(side) {
        const cur = containerFps[side];
        if (cur != null && cur > 0) return;
        const stsz = containerStszSampleCount[side];
        const md = containerMediaDurationSec[side];
        const v = side === 'left' ? videoLeft : videoRight;
        const d = getDuration(v);
        const dur = md != null && md > 0 ? md : d;
        if (!(dur > 0)) return;
        let fps = null;
        if (stsz != null && stsz > 0) {
            fps = stsz / dur;
        } else {
            const total = containerSampleCount[side];
            if (total != null && total > 0) fps = total / dur;
        }
        if (!Number.isFinite(fps) || fps <= 0) return;
        const rounded = Math.round(Math.min(240, Math.max(1, fps)) * 100) / 100;
        if (Math.abs(rounded - 60) < 0.15) {
            containerFps[side] = 60;
            return;
        }
        if (Math.abs(rounded - NTSC_60000_1001) < 0.04) {
            containerFps[side] = Math.round(NTSC_60000_1001 * 100) / 100;
            return;
        }
        containerFps[side] = rounded;
    }

    function mediaDurationSecForExportMode(mode) {
        if (mode === 'solo-old') return mediaDurationSecForSide('left');
        if (mode === 'solo-new') return mediaDurationSecForSide('right');
        return Math.max(mediaDurationSecForSide('left'), mediaDurationSecForSide('right'));
    }

    function sampleCountForExportMode(mode) {
        if (mode === 'solo-old') return containerSampleCount.left;
        if (mode === 'solo-new') return containerSampleCount.right;
        const nL = containerSampleCount.left;
        const nR = containerSampleCount.right;
        const dL = mediaDurationSecForSide('left');
        const dR = mediaDurationSecForSide('right');
        if (nL != null && nL > 0 && nR != null && nR > 0) {
            return dL >= dR ? nL : nR;
        }
        return nL != null && nL > 0 ? nL : nR;
    }

    function totalFrameCountFromMediaDuration(mode) {
        const dur = mediaDurationSecForExportMode(mode);
        if (dur <= 0) return 0;
        return frameCountFromDurationSec(dur, fpsFloatForExportMode(mode));
    }

    function exportSecForBurnIn(mode, exportDur, tcSec) {
        if (mode === 'compare-pip') {
            const t =
                tcSec && tcSec.transportSec != null
                    ? tcSec.transportSec
                    : Math.max(videoLeft.currentTime || 0, videoRight.currentTime || 0);
            return Math.min(t, exportDur);
        }
        if (mode === 'solo-old') {
            if (tcSec && tcSec.leftSec != null) return Math.min(tcSec.leftSec, exportDur);
            const t = videoLeft.currentTime || 0;
            const d = getDuration(videoLeft);
            return d > 0 ? Math.min(t, d) : t;
        }
        if (tcSec && tcSec.rightSec != null) return Math.min(tcSec.rightSec, exportDur);
        const t = videoRight.currentTime || 0;
        const d = getDuration(videoRight);
        return d > 0 ? Math.min(t, d) : t;
    }

    /** 0 始まりの現在フレーム（焼き込み TC と同じ換算＋elst オフセット） */
    function exportCurrentFrameIndex(mode, exportDur, tcSec) {
        const sec = exportSecForBurnIn(mode, exportDur, tcSec);
        return playbackFrameIndexForExportMode(sec, mode);
    }

    /** クリップ総フレーム数（サンプル表・コンテナ尺・video.duration の最大） */
    function exportTotalFrameCount(mode, exportDur) {
        const fps = fpsFloatForExportMode(mode);
        let total = 0;
        if (mode === 'solo-old') total = totalFrameCountForSide('left');
        else if (mode === 'solo-new') total = totalFrameCountForSide('right');
        else total = Math.max(totalFrameCountForSide('left'), totalFrameCountForSide('right'));
        if (total > 0) return total;
        if (exportDur <= 0) return 0;
        return Math.max(1, frameCountFromDurationSec(exportDur, fps));
    }

    /** 焼き込み TC 文字列と同じ 0 始まりフレーム番号 */
    function frameIndexFromTcStringForMode(tcStr, mode) {
        const m = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/.exec(tcStr || '');
        if (!m) return 0;
        const fMod = tcModulusFps(fpsFloatForExportMode(mode));
        const h = parseInt(m[1], 10);
        const mi = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        const ff = parseInt(m[4], 10);
        return h * 3600 * fMod + mi * 60 * fMod + s * fMod + ff;
    }

    function roundedFpsForSide(side) {
        const c = containerFps[side];
        if (c != null && c > 0) return Math.max(1, Math.min(240, Math.round(c)));
        return DISPLAY_FPS;
    }

    function masterFpsIntForTransport() {
        return Math.max(roundedFpsForSide('left'), roundedFpsForSide('right'));
    }

    function refreshMasterFrameSec() {
        masterFrameSec = 1 / masterFpsIntForTransport();
    }

    /** HH:MM:SS:ff（linearFrameIndexFromSec と同じフレーム番号から分解） */
    function formatTimecodeFromFrameIndex(frameIndex, fpsFloat) {
        const fMod = tcModulusFps(fpsFloat);
        const totalFrames = Math.max(0, frameIndex | 0);
        const ff = totalFrames % fMod;
        const secFromFrames = Math.floor(totalFrames / fMod);
        const s = secFromFrames % 60;
        const m = Math.floor(secFromFrames / 60) % 60;
        const h = Math.floor(secFromFrames / 3600);
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ':' + pad2(ff);
    }

    function formatTimecodeForSide(sec, side) {
        return formatTimecodeFromFrameIndex(
            playbackFrameIndexForSide(sec, side),
            fpsFloatForSide(side)
        );
    }

    function formatTimecodeForTransport(sec) {
        const mode = typeof getViewMode === 'function' ? getViewMode() : 'compare-pip';
        return formatTimecodeFromFrameIndex(
            playbackFrameIndexForExportMode(sec, mode),
            masterFpsFloatForTransport()
        );
    }

    function buildBurnInFramePart(mode, exportDur, burnCurrentFrames, burnTotalFrames, tcSec, tcStr) {
        if (!burnCurrentFrames && !burnTotalFrames) return '';
        let cur = null;
        let tot = null;
        if (burnCurrentFrames) {
            cur =
                tcStr != null && tcStr.length > 0
                    ? frameIndexFromTcStringForMode(tcStr, mode)
                    : exportCurrentFrameIndex(mode, exportDur, tcSec);
        }
        if (burnTotalFrames) {
            tot = exportTotalFrameCount(mode, exportDur);
        }
        const widthRef =
            tot != null ? tot : burnCurrentFrames ? exportTotalFrameCount(mode, exportDur) : 0;
        const curWidth = burnInFrameDigitWidth(widthRef);
        if (burnCurrentFrames && burnTotalFrames) {
            return formatBurnInCurrentFrame(cur, curWidth) + '/' + String(tot);
        }
        if (burnCurrentFrames) return formatBurnInCurrentFrame(cur, curWidth);
        return String(tot);
    }

    /** プレイヤー／書き出し共通の TC + 現在 f + 総 f ラベル（例: 00:00:00:00 - 0/1234） */
    function buildBurnInLabel(mode, exportDur, burnTc, burnCurrentFrames, burnTotalFrames, tcSec) {
        let tcStr = '';
        if (burnTc) {
            const sec = exportSecForBurnIn(mode, exportDur, tcSec);
            if (mode === 'compare-pip') {
                tcStr = formatTimecodeForTransport(sec);
            } else if (mode === 'solo-old') {
                tcStr = formatTimecodeForSide(sec, 'left');
            } else {
                tcStr = formatTimecodeForSide(sec, 'right');
            }
        }
        const framePart = buildBurnInFramePart(
            mode,
            exportDur,
            burnCurrentFrames,
            burnTotalFrames,
            tcSec,
            tcStr
        );
        if (!burnTc && !framePart) return '';
        if (burnTc && tcStr && framePart) return tcStr + ' - ' + framePart;
        if (burnTc && tcStr) return tcStr;
        return framePart;
    }

    function playerSideToExportMode(side) {
        if (side === 'left') return 'solo-old';
        if (side === 'right') return 'solo-new';
        return 'compare-pip';
    }

    function buildBurnInLabelForPlayer(side) {
        const burnTc = getExportBurnTc();
        const burnCur = getExportBurnCurrentFrames();
        const burnTf = getExportBurnTotalFrames();
        if (!burnTc && !burnCur && !burnTf) return '';
        let exportDur = 0;
        if (side === 'left') exportDur = getDuration(videoLeft);
        else if (side === 'right') exportDur = getDuration(videoRight);
        else exportDur = masterDuration();
        return buildBurnInLabel(
            playerSideToExportMode(side),
            exportDur,
            burnTc,
            burnCur,
            burnTf,
            null
        );
    }

    function getSeekableEnd(v) {
        try {
            if (!v.seekable || v.seekable.length === 0) return 0;
            const end = v.seekable.end(v.seekable.length - 1);
            return Number.isFinite(end) && end > 0 ? end : 0;
        } catch (_) {
            return 0;
        }
    }

    function getBufferedEnd(v) {
        try {
            if (!v.buffered || v.buffered.length === 0) return 0;
            const end = v.buffered.end(v.buffered.length - 1);
            return Number.isFinite(end) && end > 0 ? end : 0;
        } catch (_) {
            return 0;
        }
    }

    /**
     * 再生尺。MJPEG 入り AVI 等で duration が NaN/Infinity のとき seekable や
     * blob ソースの buffered 末尾から推定する。
     */
    function getDuration(v) {
        const d = v.duration;
        if (Number.isFinite(d) && d > 0) return d;
        const seekEnd = getSeekableEnd(v);
        if (seekEnd > 0) return seekEnd;
        const src = typeof v.src === 'string' ? v.src : '';
        if (src.startsWith('blob:')) {
            const bufEnd = getBufferedEnd(v);
            if (bufEnd > 0) return bufEnd;
        }
        return 0;
    }

    function masterDuration() {
        return Math.max(getDuration(videoLeft), getDuration(videoRight), 0.01);
    }

