    // === 7. MP4 moov 走査（コンテナからの平均 FPS 推定）
    function rU32(u8, o) {
        return ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
    }
    function fourcc(u8, o) {
        return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    }
    function rU64FromU32(u8, o) {
        const hi = rU32(u8, o);
        const lo = rU32(u8, o + 4);
        return hi * 0x100000000 + lo;
    }
    function eachChildBox(u8, bodyStart, bodyEnd, fn) {
        let p = bodyStart;
        while (p + 8 <= bodyEnd) {
            let sz = rU32(u8, p);
            const typ = fourcc(u8, p + 4);
            if (sz < 8) break;
            let h = 8;
            if (sz === 1) {
                if (p + 16 > bodyEnd) break;
                sz = rU64FromU32(u8, p + 8);
                h = 16;
            }
            const boxEnd = sz === 0 ? bodyEnd : p + sz;
            if (boxEnd > bodyEnd || boxEnd <= p + h) break;
            const inner0 = p + h;
            fn(typ, inner0, boxEnd);
            if (sz === 0) break;
            p = boxEnd;
        }
    }
    function locateMoovRangeInBuffer(u8, start, end) {
        let out = null;
        eachChildBox(u8, start, end, (typ, b0, b1) => {
            if (typ === 'moov') out = [b0, b1];
        });
        return out;
    }
    async function readFileSliceToUint8(file, begin, end) {
        const b = file.slice(begin, end);
        return new Uint8Array(await b.arrayBuffer());
    }
    async function readMp4BufferForMoov(file) {
        const n = file.size;
        if (n < 16) return null;
        const headLen = Math.min(12 * 1024 * 1024, n);
        const head = await readFileSliceToUint8(file, 0, headLen);
        let moov = locateMoovRangeInBuffer(head, 0, head.byteLength);
        if (moov) return { buf: head, moov0: moov[0], moov1: moov[1] };
        const tailLen = Math.min(8 * 1024 * 1024, n);
        const tail = await readFileSliceToUint8(file, n - tailLen, n);
        moov = locateMoovRangeInBuffer(tail, 0, tail.byteLength);
        if (moov) return { buf: tail, moov0: moov[0], moov1: moov[1] };
        if (n <= 36 * 1024 * 1024) {
            const whole = await readFileSliceToUint8(file, 0, n);
            moov = locateMoovRangeInBuffer(whole, 0, whole.byteLength);
            if (moov) return { buf: whole, moov0: moov[0], moov1: moov[1] };
        }
        return null;
    }
    function parseSttsAverageDelta(u8, b0, b1) {
        if (b1 - b0 < 8) return null;
        const ec = rU32(u8, b0 + 4);
        let off = b0 + 8;
        let sumC = 0;
        let sumDur = 0;
        for (let i = 0; i < ec; i++) {
            if (off + 8 > b1) break;
            const sc = rU32(u8, off);
            const sd = rU32(u8, off + 4);
            sumC += sc;
            sumDur += sc * sd;
            off += 8;
        }
        if (sumC === 0) return null;
        return sumDur / sumC;
    }
    function parseStszSampleCount(u8, b0, b1) {
        if (b1 - b0 < 12) return null;
        return rU32(u8, b0 + 8);
    }
    function parseMdhdTimescaleDuration(u8, b0, b1) {
        if (b1 - b0 < 20) return null;
        const ver = u8[b0];
        if (ver === 1) {
            if (b1 - b0 < 36) return null;
            return {
                timescale: rU32(u8, b0 + 20),
                duration: rU64FromU32(u8, b0 + 24),
            };
        }
        return {
            timescale: rU32(u8, b0 + 12),
            duration: rU32(u8, b0 + 16),
        };
    }
    function parseTrakVideoFpsFromMoovChildren(u8, trakBody0, trakBody1) {
        let isVideo = false;
        let mdhdTd = null;
        let avgDelta = null;
        let sampleCount = null;

        function walkStbl(a, b) {
            eachChildBox(u8, a, b, (typ, b0, b1) => {
                if (typ === 'stts') {
                    const d = parseSttsAverageDelta(u8, b0, b1);
                    if (d != null) avgDelta = d;
                } else if (typ === 'stsz') {
                    const c = parseStszSampleCount(u8, b0, b1);
                    if (c != null) sampleCount = c;
                }
            });
        }
        function walkMinf(a, b) {
            eachChildBox(u8, a, b, (typ, b0, b1) => {
                if (typ === 'stbl') walkStbl(b0, b1);
            });
        }
        function walkMdia(a, b) {
            eachChildBox(u8, a, b, (typ, b0, b1) => {
                if (typ === 'hdlr') {
                    if (b1 - b0 >= 12) {
                        const ht = fourcc(u8, b0 + 8);
                        if (ht === 'vide' || ht === 'pict') isVideo = true;
                    }
                } else if (typ === 'mdhd') {
                    const p = parseMdhdTimescaleDuration(u8, b0, b1);
                    if (p && p.timescale) mdhdTd = p;
                } else if (typ === 'minf') walkMinf(b0, b1);
            });
        }

        eachChildBox(u8, trakBody0, trakBody1, (typ, b0, b1) => {
            if (typ === 'mdia') walkMdia(b0, b1);
        });
        if (!isVideo || !mdhdTd || !mdhdTd.timescale) return null;

        let fps = null;
        if (avgDelta && avgDelta > 0) {
            fps = mdhdTd.timescale / avgDelta;
        }
        if ((fps == null || !Number.isFinite(fps) || fps <= 0) && sampleCount > 0 && mdhdTd.duration > 0) {
            const sec = mdhdTd.duration / mdhdTd.timescale;
            if (sec > 1e-6) fps = sampleCount / sec;
        }
        if (fps == null || !Number.isFinite(fps) || fps <= 0) return null;
        return Math.round(Math.min(240, Math.max(1, fps)) * 100) / 100;
    }

    function parseFirstVideoTrackFpsFromMoov(u8, moov0, moov1) {
        let found = null;
        eachChildBox(u8, moov0, moov1, (typ, b0, b1) => {
            if (typ === 'trak' && found == null) {
                const fp = parseTrakVideoFpsFromMoovChildren(u8, b0, b1);
                if (fp != null) found = fp;
            }
        });
        return found;
    }
    async function extractMp4ContainerFpsFromFile(file) {
        try {
            const loc = await readMp4BufferForMoov(file);
            if (!loc) return null;
            return parseFirstVideoTrackFpsFromMoov(loc.buf, loc.moov0, loc.moov1);
        } catch (_) {
            return null;
        }
    }
    async function refreshContainerFpsForCurrentFiles() {
        if (fileLeft) {
            containerFps.left = await extractMp4ContainerFpsFromFile(fileLeft);
        } else {
            containerFps.left = null;
        }
        if (fileRight) {
            containerFps.right = await extractMp4ContainerFpsFromFile(fileRight);
        } else {
            containerFps.right = null;
        }
        refreshMasterFrameSec();
        updatePanelInfoLine('left');
        updatePanelInfoLine('right');
        syncSeekMax();
        updateSeekUiFromVideos();
    }

