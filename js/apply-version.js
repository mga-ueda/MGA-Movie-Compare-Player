    // === 0b. バージョン定数をページ UI へ反映（version.js の直後・dom-refs.js の直後）
    (function applyAppVersionToUi() {
        document.title = 'MGA Movie Compare Player · ' + APP_VERSION_LABEL;

        const badge = document.querySelector('.version-badge');
        if (badge) badge.textContent = APP_VERSION_LABEL;

        if (logEl) {
            logEl.innerText = '> System Ready. (' + APP_VERSION_LABEL + ')';
        }

        const changelogRoot = document.getElementById('appVersionChangelog');
        if (!changelogRoot || !APP_CHANGELOG || !APP_CHANGELOG.length) return;

        const frag = document.createDocumentFragment();
        APP_CHANGELOG.forEach((entry) => {
            const h3 = document.createElement('h3');
            h3.textContent = 'v' + entry.version + ' - ' + entry.date;
            frag.appendChild(h3);
            const ul = document.createElement('ul');
            (entry.items || []).forEach((text) => {
                const li = document.createElement('li');
                li.textContent = text;
                ul.appendChild(li);
            });
            frag.appendChild(ul);
        });
        changelogRoot.appendChild(frag);
    })();
