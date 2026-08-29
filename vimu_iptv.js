(function () {
    'use strict';

    if (window.vimu_iptv_plugin_v4) return;
    window.vimu_iptv_plugin_v4 = true;

    var TAG = '[VimuIPTV]';

    function log() {
        try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
    }
    function error() {
        try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
    }

    function isAndroid() {
        return typeof AndroidJS !== 'undefined' ||
            typeof Android !== 'undefined' ||
            (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android'));
    }

    function getChannelUrl(ch) {
        if (!ch) return '';
        return String(ch.url || ch.stream || ch.link || ch.src || '').trim();
    }

    function getChannelTitle(ch) {
        if (!ch) return 'Канал';
        return String(ch.name || ch.title || ch.channel || ch.label || 'Канал').trim() || 'Канал';
    }

    /**
     * Збирає плейлист з IPTV-даних Lampa
     */
    function buildFromIptvData(data) {
        var urls = [];
        var titles = [];
        var currentUrl = data.url ? String(data.url).trim() : '';
        var list = data.playlist || [];

        if (list.length) {
            list.forEach(function (item) {
                var u = getChannelUrl(item);
                if (!u) return;
                urls.push(u);
                titles.push(getChannelTitle(item));
            });
        }

        if (!urls.length && currentUrl) {
            urls.push(currentUrl);
            titles.push(getChannelTitle(data));
        }

        // Поточний канал — першим (для старих Vimu без startindex)
        var idx = 0;
        if (currentUrl && urls.length > 1) {
            var f = urls.indexOf(currentUrl);
            if (f > 0) idx = f;
        }
        if (typeof data.position === 'number' && data.position >= 0 && data.position < urls.length) {
            idx = data.position;
        }
        if (idx > 0) {
            urls = urls.slice(idx).concat(urls.slice(0, idx));
            titles = titles.slice(idx).concat(titles.slice(0, idx));
        }

        return { urls: urls, titles: titles, index: 0 };
    }

    /**
     * Відкрити через штатний bridge Lampa → нативний код сам збере Intent для Vimu
     * (asusfilelist / asusnamelist / startindex уже є в LAMPA APK)
     */
    function openViaLampa(urls, titles, originalData) {
        if (!urls.length) {
            error('немає URL');
            Lampa.Noty.show('Vimu: немає URL');
            return false;
        }

        var playlist = urls.map(function (u, i) {
            return { url: u, title: titles[i] || ('Канал ' + (i + 1)) };
        });

        var payload = {
            title: titles[0] || 'IPTV',
            url: urls[0],
            playlist: playlist,
            iptv: true,
            tv: true
        };

        // Зберігаємо корисні поля з оригіналу
        if (originalData) {
            if (originalData.headers) payload.headers = originalData.headers;
            if (originalData.timeline) payload.timeline = originalData.timeline;
        }

        log('openPlayer channels=', urls.length, 'first=', urls[0].substring(0, 60));

        try {
            // Офіційний шлях Lampa
            if (Lampa.Android && typeof Lampa.Android.openPlayer === 'function') {
                Lampa.Android.openPlayer(urls[0], payload);
                Lampa.Noty.show('Vimu: openPlayer (' + urls.length + ' каналів)');
                return true;
            }
            if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                AndroidJS.openPlayer(urls[0], JSON.stringify(payload));
                Lampa.Noty.show('Vimu: AndroidJS (' + urls.length + ')');
                return true;
            }
            if (typeof Android !== 'undefined' && typeof Android.openPlayer === 'function') {
                Android.openPlayer(urls[0], JSON.stringify(payload));
                Lampa.Noty.show('Vimu: Android (' + urls.length + ')');
                return true;
            }
            error('немає bridge openPlayer');
            Lampa.Noty.show('Vimu: немає Android bridge');
        } catch (e) {
            error('openPlayer exception', e && (e.message || e), e);
            Lampa.Noty.show('Vimu помилка: ' + (e.message || e));
        }
        return false;
    }

    function launchIptv(data) {
        if (!isAndroid()) {
            log('не Android — пропуск');
            return false;
        }
        if (!data) return false;

        var pl = buildFromIptvData(data);
        log('playlist size=', pl.urls.length);

        if (!pl.urls.length) return false;

        return openViaLampa(pl.urls, pl.titles, data);
    }

    function init() {
        log('init v4');

        // ── 1. Перехоплюємо Player.iptv (головне для IPTV!) ──
        if (Lampa.Player && typeof Lampa.Player.iptv === 'function') {
            var origIptv = Lampa.Player.iptv.bind(Lampa.Player);

            Lampa.Player.iptv = function (data) {
                log('Player.iptv викликано', data && {
                    url: data.url ? String(data.url).substring(0, 60) : null,
                    playlist: data.playlist ? data.playlist.length : 0,
                    title: data.title
                });

                // Якщо плеєр IPTV = android/external — відкриваємо самі і не пускаємо внутрішній
                var p = Lampa.Storage.field('player_iptv') || Lampa.Storage.field('player') || '';
                log('player_iptv=', p);

                if (isAndroid() && (p === 'android' || p === 'external' || p === '')) {
                    // Форсуємо android
                    data = data || {};
                    data.iptv = true;
                    data.launch_player = 'android';

                    if (launchIptv(data)) {
                        log('IPTV відкрито через Vimu path, внутрішній скасовано');
                        return; // не викликаємо origIptv
                    }
                }

                // Інакше — стандартна поведінка Lampa
                return origIptv(data);
            };
            log('Player.iptv обгорнуто');
        } else {
            error('Lampa.Player.iptv не знайдено');
        }

        // ── 2. Додатково: create (для звичайного play з iptv-флагом) ──
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('create', function (e) {
                if (!e || !e.data) return;
                if (!(e.data.iptv || e.data.tv || e.data.iptv_player)) return;

                log('Player.create iptv', e.data.url ? String(e.data.url).substring(0, 60) : '');

                if (launchIptv(e.data)) {
                    if (typeof e.abort === 'function') {
                        e.abort();
                        log('create aborted');
                    }
                }
            });
            log('підписка create');
        }

        // ── 3. Обгортка openPlayer — якщо Lampa вже йде назовні з коротким плейлистом ──
        function wrapOpenPlayer(obj, name) {
            if (!obj || typeof obj[name] !== 'function') return;
            var orig = obj[name].bind(obj);
            obj[name] = function (link, data) {
                try {
                    var parsed = data;
                    if (typeof data === 'string') {
                        try { parsed = JSON.parse(data); } catch (e) { parsed = {}; }
                    }
                    parsed = parsed || {};

                    if (parsed.iptv || parsed.tv || parsed.iptv_player) {
                        log('openPlayer wrap iptv, playlist=', parsed.playlist ? parsed.playlist.length : 0);

                        // Якщо плейлист порожній/короткий — спробуємо збагатити з link
                        if ((!parsed.playlist || !parsed.playlist.length) && link) {
                            parsed.url = link;
                            parsed.playlist = [{ url: link, title: parsed.title || 'Канал' }];
                        }
                    }
                } catch (err) {
                    error('wrap openPlayer', err);
                }
                return orig(link, typeof data === 'string' ? data : (data && JSON.stringify ? data : data));
            };
            // Для AndroidJS потрібен саме JSON-рядок
            if (name === 'openPlayer' && obj === (typeof AndroidJS !== 'undefined' ? AndroidJS : null)) {
                obj[name] = function (link, data) {
                    var payload = data;
                    if (typeof data !== 'string') {
                        try { payload = JSON.stringify(data || {}); } catch (e) { payload = '{}'; }
                    }
                    return orig(link, payload);
                };
            }
            log('обгорнуто', name);
        }

        if (Lampa.Android) wrapOpenPlayer(Lampa.Android, 'openPlayer');

        Lampa.Noty.show('Vimu IPTV v4 активний');
        log('init done, android=', isAndroid());
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
