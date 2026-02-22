/**
 * Veritimo — Theme Runtime JS
 * Handles dark mode toggle, OS preference sync, and persistence
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'veritimo-theme';
    var htmlEl = document.documentElement;

    // Resolve initial theme: stored preference > OS preference > light
    function resolveTheme() {
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        htmlEl.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        var btn = document.getElementById('vt-darkmode-btn');
        if (btn) btn.title = (theme === 'dark') ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        if (btn) btn.innerHTML = (theme === 'dark') ? '&#9728;' : '&#9790;';
    }

    function toggleTheme() {
        var current = htmlEl.getAttribute('data-theme') || resolveTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    function injectToggleButton() {
        if (document.getElementById('vt-darkmode-btn')) return;
        var btn = document.createElement('div');
        btn.id = 'vt-darkmode-btn';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.onclick = toggleTheme;
        document.body.appendChild(btn);
    }

    // Apply theme immediately to avoid flash
    applyTheme(resolveTheme());

    // Watch OS preference changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            // Only auto-switch if no manual preference is stored
            if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    // Inject toggle button once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggleButton);
    } else {
        injectToggleButton();
    }

    // Expose globally so the plugin handlebars can also call it
    window.veritimoToggle = toggleTheme;
    window.veritimoApplyTheme = applyTheme;
}());
