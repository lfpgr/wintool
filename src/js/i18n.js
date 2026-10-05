/**
 * WinTool UI chrome i18n.
 * Russian strings are used when navigator.language matches ru*.
 */
(function (global) {
    const EN = {
        Settings: 'Settings',
        Refresh: 'Refresh',
        Start: 'Start',
        Stop: 'Stop',
        Restart: 'Restart',
        Details: 'Details',
        Customize: 'Customize',
        Done: 'Done',
        Dashboard: 'Dashboard',
        Welcome: 'Dashboard',
        'group.overview': 'Overview',
        'group.system': 'System',
        'group.software': 'Software',
        'group.settings': 'Settings',
        'group.network': 'Network',
        'group.other': 'Other',
    };

    const RU = {
        Settings: 'Настройки',
        Refresh: 'Обновить',
        Start: 'Запустить',
        Stop: 'Остановить',
        Restart: 'Перезапустить',
        Details: 'Сведения',
        Customize: 'Настроить',
        Done: 'Готово',
        Dashboard: 'Панель',
        Welcome: 'Панель',
        'group.overview': 'Обзор',
        'group.system': 'Система',
        'group.software': 'Программы',
        'group.settings': 'Параметры',
        'group.network': 'Сеть',
        'group.other': 'Прочее',
    };

    function detectIsRu(lang) {
        return String(lang || '').toLowerCase().startsWith('ru');
    }

    function detectLocale() {
        const lang =
            (global.navigator && (global.navigator.language || global.navigator.userLanguage)) ||
            '';
        return detectIsRu(lang) ? 'ru' : 'en';
    }

    const locale = detectLocale();
    const isRu = locale === 'ru';
    const dict = isRu ? RU : EN;

    function t(key) {
        if (dict[key] != null) return dict[key];
        if (EN[key] != null) return EN[key];
        return key;
    }

    function applyChrome() {
        if (document.documentElement) {
            document.documentElement.lang = locale;
        }

        const welcomeSpan = document.querySelector('#tab-list .tab-item[data-tab="welcome"] span');
        if (welcomeSpan) {
            welcomeSpan.textContent = t('Dashboard');
        }

        const settingsBtn = document.querySelector('.settings-btn');
        if (settingsBtn) {
            const icon = settingsBtn.querySelector('i');
            settingsBtn.textContent = '';
            if (icon) {
                settingsBtn.appendChild(icon);
                settingsBtn.appendChild(document.createTextNode(' ' + t('Settings')));
            } else {
                settingsBtn.textContent = t('Settings');
            }
        }

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });
    }

    const i18n = {
        t,
        isRu,
        locale,
        applyChrome,
        detectLocale,
        detectIsRu,
    };

    global.i18n = i18n;
    global.t = t;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyChrome);
    } else {
        applyChrome();
    }
})(typeof window !== 'undefined' ? window : globalThis);
