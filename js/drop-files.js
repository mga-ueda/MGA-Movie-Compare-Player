    // ドロップゾーンとファイル割り当て
    function loadVideoToSide(side, f) {
        if (side === 'left') {
            if (urlLeft) URL.revokeObjectURL(urlLeft);
            urlLeft = URL.createObjectURL(f);
            fileLeft = f;
            videoLeft.src = urlLeft;
            nameLeft.textContent = f.name;
            updatePanelInfoLine('left');
            setLoaded(panelLeft, true);
        } else {
            if (urlRight) URL.revokeObjectURL(urlRight);
            urlRight = URL.createObjectURL(f);
            fileRight = f;
            videoRight.src = urlRight;
            nameRight.textContent = f.name;
            updatePanelInfoLine('right');
            setLoaded(panelRight, true);
        }
    }

    /** 映像パネルへドロップしたとき：指定側へそのまま配置（更新日時による並べ替えなし） */
    function assignFileToSide(side, files) {
        const videos = pickVideoFiles(files);
        if (videos.length === 0) {
            writeLog('Panel drop (' + side + '): no playable video (ignored)');
            return;
        }
        if (videos.length >= 2) {
            const pair = pickOldestAndNewest(videos);
            assignPairToVideos(pair[0], pair[1]);
            writeLog('Panel drop (' + side + '): loaded pair: ' + pair[0].name + ' / ' + pair[1].name);
            return;
        }
        const f = videos[0];
        loadVideoToSide(side, f);
        if (fileLeft && fileRight) {
            autoPlayAfterUserLoad = true;
            autoPlayLatch = false;
        }
        writeLog('Panel drop (' + side + '): ' + f.name);
        schedulePersistSession();
        void refreshContainerFpsForCurrentFiles();
        applyViewMode(getViewMode());
    }

    function panelDropSideFromTarget(target) {
        const panel = target && target.closest ? target.closest('.video-panel[data-side]') : null;
        if (!panel) return null;
        const side = panel.dataset.side;
        return side === 'left' || side === 'right' ? side : null;
    }

    /** 左が空なら左、右が空なら右、両方埋まっていれば左のみ差し替え（右は未読み込みに戻す） */
    function assignFiles(files) {
        const videos = pickVideoFiles(files);
        if (videos.length === 0) {
            writeLog('Open files: no playable video in selection (ignored)');
            return;
        }

        if (videos.length >= 2) {
            const pair = pickOldestAndNewest(videos);
            assignPairToVideos(pair[0], pair[1]);
            writeLog('Loaded pair: ' + pair[0].name + ' / ' + pair[1].name);
            return;
        }

        const f = videos[0];
        if (urlLeft === null) {
            urlLeft = URL.createObjectURL(f);
            fileLeft = f;
            videoLeft.src = urlLeft;
            nameLeft.textContent = f.name;
            updatePanelInfoLine('left');
            setLoaded(panelLeft, true);
            writeLog('Loaded left: ' + f.name);
            schedulePersistSession();
            void refreshContainerFpsForCurrentFiles();
            applyViewMode(getViewMode());
        } else if (urlRight === null) {
            urlRight = URL.createObjectURL(f);
            fileRight = f;
            videoRight.src = urlRight;
            nameRight.textContent = f.name;
            updatePanelInfoLine('right');
            setLoaded(panelRight, true);
            reorderTwoLoadedByDate();
            autoPlayAfterUserLoad = true;
            autoPlayLatch = false;
            writeLog('Loaded right: ' + f.name);
            schedulePersistSession();
        } else {
            revokeAll();
            urlLeft = URL.createObjectURL(f);
            fileLeft = f;
            videoLeft.src = urlLeft;
            nameLeft.textContent = f.name;
            updatePanelInfoLine('left');
            nameRight.textContent = 'Not Loaded';
            infoRight.hidden = true;
            infoRight.textContent = '';
            videoRight.removeAttribute('src');
            videoRight.load();
            setLoaded(panelLeft, true);
            setLoaded(panelRight, false);
            writeLog('Replaced left only (right cleared): ' + f.name);
            schedulePersistSession();
            void refreshContainerFpsForCurrentFiles();
            applyViewMode(getViewMode());
        }
    }

    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
        dragHoverDepth++;
        if (dragHoverDepth === 1) writeLog('Drop zone: drag enter (hover)');
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragHoverDepth = Math.max(0, dragHoverDepth - 1);
        if (dragHoverDepth === 0) {
            dropZone.classList.remove('dragover');
            writeLog('Drop zone: drag leave');
        }
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragHoverDepth = 0;
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files && files.length) {
            const names = Array.from(files)
                .map((f) => f.name)
                .join(', ');
            writeLog('Drop zone: dropped ' + files.length + ' item(s): ' + names);
        } else {
            writeLog('Drop zone: drop with no files');
        }
        assignFiles(files);
    });

    dropZone.addEventListener('click', () => {
        writeLog('Drop zone: click -> open file picker');
        filePicker.click();
    });
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            writeLog('Drop zone: Enter -> open file picker');
            filePicker.click();
        }
    });

    filePicker.addEventListener('change', () => {
        if (filePicker.files && filePicker.files.length) {
            const names = Array.from(filePicker.files)
                .map((f) => f.name)
                .join(', ');
            writeLog('File picker: selected ' + filePicker.files.length + ' file(s): ' + names);
            assignFiles(filePicker.files);
        }
        filePicker.value = '';
    });

    document.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
            e.preventDefault();
        }
    });
    document.addEventListener('drop', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        if (isTypingTarget(e.target)) return;
        if (dropZone.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        const names = Array.from(e.dataTransfer.files)
            .map((f) => f.name)
            .join(', ');
        const panelSide = panelDropSideFromTarget(e.target);
        if (panelSide) {
            writeLog('Panel drop: ' + e.dataTransfer.files.length + ' item(s): ' + names);
            assignFileToSide(panelSide, e.dataTransfer.files);
            return;
        }
        writeLog('Document drop: ' + e.dataTransfer.files.length + ' item(s): ' + names);
        assignFiles(e.dataTransfer.files);
    });

