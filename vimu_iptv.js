(function () {
    'use strict';

    if (window.vimu_iptv_plugin_installed) return;
    window.vimu_iptv_plugin_installed = true;

    function initVimuPlugin() {
        // Перехоплюємо події відтворення IPTV у Лампі
        Lampa.Listener.follow('iptv', function (e) {
            if (e.type === 'play' && e.playlist && e.playlist.length > 0) {
                
                // Перевіряємо, чи увімкнено зовнішній плеєр у налаштуваннях
                var useExternal = Lampa.Storage.field('player') === 'external';

                if (useExternal && typeof Android !== 'undefined') {
                    // Скасовуємо стандартний запуск Лампи
                    e.preventDefault();

                    var channels = e.playlist;
                    var currentIndex = e.index || 0;

                    var urls = [];
                    var titles = [];

                    // Збираємо списки URL та назв усіх каналів з поточної категорії
                    channels.forEach(function (item) {
                        urls.push(item.url || item.stream || '');
                        titles.push(item.name || item.title || 'Канал');
                    });

                    // Формуємо Intent для Vimu Media Player
                    var intentData = {
                        action: 'android.intent.action.VIEW',
                        package: 'net.wgt.vimu.androidtv',
                        type: 'video/*',
                        url: urls[currentIndex],
                        intent_type: 'activity',
                        extras: [
                            { name: 'playlist', type: 'string[]', value: urls },
                            { name: 'playlist_titles', type: 'string[]', value: titles },
                            { name: 'index', type: 'int', value: currentIndex },
                            { name: 'start_position', type: 'int', value: currentIndex }
                        ]
                    };

                    // Відправляємо Intent в Android
                    try {
                        if (Lampa.Android && Lampa.Android.openIntent) {
                            Lampa.Android.openIntent(intentData);
                        } else if (Android.openIntent) {
                            Android.openIntent(JSON.stringify(intentData));
                        } else {
                            // Резервний запуск через стандартний метод
                            Android.openPlayer(urls[currentIndex], titles[currentIndex]);
                        }
                    } catch (err) {
                        Lampa.Noty.show('Помилка запуску Vimu: ' + err.message);
                    }
                }
            }
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
