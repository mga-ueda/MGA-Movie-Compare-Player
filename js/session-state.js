    // === 3. 再生セッション状態・保存用定数・Web Audio 準備
    let urlLeft = null;
    let urlRight = null;
    let fileLeft = null;
    let fileRight = null;
    let isSeeking = false;
    let dragHoverDepth = 0;
    let lastArrowSeekLogAt = 0;
    let lastSeekBarInputLogAt = 0;
    let lastSeekFlashScrubAt = 0;
    let rafId = 0;
    let audioCtx = null;
    let webAudioWired = false;
    let mediaSrcL = null;
    let mediaSrcR = null;

    /** 再生中のズレが大きいとき、遅れ側を 1 フレームだけ進める自動補正 */
    let lastDriftFixAt = 0;
    let lastDriftFixLogAt = 0;
    const DRIFT_AUTO_FIX_MS = 100;
    const DRIFT_FIX_COOLDOWN_MS = 170;

    /** PiP WebM 書き出し中は ended ループ等を抑止し、トランスポートをロックする */
    let pipExportActive = false;
    let pipExportRaf = 0;
    let pipExportUserCancel = false;
    let currentExportRecorder = null;
    let pipExportEmergencyCleanup = null;

    const LS_PREFS_KEY = 'mp4_compare_prefs_v1';
    const IDB_NAME = 'mp4_compare_session_v1';
    const IDB_STORE = 'kv';
    const IDB_KEY_LAST = 'lastSession';
    const IDB_VER = 1;

    let pendingRestoreTime = null;
    let persistSessionTimer = null;

    /** 同一ペアへの自動再生を一度だけ試すラッチ（失敗時は解除して再試行可） */
    let autoPlayLatch = false;
    let autoPlayGestureRetryArmed = false;
    let sessionRestoreListenersArmed = false;
    let transportPlayInFlight = null;
    /** ドロップ／ファイル選択で両方がそろう直前に立てる（リロード復元では立てない） */
    let autoPlayAfterUserLoad = false;

    /** MP4 コンテナ（moov / stts 等）から得た平均 FPS。null は未解析 */
    const containerFps = { left: null, right: null };

    function isTypingTarget(el) {
        if (!el || !el.nodeName) return false;
        const n = el.nodeName;
        if (n === 'TEXTAREA' || n === 'SELECT') return true;
        if (n === 'INPUT') {
            const t = (el.type || '').toLowerCase();
            if (t === 'range') return false;
            return true;
        }
        return el.isContentEditable === true;
    }

    /** タイムコードのフォールバック FPS（測定前の換算・総フレーム表示にも使用） */
    const DISPLAY_FPS = 60;
    /** マスター再生軸の 1 フレーム秒（左右の表示 FPS の大きい方） */
    let masterFrameSec = 1 / DISPLAY_FPS;

