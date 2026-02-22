/**
 * Veritimo — Theme Runtime JS  v1.1
 *
 * Acts as the authoritative source of truth for dark/light mode.
 * Syncs with MeshCentral core by:
 *   1. Reading MC's native `darkmode` body-class and `localStorage['darkmode']` on startup.
 *   2. Applying theme by BOTH setting `data-theme` on <html> AND toggling the
 *      `darkmode` CSS class on <body> that MeshCentral core natively uses.
 *   3. Watching MC body-class changes with MutationObserver so if a user clicks
 *      MC's own dark-mode toggle, Veritimo stays in sync.
 *   4. Persisting to `localStorage['darkmode']` (MC's key) AND `localStorage['veritimo-theme']`.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'veritimo-theme';
    var MC_LS_KEY = 'darkmode';   // MC stores 'yes' or ''
    var MC_BODY_CLASS = 'darkmode';   // class MC adds to <body> for dark mode
    var htmlEl = document.documentElement;
    var _observing = false;

    /* ── Resolve initial theme ─────────────────────────────────────────────── */
    function resolveTheme() {
        // 1. Plugin's own stored preference (highest priority — plugin is source of truth)
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark') return 'dark';
        if (stored === 'light') return 'light';

        // 2. MeshCentral core's localStorage key (used when first opening MC)
        var mcLs = localStorage.getItem(MC_LS_KEY);
        if (mcLs === 'yes') return 'dark';
        if (mcLs !== null) return 'light';   // '' or anything else = light

        // 3. MC body class (theme already applied by MC before Veritimo loaded)
        if (document.body && document.body.classList.contains(MC_BODY_CLASS)) return 'dark';

        // 4. OS system preference
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'dark' : 'light';
    }

    /* ── Apply theme everywhere ────────────────────────────────────────────── */
    function applyTheme(theme, fromObserver) {
        var isDark = (theme === 'dark');

        // a) data-theme on <html> — used by Veritimo CSS variable selectors
        htmlEl.setAttribute('data-theme', theme);

        // b) MC native body class — what MC's own CSS targets
        if (document.body) {
            if (isDark) {
                document.body.classList.add(MC_BODY_CLASS);
            } else {
                document.body.classList.remove(MC_BODY_CLASS);
            }
        }

        // c) Persist to both our key and MC's key
        localStorage.setItem(STORAGE_KEY, theme);
        localStorage.setItem(MC_LS_KEY, isDark ? 'yes' : '');

        // d) Update floating toggle button icon
        var btn = document.getElementById('vt-darkmode-btn');
        if (btn) {
            btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
            btn.innerHTML = isDark ? '&#9728;' : '&#9790;';
        }
    }

    /* ── MutationObserver: watch for MC changing its own body class ─────────── */
    function startObserver() {
        if (_observing || !document.body) return;
        _observing = true;
        var mo = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.attributeName !== 'class') return;
                var mcDark = document.body.classList.contains(MC_BODY_CLASS);
                var vtDark = htmlEl.getAttribute('data-theme') === 'dark';
                if (mcDark !== vtDark) {
                    // MC changed its own class — follow it (without re-triggering observer)
                    htmlEl.setAttribute('data-theme', mcDark ? 'dark' : 'light');
                    localStorage.setItem(STORAGE_KEY, mcDark ? 'dark' : 'light');
                    localStorage.setItem(MC_LS_KEY, mcDark ? 'yes' : '');
                    var btn = document.getElementById('vt-darkmode-btn');
                    if (btn) btn.innerHTML = mcDark ? '&#9728;' : '&#9790;';
                }
            });
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    /* ── Toggle (floating button) ────────────────────────────────────────────── */
    function toggleTheme() {
        var current = htmlEl.getAttribute('data-theme') || resolveTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    /* ── Inject floating toggle button ──────────────────────────────────────── */
    function injectToggleButton() {
        if (document.getElementById('vt-darkmode-btn')) return;
        if (localStorage.getItem('veritimo-floatbtn') === 'false') return;
        var btn = document.createElement('div');
        btn.id = 'vt-darkmode-btn';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.onclick = toggleTheme;
        document.body.appendChild(btn);
        applyTheme(htmlEl.getAttribute('data-theme') || resolveTheme());
    }

    /* ── Cross-tab sync: if another tab changes localStorage ────────────────── */
    window.addEventListener('storage', function (e) {
        if (e.key === STORAGE_KEY || e.key === MC_LS_KEY) {
            var theme;
            if (e.key === STORAGE_KEY) {
                theme = (e.newValue === 'dark') ? 'dark' : 'light';
            } else {
                theme = (e.newValue === 'yes') ? 'dark' : 'light';
            }
            applyTheme(theme);
        }
    });

    /* ── OS preference (only when no manual preference stored) ──────────────── */
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            if (!localStorage.getItem(STORAGE_KEY) && !localStorage.getItem(MC_LS_KEY)) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    /* ── Startup ────────────────────────────────────────────────────────────── */
    // Apply immediately (before paint) to prevent flash
    applyTheme(resolveTheme());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            injectToggleButton();
            startObserver();
            // Re-apply in case MC rendered its own theme after our first call
            applyTheme(resolveTheme());
        });
    } else {
        injectToggleButton();
        startObserver();
    }

    /* ── Public API for plugin iframe ───────────────────────────────────────── */
    window.veritimoToggle = toggleTheme;
    window.veritimoApplyTheme = applyTheme;
    window.veritimoResolveTheme = resolveTheme;
}());
