    // プレイヤー内 Time Code / Current Frame・Total Frame 焼き込みプレビュー（Export チェック連動・ドラッグ配置・左右同期）
    const BURN_IN_OVERLAY_KEYS = ['left', 'right', 'stack'];
    const BURN_IN_DEFAULT_TOP_PX = 10;
    const BURN_IN_SNAP_X_PX = 14;
    const BURN_IN_SNAP_Y_PX = 14;
    const BURN_IN_SCALE_MIN = 0.55;
    const BURN_IN_SCALE_MAX = 2.8;
    const BURN_IN_LETTER_SPACING_EM = 0.04;
    const LS_BURN_IN_POS_KEY = 'mp4_compare_burn_in_pos_v2';
    const LS_BURN_IN_POS_KEY_LEGACY = 'mp4_compare_burn_in_pos_v1';

    /** @type {{ xRatio: number|null, bottomRatio: number|null, snapX: boolean, snapY: boolean, scale: number }} */
    let burnInSharedPos = { xRatio: null, bottomRatio: null, snapX: false, snapY: false, scale: 1 };
    let burnInDragState = null;
    let burnInResizeState = null;
    const burnInBaseMetricsCache = { left: null, right: null, stack: null };

    function clampBurnInScale(scale) {
        const s = Number(scale);
        if (!Number.isFinite(s) || s <= 0) return 1;
        return Math.max(BURN_IN_SCALE_MIN, Math.min(BURN_IN_SCALE_MAX, s));
    }

    function getBurnInUserScale() {
        return clampBurnInScale(burnInSharedPos.scale != null ? burnInSharedPos.scale : 1);
    }

    function clearBurnInOverlayInlineSize(el) {
        if (!el) return;
        el.style.fontSize = '';
        el.style.padding = '';
        el.style.borderRadius = '';
    }

    function captureBurnInBaseMetricsForKey(key) {
        const el = getBurnInOverlayElement(key);
        if (!el) return null;
        clearBurnInOverlayInlineSize(el);
        const cs = getComputedStyle(el);
        const m = {
            fontSize: parseFloat(cs.fontSize) || 14,
            paddingTop: parseFloat(cs.paddingTop) || 4,
            paddingRight: parseFloat(cs.paddingRight) || 8,
            paddingBottom: parseFloat(cs.paddingBottom) || 4,
            paddingLeft: parseFloat(cs.paddingLeft) || 8,
            borderRadius: parseFloat(cs.borderRadius) || 6,
        };
        burnInBaseMetricsCache[key] = m;
        return m;
    }

    function burnInBaseMetricsForKey(key) {
        if (burnInBaseMetricsCache[key]) return burnInBaseMetricsCache[key];
        return captureBurnInBaseMetricsForKey(key);
    }

    function invalidateBurnInBaseMetricsCache() {
        burnInBaseMetricsCache.left = null;
        burnInBaseMetricsCache.right = null;
        burnInBaseMetricsCache.stack = null;
    }

    function applyBurnInOverlayAppearance(key) {
        const el = getBurnInOverlayElement(key);
        if (!el) return;
        const base = burnInBaseMetricsForKey(key);
        if (!base) return;
        const s = getBurnInUserScale();
        const fontPx = Math.max(10, Math.round(base.fontSize * s));
        el.style.fontSize = fontPx + 'px';
        el.style.padding = '';
        el.style.lineHeight = '1';
        const borderR = Math.max(2, Math.round(base.borderRadius * s));
        el.style.borderRadius = borderR + 'px';
        const textEl = el.querySelector('.video-timecode__text');
        if (textEl) {
            textEl.style.transform = '';
            textEl.style.lineHeight = '1';
        }
        const handle = el.querySelector('.video-timecode__resize-handle');
        if (handle) {
            const handlePx = Math.max(8, Math.round(10 * s));
            handle.style.width = handlePx + 'px';
            handle.style.height = handlePx + 'px';
            handle.style.borderRadius = '0 0 ' + borderR + 'px 0';
        }
    }

    /** プレビュー上の文字位置（枠左上基準・px） */
    function measureBurnInTextLayoutInBox(el) {
        const textEl = el && el.querySelector('.video-timecode__text');
        if (!el || !textEl || el.offsetHeight < 1) return null;
        const boxRect = el.getBoundingClientRect();
        const textRect = textEl.getBoundingClientRect();
        if (boxRect.height < 1) return null;
        return {
            textTop: textRect.top - boxRect.top,
            textLeft: textRect.left - boxRect.left,
            textHeight: textRect.height,
        };
    }

    function burnInCanvasFontString(fontPx) {
        return '700 ' + fontPx + 'px Consolas, Monaco, "Cascadia Mono", monospace';
    }

    function applyBurnInCanvasTextStyle(ctx, fontPx) {
        ctx.font = burnInCanvasFontString(fontPx);
        try {
            if ('letterSpacing' in ctx) ctx.letterSpacing = BURN_IN_LETTER_SPACING_EM + 'em';
        } catch (_) {}
    }

    function measureBurnInCanvasTextMetrics(ctx, text, fontPx) {
        ctx.save();
        applyBurnInCanvasTextStyle(ctx, fontPx);
        const tm = ctx.measureText(text);
        ctx.restore();
        return {
            width: tm.width,
            ascent: tm.actualBoundingBoxAscent > 0 ? tm.actualBoundingBoxAscent : fontPx * 0.8,
            descent: tm.actualBoundingBoxDescent > 0 ? tm.actualBoundingBoxDescent : fontPx * 0.2,
        };
    }

    function burnInOverlayKeyForElement(el) {
        for (let i = 0; i < BURN_IN_OVERLAY_KEYS.length; i++) {
            if (getBurnInOverlayElement(BURN_IN_OVERLAY_KEYS[i]) === el) return BURN_IN_OVERLAY_KEYS[i];
        }
        return null;
    }

    /** 書き出し直前にプレビュー文字列を同期し、枠サイズ測定を一致させる */
    function syncVisibleBurnInOverlayForExport(text) {
        const el = visibleBurnInOverlayElement();
        if (!el || !text) return;
        const parts = ensureBurnInOverlayStructure(el);
        if (parts.textEl && parts.textEl.textContent === text) return;
        setBurnInOverlayLabelText(el, text);
        const key = burnInOverlayKeyForElement(el);
        if (key) applyBurnInOverlayAppearance(key);
        void el.offsetHeight;
    }

    function applyBurnInOverlayAppearanceAll() {
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            applyBurnInOverlayAppearance(key);
        });
    }

    function ensureBurnInOverlayStructure(el) {
        if (!el) return { textEl: null, handle: null };
        let textEl = el.querySelector('.video-timecode__text');
        if (!textEl) {
            const initial = el.textContent;
            textEl = document.createElement('span');
            textEl.className = 'video-timecode__text';
            textEl.textContent = initial;
            el.textContent = '';
            el.appendChild(textEl);
        }
        let handle = el.querySelector('.video-timecode__resize-handle');
        if (!handle) {
            handle = document.createElement('div');
            handle.className = 'video-timecode__resize-handle';
            handle.setAttribute('aria-hidden', 'true');
            handle.title = 'ドラッグでラベルサイズ変更';
            el.appendChild(handle);
        }
        return { textEl: textEl, handle: handle };
    }

    function setBurnInOverlayLabelText(el, text) {
        const parts = ensureBurnInOverlayStructure(el);
        if (parts.textEl) parts.textEl.textContent = text;
    }

    function getBurnInOverlayElement(key) {
        if (key === 'left') return timecodeOverlayLeft;
        if (key === 'right') return timecodeOverlayRight;
        return timecodeOverlayStack;
    }

    function getBurnInOverlayFrame(el) {
        return el ? el.closest('.video-frame') : null;
    }

    function burnInTravelForFrame(frame, el) {
        const mw = el.offsetWidth;
        const mh = el.offsetHeight;
        const fw = frame.clientWidth;
        const fh = frame.clientHeight;
        return {
            maxLeft: Math.max(0, fw - mw),
            maxBottom: Math.max(0, fh - mh),
            mw,
            mh,
            fw,
            fh,
        };
    }

    function defaultBurnInRatios(maxLeft, maxBottom) {
        const bottom = Math.max(0, maxBottom - BURN_IN_DEFAULT_TOP_PX);
        return {
            xRatio: maxLeft > 0 ? 0.5 : 0,
            bottomRatio: maxBottom > 0 ? bottom / maxBottom : 1,
        };
    }

    function seedDefaultBurnInSharedPosFromVisible() {
        let seeded = false;
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            const el = getBurnInOverlayElement(key);
            const frame = getBurnInOverlayFrame(el);
            if (!el || !frame || el.classList.contains('video-timecode--hidden')) return;
            const { maxLeft, maxBottom } = burnInTravelForFrame(frame, el);
            const d = defaultBurnInRatios(maxLeft, maxBottom);
            burnInSharedPos.xRatio = d.xRatio;
            burnInSharedPos.bottomRatio = d.bottomRatio;
            seeded = true;
        });
        return seeded;
    }

    function tryApplyPendingDefaultBurnInPosition() {
        if (!burnInSharedPos._pendingDefaultSeed) return;
        if (!hasExportBurnOverlay()) return;
        if (!seedDefaultBurnInSharedPosFromVisible()) return;
        delete burnInSharedPos._pendingDefaultSeed;
        invalidateBurnInBaseMetricsCache();
        BURN_IN_OVERLAY_KEYS.forEach((key) => captureBurnInBaseMetricsForKey(key));
        applyBurnInOverlayAppearanceAll();
        applySharedBurnInOverlayPositions();
    }

    function ensureBurnInRatios(frame, el) {
        if (burnInSharedPos.xRatio == null || burnInSharedPos.bottomRatio == null) {
            const { maxLeft, maxBottom } = burnInTravelForFrame(frame, el);
            const d = defaultBurnInRatios(maxLeft, maxBottom);
            burnInSharedPos.xRatio = d.xRatio;
            burnInSharedPos.bottomRatio = d.bottomRatio;
            burnInSharedPos.snapX = true;
            burnInSharedPos.snapY = false;
        }
    }

    function applyBurnInDefaultPosition(opt) {
        const save = !!(opt && opt.save);
        burnInSharedPos.xRatio = null;
        burnInSharedPos.bottomRatio = null;
        burnInSharedPos.snapX = true;
        burnInSharedPos.snapY = false;
        burnInSharedPos.scale = 1;
        delete burnInSharedPos._legacyPixel;
        delete burnInSharedPos._pendingDefaultSeed;
        let seeded = seedDefaultBurnInSharedPosFromVisible();
        if (!seeded) burnInSharedPos._pendingDefaultSeed = true;
        invalidateBurnInBaseMetricsCache();
        BURN_IN_OVERLAY_KEYS.forEach((key) => captureBurnInBaseMetricsForKey(key));
        applyBurnInOverlayAppearanceAll();
        applySharedBurnInOverlayPositions();
        if (save && seeded) saveBurnInOverlayPositions();
    }

    function resetBurnInToDefaultPosition() {
        applyBurnInDefaultPosition({ save: true });
    }

    function burnInPixelPosFromRatios(maxLeft, maxBottom) {
        let xRatio = burnInSharedPos.xRatio;
        let bottomRatio = burnInSharedPos.bottomRatio;
        if (xRatio == null || bottomRatio == null) {
            const d = defaultBurnInRatios(maxLeft, maxBottom);
            xRatio = d.xRatio;
            bottomRatio = d.bottomRatio;
        }
        let left;
        if (burnInSharedPos.snapX) {
            left = Math.round(maxLeft / 2);
        } else {
            left = Math.round(Math.max(0, Math.min(1, xRatio)) * maxLeft);
        }
        let bottom;
        if (burnInSharedPos.snapY) {
            bottom = Math.round(maxBottom / 2);
        } else {
            bottom = Math.round(Math.max(0, Math.min(1, bottomRatio)) * maxBottom);
        }
        return {
            left: Math.max(0, Math.min(maxLeft, left)),
            bottom: Math.max(0, Math.min(maxBottom, bottom)),
        };
    }

    function pixelPosFromShared(frame, el) {
        const t = burnInTravelForFrame(frame, el);
        if (t.fw < 1 || t.fh < 1) return null;
        ensureBurnInRatios(frame, el);
        return burnInPixelPosFromRatios(t.maxLeft, t.maxBottom);
    }

    /** WebM 書き出し焼き込み用（プレイヤーと同じ比率・スナップ） */
    function computeBurnInPixelPosForExport(cw, ch, boxW, boxH) {
        const maxLeft = Math.max(0, cw - boxW);
        const maxBottom = Math.max(0, ch - boxH);
        return burnInPixelPosFromRatios(maxLeft, maxBottom);
    }

    function visibleBurnInOverlayElement() {
        for (let i = 0; i < BURN_IN_OVERLAY_KEYS.length; i++) {
            const el = getBurnInOverlayElement(BURN_IN_OVERLAY_KEYS[i]);
            if (el && !el.classList.contains('video-timecode--hidden')) return el;
        }
        return null;
    }

    /**
     * プレビュー上のオーバレイと同じ見た目になるよう、書き出しキャンバス解像度へスケールした描画メトリクス
     * @param {number} cw
     * @param {number} ch
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     */
    function getBurnInDrawMetricsForExport(cw, ch, ctx, text) {
        syncVisibleBurnInOverlayForExport(text);
        const el = visibleBurnInOverlayElement();
        let fontPx;
        let padL;
        let padR;
        let padT;
        let padB;
        let borderRadius = 6;
        let layoutScale = 1;
        if (el) {
            const cs = getComputedStyle(el);
            const frame = getBurnInOverlayFrame(el);
            const fh = frame && frame.clientHeight > 0 ? frame.clientHeight : ch;
            layoutScale = ch / fh;
            fontPx = parseFloat(cs.fontSize) * layoutScale;
            padL = parseFloat(cs.paddingLeft) * layoutScale;
            padR = parseFloat(cs.paddingRight) * layoutScale;
            padT = parseFloat(cs.paddingTop) * layoutScale;
            padB = parseFloat(cs.paddingBottom) * layoutScale;
            borderRadius = parseFloat(cs.borderRadius) * layoutScale;
        } else {
            layoutScale = (ch / 440) * getBurnInUserScale();
            fontPx = 14 * layoutScale;
            padL = 8 * layoutScale;
            padR = 8 * layoutScale;
            padT = 4 * layoutScale;
            padB = 4 * layoutScale;
            borderRadius = 6 * layoutScale;
        }
        fontPx = Math.max(10, Math.round(fontPx));
        padL = Math.max(2, Math.round(padL));
        padR = Math.max(2, Math.round(padR));
        padT = Math.max(2, Math.round(padT));
        padB = Math.max(2, Math.round(padB));
        borderRadius = Math.max(2, Math.round(borderRadius));

        const tm = measureBurnInCanvasTextMetrics(ctx, text, fontPx);
        const textW = Math.ceil(tm.width);
        const textH = Math.ceil(tm.ascent + tm.descent);
        const minBoxW = textW + padL + padR;
        const minBoxH = textH + padT + padB;

        let boxW = minBoxW;
        let boxH = minBoxH;
        let textCenterY = padT + (minBoxH - padT - padB) / 2;
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
            boxW = Math.max(Math.ceil(el.offsetWidth * layoutScale), minBoxW);
            boxH = Math.max(Math.ceil(el.offsetHeight * layoutScale), minBoxH);
            const layout = measureBurnInTextLayoutInBox(el);
            if (layout && layout.textHeight > 0) {
                textCenterY = (layout.textTop + layout.textHeight / 2) * layoutScale;
            } else {
                textCenterY = padT + (boxH - padT - padB) / 2;
            }
        }

        return {
            fontPx: fontPx,
            padL: padL,
            padR: padR,
            padT: padT,
            padB: padB,
            borderRadius: borderRadius,
            boxW: boxW,
            boxH: boxH,
            textX: padL,
            textCenterY: textCenterY,
        };
    }

    function setBurnInOverlaySnapClasses(el, snapX, snapY) {
        if (!el) return;
        const drag = !!burnInDragState;
        el.classList.toggle('video-timecode--snap-x', drag && !!snapX);
        el.classList.toggle('video-timecode--snap-y', drag && !!snapY);
    }

    function refreshBurnInSnapVisuals() {
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            const el = getBurnInOverlayElement(key);
            if (!el || el.classList.contains('video-timecode--hidden')) return;
            setBurnInOverlaySnapClasses(el, burnInSharedPos.snapX, burnInSharedPos.snapY);
        });
    }

    function ensureBurnInCenterGuides(frame) {
        if (!frame) return;
        let guideV = frame.querySelector('.burn-in-center-guide--v');
        if (!guideV) {
            guideV = document.createElement('div');
            guideV.className = 'burn-in-center-guide burn-in-center-guide--v';
            guideV.setAttribute('aria-hidden', 'true');
            frame.appendChild(guideV);
        }
        let guideH = frame.querySelector('.burn-in-center-guide--h');
        if (!guideH) {
            guideH = document.createElement('div');
            guideH.className = 'burn-in-center-guide burn-in-center-guide--h';
            guideH.setAttribute('aria-hidden', 'true');
            frame.appendChild(guideH);
        }
    }

    function updateBurnInCenterGuides() {
        const frames = [frameLeft, frameRight, frameStack];
        frames.forEach((frame) => {
            if (frame) {
                frame.classList.remove('video-frame--burn-snap-x', 'video-frame--burn-snap-y');
            }
        });
        if (!burnInDragState || !hasExportBurnOverlay()) return;
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            const el = getBurnInOverlayElement(key);
            const frame = getBurnInOverlayFrame(el);
            if (!el || !frame || el.classList.contains('video-timecode--hidden')) return;
            ensureBurnInCenterGuides(frame);
            if (burnInSharedPos.snapX) frame.classList.add('video-frame--burn-snap-x');
            if (burnInSharedPos.snapY) frame.classList.add('video-frame--burn-snap-y');
        });
    }

    function applyBurnInOverlayPosition(key) {
        const el = getBurnInOverlayElement(key);
        const frame = getBurnInOverlayFrame(el);
        if (!el || !frame || !burnInSharedPos) return;
        applyBurnInOverlayAppearance(key);
        const pos = pixelPosFromShared(frame, el);
        if (!pos) return;
        el.style.left = pos.left + 'px';
        el.style.bottom = pos.bottom + 'px';
        el.style.top = 'auto';
        el.style.right = 'auto';
        el.style.visibility = 'visible';
        setBurnInOverlaySnapClasses(el, burnInSharedPos.snapX, burnInSharedPos.snapY);
    }

    function applySharedBurnInOverlayPositions() {
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            const el = getBurnInOverlayElement(key);
            if (!el || el.classList.contains('video-timecode--hidden')) return;
            applyBurnInOverlayPosition(key);
        });
        updateBurnInCenterGuides();
    }

    function updateSharedPosFromPixels(frame, el, left, bottom, snapX, snapY) {
        const t = burnInTravelForFrame(frame, el);
        burnInSharedPos.xRatio = t.maxLeft > 0 ? left / t.maxLeft : 0;
        burnInSharedPos.bottomRatio = t.maxBottom > 0 ? bottom / t.maxBottom : 0;
        burnInSharedPos.snapX = !!snapX;
        burnInSharedPos.snapY = !!snapY;
        applySharedBurnInOverlayPositions();
    }

    function loadBurnInOverlayPositions() {
        burnInSharedPos = {
            xRatio: null,
            bottomRatio: null,
            snapX: true,
            snapY: false,
            scale: 1,
            _pendingDefaultSeed: true,
        };
        try {
            let raw = localStorage.getItem(LS_BURN_IN_POS_KEY);
            if (!raw) {
                raw = localStorage.getItem(LS_BURN_IN_POS_KEY_LEGACY);
                if (raw) {
                    const legacy = JSON.parse(raw);
                    const item = legacy && (legacy.left || legacy.right || legacy.stack);
                    if (item && typeof item === 'object') {
                        const left = Number(item.left);
                        const bottom = Number(item.bottom);
                        if (Number.isFinite(left) && Number.isFinite(bottom)) {
                            burnInSharedPos = {
                                xRatio: null,
                                bottomRatio: null,
                                snapX: false,
                                snapY: false,
                                scale: 1,
                                _legacyPixel: { left, bottom },
                            };
                        }
                    }
                }
                return;
            }
            const p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return;
            const xRatio = Number(p.xRatio);
            const bottomRatio = Number(p.bottomRatio);
            if (Number.isFinite(xRatio) && Number.isFinite(bottomRatio)) {
                delete burnInSharedPos._pendingDefaultSeed;
                burnInSharedPos.xRatio = Math.max(0, Math.min(1, xRatio));
                burnInSharedPos.bottomRatio = Math.max(0, Math.min(1, bottomRatio));
                burnInSharedPos.snapX = !!p.snapX;
                burnInSharedPos.snapY = !!p.snapY;
                if (Number.isFinite(Number(p.scale))) {
                    burnInSharedPos.scale = clampBurnInScale(p.scale);
                }
            }
        } catch (_) {}
    }

    function saveBurnInOverlayPositions() {
        try {
            localStorage.setItem(
                LS_BURN_IN_POS_KEY,
                JSON.stringify({
                    xRatio: burnInSharedPos.xRatio,
                    bottomRatio: burnInSharedPos.bottomRatio,
                    snapX: burnInSharedPos.snapX,
                    snapY: burnInSharedPos.snapY,
                    scale: getBurnInUserScale(),
                })
            );
        } catch (_) {}
    }

    function applyLegacyPixelDefaultIfNeeded(frame, el) {
        if (!burnInSharedPos._legacyPixel) return;
        const t = burnInTravelForFrame(frame, el);
        const lp = burnInSharedPos._legacyPixel;
        burnInSharedPos.xRatio = t.maxLeft > 0 ? lp.left / t.maxLeft : 0;
        burnInSharedPos.bottomRatio = t.maxBottom > 0 ? lp.bottom / t.maxBottom : 0;
        delete burnInSharedPos._legacyPixel;
    }

    function updateOnePlayerBurnInOverlay(key, show) {
        const el = getBurnInOverlayElement(key);
        if (!el) return;
        el.classList.toggle('video-timecode--hidden', !show);
        el.classList.toggle('video-timecode--draggable', show);
        el.classList.toggle('video-timecode--idle', false);
        if (!show) {
            setBurnInOverlaySnapClasses(el, false, false);
            updateBurnInCenterGuides();
            return;
        }
        const frame = getBurnInOverlayFrame(el);
        if (frame) applyLegacyPixelDefaultIfNeeded(frame, el);
        burnInBaseMetricsCache[key] = null;
        captureBurnInBaseMetricsForKey(key);
        setBurnInOverlayLabelText(el, buildBurnInLabelForPlayer(key));
        applyBurnInOverlayPosition(key);
        tryApplyPendingDefaultBurnInPosition();
        updateBurnInCenterGuides();
    }

    function updatePlayerBurnInOverlays() {
        const stackMode = isStackViewMode(getViewMode());
        const burnOn = hasExportBurnOverlay();
        const dL = getDuration(videoLeft);
        const dR = getDuration(videoRight);
        updateOnePlayerBurnInOverlay('left', !stackMode && dL > 0 && burnOn);
        updateOnePlayerBurnInOverlay('right', !stackMode && dR > 0 && burnOn);
        updateOnePlayerBurnInOverlay('stack', stackMode && bothReady() && burnOn);
        tryApplyPendingDefaultBurnInPosition();
        updateBurnInCenterGuides();
    }

    function onBurnInOverlayPointerDown(key, ev) {
        if (pipExportActive || !hasExportBurnOverlay() || ev.button !== 0) return;
        if (ev.target && ev.target.closest && ev.target.closest('.video-timecode__resize-handle')) return;
        const el = getBurnInOverlayElement(key);
        const frame = getBurnInOverlayFrame(el);
        if (!el || !frame || el.classList.contains('video-timecode--hidden')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const er = el.getBoundingClientRect();
        burnInDragState = {
            key: key,
            pointerId: ev.pointerId,
            frame: frame,
            el: el,
            grabOffsetX: ev.clientX - er.left,
            grabOffsetY: ev.clientY - er.top,
        };
        el.classList.add('video-timecode--dragging');
        BURN_IN_OVERLAY_KEYS.forEach((k) => {
            const o = getBurnInOverlayElement(k);
            if (o && !o.classList.contains('video-timecode--hidden')) {
                o.classList.add('video-timecode--dragging');
            }
        });
        try {
            el.setPointerCapture(ev.pointerId);
        } catch (_) {}
    }

    function onBurnInOverlayPointerMove(ev) {
        if (!burnInDragState || ev.pointerId !== burnInDragState.pointerId) return;
        const st = burnInDragState;
        const fr = st.frame.getBoundingClientRect();
        const el = st.el;
        const t = burnInTravelForFrame(st.frame, el);
        let left = ev.clientX - fr.left - st.grabOffsetX;
        let top = ev.clientY - fr.top - st.grabOffsetY;
        left = Math.max(0, Math.min(t.maxLeft, left));
        top = Math.max(0, Math.min(t.maxBottom, top));
        let bottom = t.fh - top - t.mh;

        const overlayCenterX = fr.left + left + t.mw / 2;
        const frameCenterX = fr.left + fr.width / 2;
        const snapX = Math.abs(overlayCenterX - frameCenterX) <= BURN_IN_SNAP_X_PX;
        if (snapX) {
            left = Math.round(t.maxLeft / 2);
        }

        const overlayCenterY = fr.top + top + t.mh / 2;
        const frameCenterY = fr.top + fr.height / 2;
        const snapY = Math.abs(overlayCenterY - frameCenterY) <= BURN_IN_SNAP_Y_PX;
        if (snapY) {
            bottom = Math.round(t.maxBottom / 2);
        }
        updateSharedPosFromPixels(st.frame, el, left, bottom, snapX, snapY);
    }

    function onBurnInOverlayPointerUp(ev) {
        if (!burnInDragState || ev.pointerId !== burnInDragState.pointerId) return;
        const st = burnInDragState;
        burnInDragState = null;
        BURN_IN_OVERLAY_KEYS.forEach((k) => {
            const o = getBurnInOverlayElement(k);
            if (o) o.classList.remove('video-timecode--dragging');
        });
        try {
            st.el.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        updateBurnInCenterGuides();
        refreshBurnInSnapVisuals();
        saveBurnInOverlayPositions();
    }

    function onBurnInResizePointerDown(key, ev) {
        if (pipExportActive || !hasExportBurnOverlay() || ev.button !== 0) return;
        const el = getBurnInOverlayElement(key);
        const frame = getBurnInOverlayFrame(el);
        if (!el || !frame || el.classList.contains('video-timecode--hidden')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const er = el.getBoundingClientRect();
        const anchorX = er.left;
        const anchorY = er.bottom;
        const startDist = Math.max(12, Math.hypot(ev.clientX - anchorX, ev.clientY - anchorY));
        burnInResizeState = {
            key: key,
            pointerId: ev.pointerId,
            frame: frame,
            el: el,
            anchorX: anchorX,
            anchorY: anchorY,
            startDist: startDist,
            startScale: getBurnInUserScale(),
        };
        el.classList.add('video-timecode--resizing');
        BURN_IN_OVERLAY_KEYS.forEach((k) => {
            const o = getBurnInOverlayElement(k);
            if (o && !o.classList.contains('video-timecode--hidden')) {
                o.classList.add('video-timecode--resizing');
            }
        });
        try {
            ev.target.setPointerCapture(ev.pointerId);
        } catch (_) {}
    }

    function onBurnInResizePointerMove(ev) {
        if (!burnInResizeState || ev.pointerId !== burnInResizeState.pointerId) return;
        const st = burnInResizeState;
        const dist = Math.max(12, Math.hypot(ev.clientX - st.anchorX, ev.clientY - st.anchorY));
        burnInSharedPos.scale = clampBurnInScale(st.startScale * (dist / st.startDist));
        applyBurnInOverlayAppearanceAll();
        applySharedBurnInOverlayPositions();
        void el.offsetHeight;
    }

    function onBurnInResizePointerUp(ev) {
        if (!burnInResizeState || ev.pointerId !== burnInResizeState.pointerId) return;
        const st = burnInResizeState;
        burnInResizeState = null;
        BURN_IN_OVERLAY_KEYS.forEach((k) => {
            const o = getBurnInOverlayElement(k);
            if (o) o.classList.remove('video-timecode--resizing');
        });
        try {
            ev.target.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        saveBurnInOverlayPositions();
    }

    function setupBurnInOverlayDrag(key) {
        const el = getBurnInOverlayElement(key);
        if (!el) return;
        el.title =
            'ドラッグで移動・右下の三角でサイズ変更（左右同期・縦横中心でスナップ）・ダブルクリックで横中央・下寄せ（約10px）・標準サイズへ';
        const parts = ensureBurnInOverlayStructure(el);
        el.addEventListener('pointerdown', (ev) => onBurnInOverlayPointerDown(key, ev));
        el.addEventListener('pointermove', onBurnInOverlayPointerMove);
        el.addEventListener('pointerup', onBurnInOverlayPointerUp);
        el.addEventListener('pointercancel', onBurnInOverlayPointerUp);
        el.addEventListener('dblclick', (ev) => {
            if (pipExportActive || !hasExportBurnOverlay()) return;
            if (el.classList.contains('video-timecode--hidden')) return;
            ev.preventDefault();
            ev.stopPropagation();
            resetBurnInToDefaultPosition();
            invalidateBurnInBaseMetricsCache();
            applyBurnInOverlayAppearanceAll();
        });
        const handle = parts.handle;
        if (handle) {
            handle.addEventListener('pointerdown', (ev) => onBurnInResizePointerDown(key, ev));
            handle.addEventListener('pointermove', onBurnInResizePointerMove);
            handle.addEventListener('pointerup', onBurnInResizePointerUp);
            handle.addEventListener('pointercancel', onBurnInResizePointerUp);
        }
    }

    function initPlayerBurnInOverlays() {
        loadBurnInOverlayPositions();
        [frameLeft, frameRight, frameStack].forEach((frame) => ensureBurnInCenterGuides(frame));
        BURN_IN_OVERLAY_KEYS.forEach((key) => {
            captureBurnInBaseMetricsForKey(key);
            setupBurnInOverlayDrag(key);
        });
        applyBurnInOverlayAppearanceAll();
        applySharedBurnInOverlayPositions();
        updatePlayerBurnInOverlays();
        window.addEventListener('resize', () => {
            invalidateBurnInBaseMetricsCache();
            BURN_IN_OVERLAY_KEYS.forEach((key) => captureBurnInBaseMetricsForKey(key));
            applyBurnInOverlayAppearanceAll();
            applySharedBurnInOverlayPositions();
        });
    }
