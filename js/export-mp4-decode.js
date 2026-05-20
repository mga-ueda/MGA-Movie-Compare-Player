    // MP4Box + WebCodecs によるオフライン書き出し用シーケンシャル映像デコード
    // 現状 MP4Box 準備が環境によってメインスレッドで止まるため、既定は video seek を使用
    const EXPORT_MP4_WEBCODECS_DECODE_ENABLED = false;
    const EXPORT_MP4_MOOV_HEAD_BYTES = 16 * 1024 * 1024;
    const EXPORT_MP4_MOOV_TAIL_BYTES = 32 * 1024 * 1024;
    const EXPORT_MP4_MOOV_READY_TIMEOUT_MS = 12000;
    const EXPORT_MP4_FEED_CHUNK_BYTES = 4 * 1024 * 1024;
    const EXPORT_MP4_BOOTSTRAP_TIMEOUT_MS = 12000;

    function isExportMp4WebCodecsDecodeAvailable() {
        return (
            EXPORT_MP4_WEBCODECS_DECODE_ENABLED &&
            typeof MP4Box !== 'undefined' &&
            typeof VideoDecoder !== 'undefined' &&
            typeof VideoFrame !== 'undefined' &&
            typeof EncodedVideoChunk !== 'undefined'
        );
    }

    function exportMp4AppendBuffer(mp4, arrayBuffer, fileStart) {
        const buf = arrayBuffer;
        buf.fileStart = fileStart;
        mp4.appendBuffer(buf);
    }

    function waitExportMp4Ms(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** moov 検出用に先頭＋末尾だけ先に読む（末尾 moov で全ファイル読み込み待ちを避ける） */
    async function feedMp4MoovBootstrap(mp4, file) {
        const n = file.size;
        if (n < 16) return;
        const headLen = Math.min(EXPORT_MP4_MOOV_HEAD_BYTES, n);
        const head = await file.slice(0, headLen).arrayBuffer();
        exportMp4AppendBuffer(mp4, head, 0);
        if (n > headLen) {
            const tailLen = Math.min(EXPORT_MP4_MOOV_TAIL_BYTES, n);
            const tailStart = Math.max(headLen, n - tailLen);
            if (tailStart < n) {
                const tail = await file.slice(tailStart, n).arrayBuffer();
                exportMp4AppendBuffer(mp4, tail, tailStart);
            }
        }
    }

    /** サンプル抽出用に残りをバックグラウンドで追加 */
    function feedMp4RemainingInBackground(mp4, file, fedRanges) {
        const n = file.size;
        let offset = 0;
        const pump = async () => {
            while (offset < n) {
                const end = Math.min(n, offset + EXPORT_MP4_FEED_CHUNK_BYTES);
                let skip = false;
                for (let i = 0; i < fedRanges.length; i++) {
                    const r = fedRanges[i];
                    if (offset >= r.start && end <= r.end) {
                        skip = true;
                        break;
                    }
                }
                if (!skip) {
                    try {
                        const ab = await file.slice(offset, end).arrayBuffer();
                        exportMp4AppendBuffer(mp4, ab, offset);
                    } catch (_) {
                        break;
                    }
                }
                offset = end;
                if (offset % (EXPORT_MP4_FEED_CHUNK_BYTES * 4) === 0) {
                    await waitExportMp4Ms(0);
                }
            }
            try {
                mp4.flush();
            } catch (_) {}
        };
        pump();
    }

    function exportSampleTimestampUs(sample, trackTimescale) {
        const ts = sample.cts != null ? sample.cts : sample.dts;
        const scale = sample.timescale || trackTimescale || 1;
        return Math.round((ts * 1_000_000) / scale);
    }

    function exportSampleDurationUs(sample, trackTimescale) {
        const scale = sample.timescale || trackTimescale || 1;
        const dur = sample.duration > 0 ? sample.duration : 1;
        return Math.max(1, Math.round((dur * 1_000_000) / scale));
    }

    function waitForMp4Ready(mp4, timeoutMs) {
        return new Promise((resolve, reject) => {
            let done = false;
            const finish = (fn, arg) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                fn(arg);
            };
            const timer = setTimeout(() => finish(reject, new Error('MP4 moov ready timeout')), timeoutMs);
            mp4.onReady = (info) => finish(resolve, info);
            mp4.onError = () => finish(reject, new Error('MP4 parse error'));
        });
    }

    /**
     * @param {File} file
     * @param {number} exportFps
     * @returns {Promise<object|null>}
     */
    async function createExportMp4VideoSource(file, exportFps) {
        if (!isExportMp4WebCodecsDecodeAvailable() || !file) return null;
        const fps = Math.max(1, exportFps | 0);

        let info;
        const mp4 = MP4Box.createFile();
        try {
            const readyP = waitForMp4Ready(mp4, EXPORT_MP4_MOOV_READY_TIMEOUT_MS);
            await Promise.race([
                feedMp4MoovBootstrap(mp4, file),
                waitExportMp4Ms(EXPORT_MP4_BOOTSTRAP_TIMEOUT_MS).then(() => {
                    throw new Error('MP4 bootstrap timeout');
                }),
            ]);
            info = await readyP;
        } catch (_) {
            try {
                mp4.stop();
            } catch (_) {}
            return null;
        }

        const tracks = info && info.videoTracks;
        if (!tracks || !tracks.length) {
            try {
                mp4.stop();
            } catch (_) {}
            return null;
        }

        const track = tracks[0];
        const trackId = track.id;
        const trackTimescale = track.timescale || 1;
        const trackDurationTicks = track.duration | 0;
        const nbSamples = track.nb_samples | 0;
        const trackWidth = track.track_width | 0;
        const trackHeight = track.track_height | 0;
        const codecStr = track.codec || '';
        let codecDescription = null;
        if (track.description && track.description.byteLength > 0) {
            codecDescription = track.description;
        }

        if (!codecStr || nbSamples <= 0 || trackWidth < 2 || trackHeight < 2) {
            try {
                mp4.stop();
            } catch (_) {}
            return null;
        }

        let decoder = null;
        const tryConfigure = (codec, description) => {
            const dec = new VideoDecoder({
                output: (frame) => {
                    closeLatestFrame();
                    latestFrame = frame;
                    latestFrameUs = frame.timestamp;
                    if (pendingDecodeResolve) {
                        const done = pendingDecodeResolve;
                        pendingDecodeResolve = null;
                        done();
                    }
                },
                error: () => {},
            });
            const cfg = { codec: codec, optimizeForLatency: true };
            if (description && description.byteLength > 0) {
                cfg.description = description;
            }
            try {
                dec.configure(cfg);
                decoder = dec;
                return true;
            } catch (_) {
                try {
                    if (dec.state !== 'closed') dec.close();
                } catch (_) {}
                return false;
            }
        };

        let latestFrame = null;
        let latestFrameUs = -1;
        let pendingDecodeResolve = null;
        let closed = false;
        let sampleQueue = [];
        let extractionDone = false;
        let decodedSampleNumber = 0;
        let decodeChain = Promise.resolve();
        let samplesExtractionStarted = false;

        function closeLatestFrame() {
            if (!latestFrame) return;
            try {
                latestFrame.close();
            } catch (_) {}
            latestFrame = null;
            latestFrameUs = -1;
        }

        const configured =
            tryConfigure(codecStr, codecDescription) ||
            (codecStr.indexOf('avc1') === 0 && tryConfigure('avc1.42E01E', codecDescription)) ||
            (codecStr.indexOf('hvc1') === 0 && tryConfigure(codecStr, codecDescription));

        if (!configured || !decoder) {
            try {
                mp4.stop();
            } catch (_) {}
            return null;
        }

        const headLen = Math.min(EXPORT_MP4_MOOV_HEAD_BYTES, file.size);
        const tailLen = Math.min(EXPORT_MP4_MOOV_TAIL_BYTES, file.size);
        const tailStart = Math.max(headLen, file.size - tailLen);
        const fedRanges = [
            { start: 0, end: headLen },
            { start: tailStart, end: file.size },
        ];

        mp4.onSamples = function (_id, _user, samples) {
            for (let i = 0; i < samples.length; i++) {
                sampleQueue.push(samples[i]);
                if (samples[i].number >= nbSamples) extractionDone = true;
            }
        };

        function startSampleExtraction() {
            if (samplesExtractionStarted) return;
            samplesExtractionStarted = true;
            try {
                mp4.setExtractionOptions(trackId, null, { nbSamples: 64 });
                mp4.start();
            } catch (_) {}
        }

        function exportIndexToTargetUs(n) {
            return Math.round((n * 1_000_000) / fps);
        }

        function exportIndexToSampleNumber(n) {
            if (nbSamples <= 0) return 1;
            const tSec = n / fps;
            const tTick = Math.round(tSec * trackTimescale);
            if (trackDurationTicks > 0) {
                const idx = Math.floor((tTick * nbSamples) / trackDurationTicks);
                return Math.max(1, Math.min(nbSamples, idx + 1));
            }
            return Math.max(1, Math.min(nbSamples, n + 1));
        }

        function decodeOneSample(sample) {
            return new Promise((resolve) => {
                if (!decoder || closed) {
                    resolve();
                    return;
                }
                let sampleSettled = false;
                const timeout = setTimeout(() => {
                    if (sampleSettled) return;
                    sampleSettled = true;
                    pendingDecodeResolve = null;
                    resolve();
                }, 15000);

                pendingDecodeResolve = () => {
                    if (sampleSettled) return;
                    sampleSettled = true;
                    clearTimeout(timeout);
                    decodedSampleNumber = sample.number | 0;
                    resolve();
                };

                try {
                    const tsUs = exportSampleTimestampUs(sample, trackTimescale);
                    const durUs = exportSampleDurationUs(sample, trackTimescale);
                    const chunk = new EncodedVideoChunk({
                        type: sample.is_sync ? 'key' : 'delta',
                        timestamp: tsUs,
                        duration: durUs,
                        data: sample.data,
                    });
                    decoder.decode(chunk);
                } catch (_) {
                    clearTimeout(timeout);
                    sampleSettled = true;
                    pendingDecodeResolve = null;
                    resolve();
                }
            });
        }

        function queueDecodeSample(sample) {
            decodeChain = decodeChain
                .then(() => decodeOneSample(sample))
                .catch(() => {});
            return decodeChain;
        }

        let waitSamplesSpins = 0;

        function ensureExtractionStarted() {
            if (samplesExtractionStarted) return;
            feedMp4RemainingInBackground(mp4, file, fedRanges);
            startSampleExtraction();
        }

        return {
            width: trackWidth,
            height: trackHeight,
            exportFps: fps,
            async getVideoFrameForExportIndex(n) {
                if (closed || !decoder) return null;
                ensureExtractionStarted();
                const targetSample = exportIndexToSampleNumber(n);
                const targetUs = exportIndexToTargetUs(n);
                waitSamplesSpins = 0;

                while (decodedSampleNumber < targetSample) {
                    if (extractionDone && sampleQueue.length === 0) break;
                    if (sampleQueue.length === 0) {
                        waitSamplesSpins++;
                        if (waitSamplesSpins > 300000) break;
                        await waitExportMp4Ms(5);
                        continue;
                    }
                    const sample = sampleQueue.shift();
                    await queueDecodeSample(sample);
                    if (latestFrame && latestFrameUs >= targetUs) break;
                    if (decodedSampleNumber >= targetSample && latestFrame) break;
                }

                if (!latestFrame) return null;
                try {
                    return latestFrame.clone();
                } catch (_) {
                    return null;
                }
            },
            close() {
                closed = true;
                closeLatestFrame();
                try {
                    if (decoder && decoder.state !== 'closed') decoder.close();
                } catch (_) {}
                decoder = null;
                sampleQueue = [];
                try {
                    mp4.stop();
                } catch (_) {}
            },
        };
    }

    async function createExportMp4VideoSourceWithTimeout(file, exportFps, label, timeoutMs) {
        return Promise.race([
            createExportMp4VideoSource(file, exportFps),
            new Promise((resolve) => {
                setTimeout(() => resolve(null), timeoutMs);
            }),
        ]).then((src) => {
            if (!src && label) {
                writeLog('Export offline: MP4 decode prep skipped (' + label + ').');
            }
            return src;
        });
    }
