/*
     * MGA Movie Compare Player — 複数ファイル構成（ビルド不要）。index.html 末尾の script 順で同一グローバルスコープに連結。
     * バージョン表示: js/version.js（APP_VERSION / APP_CHANGELOG）→ js/apply-version.js
     *
     * 読み順: dom-refs.js（本ファイルの DOM 参照）→ ui-helpers.js → … → events-boot.js（index.html の script タグ順）。
     * 各ファイル先頭の「// === …」区切りはブロック目印（エディタで === を検索）。
     *
     * 改造ポイント（挙動を変えやすい順の目安）:
     *   - ブラウザ内保存: LS_PREFS_KEY + writePrefs/readPrefs（localStorage） / IDB_NAME, IDB_VER, IDB_STORE, IDB_KEY_LAST + persistSessionToStorage（IndexedDB）
     *   - 映像レイアウト: VIEW_MODE_VALUES, applyViewMode, compare-stage 周辺の HTML/CSS
     *   - ループ / 自動再生: loopPlaybackCheckbox, autoPlayCheckbox, onVideoEnded, requestAutoPlay
     *   - シーク・同期: DISPLAY_FPS, DRIFT_* 定数, maybeAutoSyncDriftOneFrame, masterDuration
     *   - 音声: getAudioMode, buildAudioGraph(mode, outputNode), restorePlaybackAudioRouting, ensureWebAudioRouting, input[name="audioMode"]（split-mono / old-stereo / new-stereo / mute）
     *   - WebM 書き出し: pipExportCanvas, captureStream, pickWebMRecorderMimeType(withAudio), MediaRecorder, runSilentWebmExport, pipExportActive, exportBlockingOverlay / exportBlockingSub, exportBlockingEscHint, soloTcNoticeOverlay, tryCancelSilentWebmExportFromEsc, currentExportRecorder, buildAudioGraph の MediaStreamDestination 切替
     *   - 対応拡張子: #filePicker の accept と VIDEO_FILE_EXT / mimeTypeHintForVideoFileName
     */
    const dropZone = document.getElementById('main-drop-zone');
    const filePicker = document.getElementById('filePicker');
    const videoLeft = document.getElementById('videoLeft');
    const videoRight = document.getElementById('videoRight');
    const panelLeft = document.getElementById('panelLeft');
    const panelRight = document.getElementById('panelRight');
    const nameLeft = document.getElementById('nameLeft');
    const nameRight = document.getElementById('nameRight');
    const infoLeft = document.getElementById('infoLeft');
    const infoRight = document.getElementById('infoRight');
    const seekBar = document.getElementById('seekBar');
    const seekBarWrap = document.getElementById('seekBarWrap');
    const playStopBtn = document.getElementById('playStopBtn');
    const loopPlaybackCheckbox = document.getElementById('loopPlaybackCheckbox');
    const autoPlayCheckbox = document.getElementById('autoPlayCheckbox');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const driftRow = document.getElementById('driftRow');
    const driftMs = document.getElementById('driftMs');
    const driftFrames = document.getElementById('driftFrames');
    const timecodeOverlayLeft = document.getElementById('timecodeOverlayLeft');
    const timecodeOverlayRight = document.getElementById('timecodeOverlayRight');
    const logEl = document.getElementById('log');
    const compareStage = document.getElementById('compareStage');
    const compareGrid = document.getElementById('compareGrid');
    const compareComposite = document.getElementById('compareComposite');
    const frameLeft = document.getElementById('frameLeft');
    const frameRight = document.getElementById('frameRight');
    const frameStack = document.getElementById('frameStack');
    const timecodeOverlayStack = document.getElementById('timecodeOverlayStack');
    const viewModeSelect = document.getElementById('viewModeSelect');
    const pipExportCanvas = document.getElementById('pipExportCanvas');
    const exportPipBtn = document.getElementById('exportPipBtn');
    const exportModeSelect = document.getElementById('exportModeSelect');
    const exportBurnTcCheckbox = document.getElementById('exportBurnTcCheckbox');
    const exportBlockingOverlay = document.getElementById('exportBlockingOverlay');
    const exportBlockingSub = document.getElementById('exportBlockingSub');
    const soloTcNoticeOverlay = document.getElementById('soloTcNoticeOverlay');
    const soloTcNoticeOk = document.getElementById('soloTcNoticeOk');
    const EXPORT_WEBM_BTN_LABEL = 'Exp WebM';

