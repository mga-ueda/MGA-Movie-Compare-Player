    // 再生速度（0.1x～2x。保存せずリロード時は 1.0x）
    const PLAYBACK_SPEED_RATES = (function buildPlaybackSpeedRates() {
        const out = [0.1];
        for (let q = 1; q <= 8; q++) {
            out.push(q * 0.25);
        }
        return out;
    })();
    const PLAYBACK_SPEED_INDEX_MIN = 0;
    const PLAYBACK_SPEED_INDEX_MAX = PLAYBACK_SPEED_RATES.length - 1;
    const PLAYBACK_SPEED_INDEX_DEFAULT = 4;
    /** 1.0× 未満のスロー4段階で 1.0→0.5 まで均等に下げる（耳障り対策） */
    const PLAYBACK_SPEED_SLOW_VOLUME_MIN = 0.5;
    const PLAYBACK_SPEED_NORMAL_VOLUME = 1;
    const PLAYBACK_SPEED_SLOW_VOLUME_STEP =
        (PLAYBACK_SPEED_NORMAL_VOLUME - PLAYBACK_SPEED_SLOW_VOLUME_MIN) /
        PLAYBACK_SPEED_INDEX_DEFAULT;
    let playbackSpeedIndex = PLAYBACK_SPEED_INDEX_DEFAULT;

    function playbackRateFromIndex(index) {
        const i = Math.max(
            PLAYBACK_SPEED_INDEX_MIN,
            Math.min(PLAYBACK_SPEED_INDEX_MAX, index | 0)
        );
        return PLAYBACK_SPEED_RATES[i];
    }

    /** UI・ヒント用（0.1x / 0.25x … 2x） */
    function formatPlaybackSpeedRateLabel(index) {
        const r = playbackRateFromIndex(index);
        if (Math.abs(r - 1) < 0.001) return '1x';
        if (Number.isInteger(r)) return String(r) + 'x';
        return r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'x';
    }

    function clampPlaybackSpeedIndex(index) {
        return Math.max(
            PLAYBACK_SPEED_INDEX_MIN,
            Math.min(PLAYBACK_SPEED_INDEX_MAX, Math.round(index))
        );
    }

    function volumeFromPlaybackSpeedIndex(index) {
        if (index >= PLAYBACK_SPEED_INDEX_DEFAULT) {
            return PLAYBACK_SPEED_NORMAL_VOLUME;
        }
        const slowSteps = PLAYBACK_SPEED_INDEX_DEFAULT - index;
        return (
            PLAYBACK_SPEED_NORMAL_VOLUME -
            slowSteps * PLAYBACK_SPEED_SLOW_VOLUME_STEP
        );
    }

    function resetPlaybackSpeedToDefault() {
        playbackSpeedIndex = PLAYBACK_SPEED_INDEX_DEFAULT;
        updatePlaybackSpeedUi();
        applyPlaybackSpeedToVideos();
    }

    function applyPlaybackSpeedToVideos() {
        const rate = playbackRateFromIndex(playbackSpeedIndex);
        const vol = volumeFromPlaybackSpeedIndex(playbackSpeedIndex);
        [videoLeft, videoRight].forEach((v) => {
            if (!v) return;
            try {
                v.defaultPlaybackRate = rate;
                v.playbackRate = rate;
                v.volume = vol;
            } catch (_) {}
        });
    }

    function updatePlaybackSpeedUi() {
        const rateLbl = formatPlaybackSpeedRateLabel(playbackSpeedIndex);
        if (playbackSpeedDisplay) {
            playbackSpeedDisplay.textContent = rateLbl;
            playbackSpeedDisplay.setAttribute('aria-valuenow', String(playbackSpeedIndex));
            playbackSpeedDisplay.setAttribute('aria-valuetext', rateLbl);
            playbackSpeedDisplay.title = rateLbl;
        }
        const xl = pipExportActive;
        const atMin = playbackSpeedIndex <= PLAYBACK_SPEED_INDEX_MIN;
        const atMax = playbackSpeedIndex >= PLAYBACK_SPEED_INDEX_MAX;
        if (playbackSpeedDown) playbackSpeedDown.disabled = xl || atMin;
        if (playbackSpeedUp) playbackSpeedUp.disabled = xl || atMax;
    }

    function setPlaybackSpeedIndex(nextIndex, logSource) {
        const clamped = clampPlaybackSpeedIndex(nextIndex);
        if (clamped === playbackSpeedIndex) return false;
        playbackSpeedIndex = clamped;
        applyPlaybackSpeedToVideos();
        updatePlaybackSpeedUi();
        if (logSource) logPlaybackSpeedChange(logSource);
        return true;
    }

    function bumpPlaybackSpeedStep(delta, logSource) {
        return setPlaybackSpeedIndex(playbackSpeedIndex + delta, logSource);
    }

    function resetPlaybackSpeedStep(logSource) {
        if (playbackSpeedIndex === PLAYBACK_SPEED_INDEX_DEFAULT) return false;
        return setPlaybackSpeedIndex(PLAYBACK_SPEED_INDEX_DEFAULT, logSource);
    }

    function logPlaybackSpeedChange(source) {
        const rateLbl = formatPlaybackSpeedRateLabel(playbackSpeedIndex);
        const suffix = source ? ' (' + source + ')' : '';
        writeLog('Playback speed: ' + rateLbl + suffix);
        flashSeekHint('Speed', rateLbl, 'notice');
        flashTransportOptBox('speed');
    }

    /** 書き出しは常に 1.0×。開始時に UI も含めてデフォルトへ戻す（書き出し後は復元しない） */
    function resetPlaybackSpeedForExport() {
        playbackSpeedIndex = PLAYBACK_SPEED_INDEX_DEFAULT;
        applyPlaybackSpeedToVideos();
        updatePlaybackSpeedUi();
    }

    function armPlaybackSpeedVideoListeners() {
        const reapply = () => {
            if (pipExportActive) return;
            applyPlaybackSpeedToVideos();
        };
        [videoLeft, videoRight].forEach((v) => {
            if (!v) return;
            v.addEventListener('loadedmetadata', reapply);
            v.addEventListener('play', reapply);
        });
    }

    resetPlaybackSpeedToDefault();
    armPlaybackSpeedVideoListeners();
