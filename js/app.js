/**
 * app.js ΓÇö Main app bootstrap and global refresh coordinator
 */

'use strict';

const App = (() => {

  // ============================================================
  // Global refresh
  // ============================================================
  const refreshAll = () => {
    const page = UI.state.currentPage;
    refreshPage(page);
  };

  const refreshPage = (page) => {
    switch (page) {
      case 'dashboard': refreshDashboard(); break;
      case 'modules':   renderModulesPage(); break;
      case 'history':   History.render(); break;
      case 'settings':  History.render(); break;
    }
  };

  const refreshDashboard = () => {
    if (UI.state.currentPage === 'dashboard') Dashboard.render();
  };

  // ============================================================
  // Modules page
  // ============================================================
  const renderModulesPage = () => {
    const list = document.getElementById('modules-list');
    if (!list) return;
    list.innerHTML = '';

    const modules = DB.getModules().sort((a, b) => a.name.localeCompare(b.name));

    if (!modules.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">≡ƒôª</div><p>No modules yet.<br>Tap + to create your first one!</p></div>';
      return;
    }

    modules.forEach(mod => {
      const stats = DB.getModuleCompletionStats(mod.id);
      const stacks = DB.getStacksByModule(mod.id);

      const row = document.createElement('div');
      row.className = 'all-module-row';
      row.innerHTML = `
        <div class="all-module-row-accent" style="background:${mod.colour}"></div>
        <div class="all-module-row-info">
          <div class="all-module-row-name">${UI.escHtml(mod.name)}</div>
          <div class="all-module-row-meta">${Scheduler.freqLabel(mod)} ┬╖ ${stacks.length} stack${stacks.length !== 1 ? 's' : ''} ┬╖ ${stats.total} task${stats.total !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${!mod.active ? '<span style="font-size:10px;padding:2px 8px;background:var(--rose-dim);color:var(--rose);border-radius:999px;">Stopped</span>' : ''}
          <span class="all-module-row-badge">${stats.done}/${stats.total}</span>
        </div>
      `;
      row.addEventListener('click', () => Modals.openModuleDetail(mod.id));
      list.appendChild(row);
    });
  };

  // ============================================================
  // Init
  // ============================================================
  const init = () => {
    // Migrate localStorage data to latest schema
    DB.migrateData();

    // Wire up modals
    Modals.init();

    // Navigation ΓÇö bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => UI.navigateTo(btn.dataset.page));
    });

    // Navigation ΓÇö drawer
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.navigateTo(btn.dataset.page);
        UI.closeDrawer();
      });
    });

    // Top bar buttons
    document.getElementById('menu-btn').addEventListener('click', UI.openDrawer);
    document.getElementById('drawer-close').addEventListener('click', UI.closeDrawer);
    document.getElementById('drawer-overlay').addEventListener('click', UI.closeDrawer);

    // View mode segmented toggle
    document.querySelectorAll('.vtog-btn').forEach(btn => {
      btn.addEventListener('click', () => UI.toggleViewMode(btn.dataset.mode));
    });

    document.getElementById('add-btn').addEventListener('click', Modals.openQuickAdd);

    // New module button (on modules page)
    document.getElementById('new-module-btn').addEventListener('click', () => Modals.openEditModule(null));

    // History filter
    document.getElementById('history-module-select').addEventListener('change', () => History.renderHistory());

    // Settings
    document.getElementById('export-btn').addEventListener('click', () => {
      const data = DB.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `pyro-lagoon-${DB.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Data exported!');
    });

    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const ok = await UI.confirm('Import Data', 'This will REPLACE all your current data. Are you sure?');
        if (!ok) return;
        const success = DB.importData(ev.target.result);
        if (success) { UI.toast('Data imported!'); refreshAll(); }
        else UI.toast('Import failed ΓÇö invalid file');
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('clear-btn').addEventListener('click', async () => {
      const ok = await UI.confirm('Clear All Data', 'This permanently deletes ALL your modules, tasks, and history. This cannot be undone.');
      if (!ok) return;
      DB.clearAll();
      UI.toast('All data cleared');
      refreshAll();
    });

    document.getElementById('delete-history-btn').addEventListener('click', async () => {
      const modId = document.getElementById('delete-history-module-select').value;
      const label = modId
        ? `history for "${DB.getModuleById(modId)?.name || 'this module'}"`
        : 'ALL history records';
      const ok = await UI.confirm('Delete History', `Delete ${label}? This cannot be undone.`);
      if (!ok) return;
      if (modId) DB.deleteRunsByModule(modId);
      else DB.deleteAllRuns();
      UI.toast('History deleted');
      History.render();
    });

    // Run reset check on load, when returning to the app, and hourly as a fallback
    const runResets = () => {
      Scheduler.processPendingResets();
      refreshDashboard();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runResets();
    });

    setInterval(runResets, 60 * 60 * 1000); // hourly fallback

    Scheduler.processPendingResets();

    // Initial render
    UI.navigateTo('dashboard');
  };

  return { init, refreshAll, refreshPage, refreshDashboard };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
