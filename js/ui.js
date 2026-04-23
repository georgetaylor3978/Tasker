/**
 * ui.js — Shared UI state and navigation helpers
 */

'use strict';

const UI = (() => {

  // Colour palette for module tags
  const COLOURS = [
    '#f97316', '#fb923c', '#fbbf24', '#34d399', '#60a5fa',
    '#a78bfa', '#f472b6', '#38bdf8', '#fb7185', '#4ade80',
  ];

  // Current app state
  const state = {
    currentPage:    'dashboard',
    viewMode:       'module', // 'module' | 'granular'
    activeModuleId: null,
  };

  // ---- Navigation ----
  const navigateTo = (page) => {
    state.currentPage = page;
    // Pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    // Bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.page === page);
    });
    // Drawer nav items
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.page === page);
    });
    // Trigger page-specific refresh
    App.refreshPage(page);
  };

  const setDashboardTab = (tab) => {
    state.dashboardTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    App.refreshDashboard();
  };

  const toggleViewMode = (mode) => {
    state.viewMode = mode || (state.viewMode === 'module' ? 'granular' : 'module');
    document.querySelectorAll('.vtog-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.viewMode);
    });
    App.refreshDashboard();
  };

  // ---- Drawer ----
  const openDrawer = () => {
    document.getElementById('drawer').classList.remove('hidden');
    document.getElementById('drawer-overlay').classList.remove('hidden');
  };
  const closeDrawer = () => {
    document.getElementById('drawer').classList.add('hidden');
    document.getElementById('drawer-overlay').classList.add('hidden');
  };

  // ---- Colour picker render ----
  const renderColourPicker = (containerId, currentColour, onSelect) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    let selected = currentColour || COLOURS[0];
    COLOURS.forEach(c => {
      const swatch = document.createElement('button');
      swatch.className = 'colour-swatch' + (c === selected ? ' selected' : '');
      swatch.style.background = c;
      swatch.setAttribute('aria-label', c);
      swatch.addEventListener('click', () => {
        container.querySelectorAll('.colour-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        selected = c;
        if (onSelect) onSelect(c);
      });
      container.appendChild(swatch);
    });
    return () => selected; // returns getter
  };

  // ---- Format helpers ----
  const pctColor = (pct) => {
    if (pct >= 80) return 'var(--green)';
    if (pct >= 50) return 'var(--yellow)';
    return 'var(--rose)';
  };

  const escHtml = (str) =>
    String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Show a short toast notification
  let toastTimeout = null;
  const toast = (msg, type = 'info') => {
    let t = document.getElementById('toast-msg');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast-msg';
      t.style.cssText = `
        position:fixed; bottom:calc(var(--bottom-nav-h) + 16px); left:50%; transform:translateX(-50%);
        background:var(--bg-elevated); border:1px solid var(--border); color:var(--text-primary);
        padding:10px 20px; border-radius:999px; font-size:13px; font-weight:500;
        z-index:9999; box-shadow:var(--shadow-modal); pointer-events:none;
        transition:opacity 0.3s; white-space:nowrap;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  };

  // Confirm dialog (replaces window.confirm)
  const confirm = (title, message) => new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    modal.classList.remove('hidden');

    const ok  = document.getElementById('confirm-ok');
    const can = document.getElementById('confirm-cancel');

    const cleanup = (result) => {
      modal.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      can.removeEventListener('click', onCancel);
      document.querySelector('#modal-confirm .modal-backdrop').removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    ok.addEventListener('click', onOk);
    can.addEventListener('click', onCancel);
    document.querySelector('#modal-confirm .modal-backdrop').addEventListener('click', onCancel);
  });

  return {
    COLOURS, state, navigateTo, setDashboardTab, toggleViewMode,
    openDrawer, closeDrawer, renderColourPicker,
    pctColor, escHtml, toast, confirm,
  };
})();
