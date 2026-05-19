    // IndexedDB によるセッション保存
    function openIdb() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            const req = indexedDB.open(IDB_NAME, IDB_VER);
            req.onerror = () => reject(req.error || new Error('IDB open error'));
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
        });
    }
    function idbPut(key, val) {
        return openIdb().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(IDB_STORE, 'readwrite');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('IDB put'));
                    tx.objectStore(IDB_STORE).put(val, key);
                })
        );
    }
    function idbGet(key) {
        return openIdb().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(IDB_STORE, 'readonly');
                    const r = tx.objectStore(IDB_STORE).get(key);
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error || new Error('IDB get'));
                })
        );
    }

    function schedulePersistSession() {
        clearTimeout(persistSessionTimer);
        persistSessionTimer = setTimeout(() => {
            persistSessionTimer = null;
            persistSessionToStorage().catch((e) => {
                writeLog('Session save failed: ' + (e && e.message ? e.message : String(e)));
            });
        }, 450);
    }

    async function persistSessionToStorage() {
        writePrefs();
        if (!window.indexedDB) return;
        const row = {
            v: 1,
            audioMode: getAudioMode(),
            viewMode: getViewMode(),
            loopPlayback: getLoopPlaybackEnabled(),
        };
        if (fileLeft) {
            row.lName = fileLeft.name;
            row.lm = fileLeft.lastModified;
            row.lBlob = fileLeft;
        }
        if (fileRight) {
            row.rName = fileRight.name;
            row.rm = fileRight.lastModified;
            row.rBlob = fileRight;
        }
        if (!row.lBlob && !row.rBlob) {
            try {
                const db = await openIdb();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(IDB_STORE, 'readwrite');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                    tx.objectStore(IDB_STORE).delete(IDB_KEY_LAST);
                });
            } catch (_) {}
            return;
        }
        await idbPut(IDB_KEY_LAST, row);
    }

    async function restoreSessionFromStorage() {
        sessionRestoreListenersArmed = false;
        autoPlayAfterUserLoad = false;
        const prefs = readPrefs();
        applySavedAudioToRadios(prefs.audioMode);
        applySavedAutoPlay(prefs.autoPlay);

        if (!window.indexedDB) {
            writeLog('IndexedDB unavailable; skipped video blob restore.');
            return;
        }
        let row;
        try {
            row = await idbGet(IDB_KEY_LAST);
        } catch (e) {
            writeLog('Session read failed: ' + (e && e.message ? e.message : String(e)));
            return;
        }
        if (!row || (!row.lBlob && !row.rBlob)) {
            writeLog('No stored video session (audio/seek prefs may still apply).');
            return;
        }
        if (row.audioMode) applySavedAudioToRadios(row.audioMode);
        if (row.viewMode) applySavedViewMode(row.viewMode);
        if (typeof row.loopPlayback === 'boolean') applySavedLoopPlayback(row.loopPlayback);

        if (row.lBlob && row.rBlob) {
            const fl = new File([row.lBlob], row.lName || 'left.mp4', {
                type: mimeTypeHintForVideoFileName(row.lName || 'left.mp4'),
                lastModified: typeof row.lm === 'number' ? row.lm : Date.now(),
            });
            const fr = new File([row.rBlob], row.rName || 'right.mp4', {
                type: mimeTypeHintForVideoFileName(row.rName || 'right.mp4'),
                lastModified: typeof row.rm === 'number' ? row.rm : Date.now(),
            });
            assignPairToVideos(fl, fr, { skipPersist: true, skipAutoPlay: true });
            writeLog('Restored pair: ' + fl.name + ' / ' + fr.name);
            return;
        }
        if (row.lBlob) {
            const fl = new File([row.lBlob], row.lName || 'left.mp4', {
                type: mimeTypeHintForVideoFileName(row.lName || 'left.mp4'),
                lastModified: typeof row.lm === 'number' ? row.lm : Date.now(),
            });
            revokeAll();
            fileLeft = fl;
            urlLeft = URL.createObjectURL(fl);
            videoLeft.src = urlLeft;
            nameLeft.textContent = fl.name;
            updatePanelInfoLine('left');
            setLoaded(panelLeft, true);
            setLoaded(panelRight, false);
            nameRight.textContent = 'Not Loaded';
            infoRight.hidden = true;
            infoRight.textContent = '';
            videoRight.removeAttribute('src');
            videoRight.load();
            writeLog('Restored left only: ' + fl.name + ' (right empty)');
            void refreshContainerFpsForCurrentFiles();
            applyViewMode(getViewMode());
            return;
        }
        if (row.rBlob) {
            const fr = new File([row.rBlob], row.rName || 'right.mp4', {
                type: mimeTypeHintForVideoFileName(row.rName || 'right.mp4'),
                lastModified: typeof row.rm === 'number' ? row.rm : Date.now(),
            });
            revokeAll();
            fileRight = fr;
            urlRight = URL.createObjectURL(fr);
            videoRight.src = urlRight;
            nameRight.textContent = fr.name;
            updatePanelInfoLine('right');
            setLoaded(panelRight, true);
            setLoaded(panelLeft, false);
            nameLeft.textContent = 'Not Loaded';
            infoLeft.hidden = true;
            infoLeft.textContent = '';
            videoLeft.removeAttribute('src');
            videoLeft.load();
            writeLog('Restored right only: ' + fr.name + ' (left empty)');
            void refreshContainerFpsForCurrentFiles();
            applyViewMode(getViewMode());
        }
    }

