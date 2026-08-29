(function () {
    'use strict';

    if (window.vimu_iptv_plugin_installed) return;
    window.vimu_iptv_plugin_installed = true;

    // Усі відомі пакети Vimu (порядок пріоритету)
    var VIMU_PACKAGES = [
        'net.gtvbox.videoplayer',  // основний
        'net.gtvbox.vimuhd',       // HD / free
        'net.gtvbox.vimu'          // старий
    ];

    function openInVimu(urls, titles) {
        if (!urls.length) {
            Lampa.Noty.show('Немає валідних потоків');
            return;
        }

        var lastError = null;

        // Пробуємо кожен пакет по черзі
        for (var i = 0; i < VIMU_PACKAGES.length; i++) {
            var pkg = VIMU_PACKAGES[i];

            var intentData = {
                action: 'android.intent.action.VIEW',
                package: pkg,
                type: 'application/vnd.gtvbox.filelist',
                url: 'http://fakeurl',
                intent_type: 'activity',
                extras: [
                    { name: 'asusfilelist', type: 'string[]', value: urls },
                    { name: 'asusnamelist', type: 'string[]', value: titles }
                ]
            };

            try {
                if (Lampa.Android && typeof Lampa.Android.openIntent === 'function') {
                    Lampa.Android.openIntent(intentData);
                    return; // успішно відправили
                }
                if (typeof Android !== 'undefined' && typeof Android.openIntent === 'function') {
                    Android.openIntent(JSON.stringify(intentData));
                    return;
                }
            } catch (err) {
                lastError = err;
                // пробуємо наступний пакет
            }
        }

        // Fallback — один потік через openPlayer
        try {
            if (typeof Android !== 'undefined' && typeof Android.openPlayer === 'function') {
                Android.openPlayer(urls[0], {
                    title: titles[0] || 'Канал',
                    playlist: urls.map(function (u, idx) {
                        return { url: u, title: titles[idx] || ('Канал ' + (idx + 1)) };
                    })
                });
                return;
            }
        } catch (e) {
            lastError = e;
        }

        Lampa.Noty.show('Не вдалося відкрити Vimu' + (lastError ? ': ' + (lastError.message || lastError) : ''));
    }

    function initVimuPlugin() {
        Lampa.Listener.follow('iptv', function (e) {
            if (e.type !== 'play' || !e.playlist || !e.playlist.length) return;

            var player = Lampa.Storage.field('player');
            var playerIptv = Lampa.Storage.field('player_iptv');
            var useExternal = player === 'external' || playerIptv === 'external';

            // Якщо не зовнішній плеєр і немає Android — нічого не робимо
            if (!useExternal || typeof Android === 'undefined') return;

            // Скасовуємо стандартний запуск Лампи
            if (typeof e.preventDefault === 'function') {
                e.preventDefault();
            }

            var channels = e.playlist;
            var currentIndex = Math.max(0, parseInt(e.index, 10) || 0);
            if (currentIndex >= channels.length) currentIndex = 0;

            var urls = [];
            var titles = [];

            // Збираємо ВСІ потоки з категорії
            channels.forEach(function (item) {
                var url = (item.url || item.stream || item.link || item.src || '').toString().trim();
                if (!url) return;

                urls.push(url);
                titles.push(
                    (item.name || item.title || item.channel || item.label || 'Канал').toString()
                );
            });

            if (!urls.length) {
                Lampa.Noty.show('Немає валідних потоків для Vimu');
                return;
            }

            // Зсуваємо плейлист — потрібний канал стає першим
            // (Vimu не підтримує index в API)
            if (currentIndex > 0 && currentIndex < urls.length) {
                urls = urls.slice(currentIndex).concat(urls.slice(0, currentIndex));
                titles = titles.slice(currentIndex).concat(titles.slice(0, currentIndex));
            }

            openInVimu(urls, titles);
        });
    }

    if (window.appready) {
        initVimuPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') initVimuPlugin();
        });
    }
})();
