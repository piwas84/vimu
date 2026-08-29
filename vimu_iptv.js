(function () {
    'use strict';

    if (window.vimu_iptv_plugin_v3) return;
    window.vimu_iptv_plugin_v3 = true;

    var VIMU_PACKAGES = [
        'net.gtvbox.videoplayer',
        'net.gtvbox.vimuhd',
        'net.gtvbox.vimu'
    ];

    function isAndroid() {
        return typeof Android !== 'undefined' || typeof AndroidJS !== 'undefined' ||
            (window.Lampa && Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android'));
    }

    function collectPlaylist(data) {
        var urls = [];
        var titles = [];
        var list = data.playlist || [];

        // якщо є плейлист — беремо все
        if (list.length) {
            list.forEach(function (item) {
                var u = (item && (item.url || item.stream || item.link || item.src)) || '';
                u = String(u).trim();
                if (!u) return;
                urls.push(u);
                titles.push(String((item.name || item.title || item.channel || 'Канал')).trim() || 'Канал');
            });
        }

        // якщо плейлиста немає — один потік
        if (!urls.length && data.url) {
            urls.push(String(data.url).trim());
            titles.push(String(data.title || data.name || 'Канал'));
        }

        // поточний індекс — ставимо його першим
        var idx = 0;
        if (data.url && urls.length > 1) {
            var found = urls.indexOf(data.url);
            if (found > 0) idx = found;
        }
        if (typeof data.playlist_position === 'number' && data.playlist_position > 0) {
            idx = data.playlist_position;
        }
        if (idx > 0 && idx < urls.length) {
            urls = urls.slice(idx).concat(urls.slice(0, idx));
            titles = titles.slice(idx).concat(titles.slice(0, idx));
        }

        return { urls: urls, titles: titles };
    }

    function openVimu(urls, titles) {
        if (!urls.length) {
            Lampa.Noty.show('Vimu: немає URL');
            return false;
        }

        var extras = [
            { name: 'asusfilelist', type: 'string[]', value: urls },
            { name: 'asusnamelist', type: 'string[]', value: titles }
        ];

        // 1) Lampa.Android.openIntent (якщо є)
        if (Lampa.Android && typeof Lampa.Android.openIntent === 'function') {
            for (var i = 0; i < VIMU_PACKAGES.length; i++) {
                try {
                    Lampa.Android.openIntent({
                        action: 'android.intent.action.VIEW',
                        package: VIMU_PACKAGES[i],
                        type: 'application/vnd.gtvbox.filelist',
                        url: 'http://fakeurl',
                        intent_type: 'activity',
                        extras: extras
                    });
                    Lampa.Noty.show('Vimu: ' + VIMU_PACKAGES[i] + ' (' + urls.length + ' каналів)');
                    return true;
                } catch (e) {}
            }
        }

        // 2) Android.openIntent (рядок)
        if (typeof Android !== 'undefined' && typeof Android.openIntent === 'function') {
            for (var j = 0; j < VIMU_PACKAGES.length; j++) {
                try {
                    Android.openIntent(JSON.stringify({
                        action: 'android.intent.action.VIEW',
                        package: VIMU_PACKAGES[j],
                        type: 'application/vnd.gtvbox.filelist',
                        url: 'http://fakeurl',
                        intent_type: 'activity',
                        extras: extras
                    }));
                    Lampa.Noty.show('Vimu: ' + VIMU_PACKAGES[j] + ' (' + urls.length + ')');
                    return true;
                } catch (e) {}
            }
        }

        // 3) Fallback — звичайний openPlayer (Lampa сама вибере плеєр, можна обрати Vimu)
        try {
            var data = {
                title: titles[0],
                playlist: urls.map(function (u, i) {
                    return { url: u, title: titles[i] };
                })
            };
            if (Lampa.Android && typeof Lampa.Android.openPlayer === 'function') {
                Lampa.Android.openPlayer(urls[0], data);
                Lampa.Noty.show('Vimu fallback openPlayer (' + urls.length + ')');
                return true;
            }
            if (typeof Android !== 'undefined' && typeof Android.openPlayer === 'function') {
                Android.openPlayer(urls[0], JSON.stringify(data));
                Lampa.Noty.show('Vimu fallback Android.openPlayer');
                return true;
            }
        } catch (e) {
            Lampa.Noty.show('Vimu помилка: ' + (e.message || e));
        }

        return false;
    }

    function shouldHandle(data) {
        if (!data) return false;
        // IPTV-режим
        if (data.iptv || data.tv) return true;
        // або явно IPTV-плеєр
        var p = Lampa.Storage.field('player_iptv') || Lampa.Storage.field('player');
        if (p === 'android' || p === 'external') {
            // якщо є великий плейлист каналів — теж IPTV
            if (data.playlist && data.playlist.length > 3) return true;
        }
        return false;
    }

    function tryLaunch(data, abortFn) {
        if (!isAndroid()) return false;
        if (!shouldHandle(data)) return false;

        var pl = collectPlaylist(data);
        if (!pl.urls.length) return false;

        var ok = openVimu(pl.urls, pl.titles);
        if (ok && typeof abortFn === 'function') {
            try { abortFn(); } catch (e) {}
        }
        return ok;
    }

    function init() {
        // Головне перехоплення — до запуску плеєра
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('create', function (e) {
                if (!e || !e.data) return;
                tryLaunch(e.data, function () {
                    if (typeof e.abort === 'function') e.abort();
                });
            });
        }

        // Додатково — якщо вже пішов external
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('external', function (data) {
                tryLaunch(data);
            });
        }

        // Старий IPTV-івент (на всяк випадок)
        Lampa.Listener.follow('iptv', function (e) {
            if (e && e.type === 'play' && e.playlist) {
                var data = {
                    iptv: true,
                    playlist: e.playlist,
                    url: (e.playlist[e.index || 0] || {}).url,
                    title: (e.playlist[e.index || 0] || {}).name
                };
                if (typeof e.preventDefault === 'function') e.preventDefault();
                tryLaunch(data);
            }
        });

        Lampa.Noty.show('Vimu IPTV плагін v3 активний');
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
