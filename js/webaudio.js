    // Web Audio ルーティング
    function getAudioMode() {
        const c = document.querySelector('input[name="audioMode"]:checked');
        return c && c.value ? c.value : 'split-mono';
    }

    function buildAudioGraph(mode, outputNode) {
        if (!audioCtx || !mediaSrcL || !mediaSrcR) return;
        mediaSrcL.disconnect();
        mediaSrcR.disconnect();
        const dest = outputNode != null ? outputNode : audioCtx.destination;
        const muteL = audioCtx.createGain();
        const muteR = audioCtx.createGain();
        muteL.gain.value = 0;
        muteR.gain.value = 0;

        if (mode === 'mute') {
            mediaSrcL.connect(muteL);
            muteL.connect(dest);
            mediaSrcR.connect(muteR);
            muteR.connect(dest);
            return;
        }

        if (mode === 'split-mono') {
            if (typeof audioCtx.createStereoPanner !== 'function') {
                mediaSrcL.connect(dest);
                mediaSrcR.connect(dest);
                return;
            }
            const sL = audioCtx.createChannelSplitter(2);
            const sR = audioCtx.createChannelSplitter(2);
            const gLL = audioCtx.createGain();
            gLL.gain.value = 0.5;
            const gLR = audioCtx.createGain();
            gLR.gain.value = 0.5;
            const gRL = audioCtx.createGain();
            gRL.gain.value = 0.5;
            const gRR = audioCtx.createGain();
            gRR.gain.value = 0.5;
            const panL = audioCtx.createStereoPanner();
            panL.pan.value = -1;
            const panR = audioCtx.createStereoPanner();
            panR.pan.value = 1;
            mediaSrcL.connect(sL);
            mediaSrcR.connect(sR);
            sL.connect(gLL, 0);
            sL.connect(gLR, 1);
            sR.connect(gRL, 0);
            sR.connect(gRR, 1);
            gLL.connect(panL);
            gLR.connect(panL);
            gRL.connect(panR);
            gRR.connect(panR);
            panL.connect(dest);
            panR.connect(dest);
            return;
        }
        if (mode === 'old-stereo') {
            mediaSrcL.connect(dest);
            mediaSrcR.connect(muteR);
            muteR.connect(dest);
            return;
        }
        if (mode === 'new-stereo') {
            mediaSrcL.connect(muteL);
            muteL.connect(dest);
            mediaSrcR.connect(dest);
        }
    }

    function restorePlaybackAudioRouting() {
        try {
            if (audioCtx && audioCtx.state !== 'closed' && mediaSrcL && mediaSrcR) {
                buildAudioGraph(getAudioMode());
            }
        } catch (_) {}
    }

    function ensureWebAudioRouting() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) {
            try {
                audioCtx = new Ctx();
            } catch (_) {
                return;
            }
        }
        if (!mediaSrcL) {
            try {
                mediaSrcL = audioCtx.createMediaElementSource(videoLeft);
                mediaSrcR = audioCtx.createMediaElementSource(videoRight);
                webAudioWired = true;
            } catch (_) {
                if (audioCtx) {
                    try {
                        audioCtx.close();
                    } catch (_e) {}
                }
                audioCtx = null;
                webAudioWired = false;
                mediaSrcL = null;
                mediaSrcR = null;
                return;
            }
        }
        try {
            buildAudioGraph(getAudioMode());
        } catch (_) {}
    }

