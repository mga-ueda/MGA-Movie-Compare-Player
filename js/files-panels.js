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
                const baseFps = c != null && c > 0 ? c : DISPLAY_FPS;
                const totalF = Math.max(0, Math.round(d * baseFps));
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

    /** HH:MM:SS:ff（fpsInt は整数コマ / 秒） */
    function formatTimecodeWithFpsInt(sec, fpsInt) {
        if (!Number.isFinite(sec) || sec < 0) sec = 0;
        const f = Math.max(1, fpsInt | 0);
        const totalFrames = Math.floor(sec * f + 1e-9);
        const ff = ((totalFrames % f) + f) % f;
        const totalSec = Math.floor(totalFrames / f);
        const s = totalSec % 60;
        const m = Math.floor(totalSec / 60) % 60;
        const h = Math.floor(totalSec / 3600);
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ':' + pad2(ff);
    }

    function formatTimecodeForSide(sec, side) {
        return formatTimecodeWithFpsInt(sec, roundedFpsForSide(side));
    }

    function formatTimecodeForTransport(sec) {
        return formatTimecodeWithFpsInt(sec, masterFpsIntForTransport());
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

