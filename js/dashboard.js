/**
 * dashboard.js — Renders the main dashboard as one continuous scroll.
 * Sections: Today → Future → Complete, sorted by start time within each.
 */

'use strict';

const Dashboard = (() => {

  const formatTime = (t) => {
    if (!t) return 'All Day';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  };

  const render = () => {
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    container.innerHTML = '';
    UI.state.viewMode === 'module' ? renderModuleView(container) : renderGranularView(container);
  };

  // Sort module items: timed first (asc), all-day last, then alpha
  const sortByTime = (items) => [...items].sort((a, b) => {
    const aT = a.module.startTime || null;
    const bT = b.module.startTime || null;
    if (aT && !bT) return -1;
    if (!aT && bT) return 1;
    if (aT && bT) return aT.localeCompare(bT);
    return a.module.name.localeCompare(b.module.name);
  });

  const appendSectionHeader = (container, label, icon) => {
    const el = document.createElement('div');
    el.className = 'dash-section-header';
    el.innerHTML = `<span class="dash-section-icon">${icon}</span><span class="dash-section-label">${label}</span>`;
    container.appendChild(el);
  };

  const appendNoneMsg = (container, msg) => {
    const el = document.createElement('div');
    el.className = 'dash-none-msg';
    el.textContent = msg;
    container.appendChild(el);
  };

  // ===========================================================
  // MODULE VIEW
  // ===========================================================
  const renderModuleView = (container) => {
    const classified = Scheduler.classifyModules();
    const standAlone = Scheduler.classifyStandaloneTasks();

    const hasAnything = classified.today.length || standAlone.active.length ||
                        classified.future.length || classified.complete.length ||
                        standAlone.complete.length;
    if (!hasAnything) {
      const el = document.createElement('div');
      el.className = 'empty-state';
      el.innerHTML = '<div class="empty-icon">🌊</div><p>All clear!<br>Tap + to add a module or task.</p>';
      container.appendChild(el);
      return;
    }

    // TODAY
    appendSectionHeader(container, 'Today', '🌅');
    if (classified.today.length || standAlone.active.length) {
      sortByTime(classified.today).forEach(item => container.appendChild(buildModuleCard(item, 'today')));
      standAlone.active.forEach(task => container.appendChild(buildStandaloneTaskCard(task)));
    } else {
      appendNoneMsg(container, 'Nothing due today');
    }

    // FUTURE
    if (classified.future.length) {
      appendSectionHeader(container, 'Future', '📅');
      const futureSorted = [...classified.future].sort((a, b) => {
        const dd = (a.daysUntil || 0) - (b.daysUntil || 0);
        if (dd !== 0) return dd;
        const aT = a.module.startTime || null, bT = b.module.startTime || null;
        if (aT && !bT) return -1; if (!aT && bT) return 1;
        if (aT && bT) return aT.localeCompare(bT);
        return a.module.name.localeCompare(b.module.name);
      });
      futureSorted.forEach(item => container.appendChild(buildModuleCard(item, 'future')));
    }

    // COMPLETE
    if (classified.complete.length || standAlone.complete.length) {
      appendSectionHeader(container, 'Completed', '✅');
      sortByTime(classified.complete).forEach(item => container.appendChild(buildModuleCard(item, 'complete')));
      standAlone.complete.forEach(task => container.appendChild(buildStandaloneTaskCard(task)));
    }
  };

  // ===========================================================
  // GRANULAR VIEW
  // ===========================================================
  const renderGranularView = (container) => {
    const classified = Scheduler.classifyModules();
    const standAlone = Scheduler.classifyStandaloneTasks();

    const buildTasks = (moduleItems) => {
      const tasks = [];
      sortByTime(moduleItems).forEach(({ module: mod, occurrenceDate }) => {
        DB.getTasksByModule(mod.id).sort((a, b) => a.rank - b.rank)
          .forEach(task => tasks.push({ task, module: mod, occurrenceDate }));
      });
      return tasks;
    };

    // TODAY
    appendSectionHeader(container, 'Today', '🌅');
    const todayTasks = buildTasks(classified.today).filter(i => !i.task.status);
    if (!todayTasks.length && !standAlone.active.length) {
      appendNoneMsg(container, 'Nothing due today');
    } else {
      todayTasks.forEach(i => container.appendChild(buildGranularTaskItem(i)));
      standAlone.active.forEach(task => container.appendChild(buildGranularTaskItem({ task, module: null })));
    }

    // FUTURE
    const futureTasks = buildTasks(classified.future).filter(i => !i.task.status);
    if (futureTasks.length) {
      appendSectionHeader(container, 'Future', '📅');
      futureTasks.forEach(i => container.appendChild(buildGranularTaskItem(i)));
    }

    // COMPLETE
    const completeTasks = buildTasks(classified.complete).filter(i => i.task.status);
    if (completeTasks.length || standAlone.complete.length) {
      appendSectionHeader(container, 'Completed', '✅');
      completeTasks.forEach(i => container.appendChild(buildGranularTaskItem(i)));
      standAlone.complete.forEach(task => container.appendChild(buildGranularTaskItem({ task, module: null })));
    }
  };

  // ===========================================================
  // CARD BUILDERS
  // ===========================================================
  const buildModuleCard = (item, section) => {
    const { module: mod, pct, daysUntil, occurrenceDate } = item;
    const allTasks     = DB.getTasksByModule(mod.id);
    const pendingTasks = allTasks.filter(t => !t.status).slice(0, 3);

    const card = document.createElement('div');
    card.className = 'module-card';

    let chipClass = 'chip-today', chipText = 'Today';
    if (section === 'complete') { chipClass = 'chip-complete'; chipText = 'Done'; }
    else if (section === 'future') { chipClass = 'chip-future'; chipText = Scheduler.friendlyDate(occurrenceDate); }

    card.innerHTML = `
      <div class="module-card-accent-bar" style="background:${mod.colour}"></div>
      <div class="module-card-header" data-open-module="${mod.id}">
        <div class="module-card-info">
          <div class="module-card-name">${UI.escHtml(mod.name)}</div>
          <div class="module-card-meta">
            <span>${Scheduler.freqLabel(mod)}</span>
            <span class="meta-dot">·</span>
            <span class="meta-time">🕐 ${formatTime(mod.startTime)}</span>
            <span style="color:${UI.pctColor(pct)}">${pct}%</span>
          </div>
        </div>
        <span class="module-status-chip ${chipClass}">${chipText}</span>
      </div>
      <div class="module-progress-bar">
        <div class="module-progress-fill" style="width:${pct}%;background:${mod.colour}"></div>
      </div>
    `;

    if (pendingTasks.length > 0) {
      const preview = document.createElement('div');
      preview.className = 'module-card-preview';
      pendingTasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'preview-task';
        row.innerHTML = `
          <div class="check-ring" data-quick-check="${task.id}" style="width:20px;height:20px;min-width:20px;border-color:${mod.colour}40"></div>
          <span>${UI.escHtml(task.name)}</span>
          ${task.type === 'measure' ? '<span style="font-size:10px;color:var(--purple)">📏</span>' : ''}
        `;
        row.querySelector('[data-quick-check]').addEventListener('click', (e) => {
          e.stopPropagation();
          if (task.type === 'measure') {
            Modals.openMeasure(task.id, task.measureLabel, task.measureValue, () => App.refreshDashboard());
          } else {
            DB.updateTask(task.id, { status: true });
            App.refreshDashboard();
          }
        });
        preview.appendChild(row);
      });
      if (allTasks.length > 3) {
        const more = document.createElement('div');
        more.className = 'preview-task';
        more.style.cssText = 'color:var(--text-muted);font-size:12px';
        more.textContent = `+${allTasks.length - 3} more tasks`;
        preview.appendChild(more);
      }
      card.appendChild(preview);
    }

    card.querySelector('[data-open-module]').addEventListener('click', () => Modals.openModuleDetail(mod.id));
    return card;
  };

  const buildStandaloneTaskCard = (task) => {
    const card = document.createElement('div');
    card.className = 'task-card' + (task.status ? ' done' : '');
    card.innerHTML = `
      <div class="check-ring${task.status ? ' checked' : ''}" data-standalone-check="${task.id}"></div>
      <div style="flex:1">
        <div class="task-name">${UI.escHtml(task.name)}</div>
        ${task.type === 'measure' && task.measureValue !== null ? `<div style="font-size:12px;color:var(--purple);margin-top:2px">${task.measureValue}${task.measureLabel ? ' ' + task.measureLabel : ''}</div>` : ''}
      </div>
      ${task.type === 'measure' ? `<button class="icon-btn" data-measure-task="${task.id}" style="color:var(--purple);font-size:14px">📏</button>` : ''}
      <button class="icon-btn" data-edit-standalone="${task.id}" style="color:var(--text-muted);font-size:13px">✏️</button>
    `;
    card.querySelector('[data-standalone-check]').addEventListener('click', () => {
      if (task.type === 'measure') {
        Modals.openMeasure(task.id, task.measureLabel, task.measureValue, () => App.refreshDashboard());
      } else { DB.updateTask(task.id, { status: !task.status }); App.refreshDashboard(); }
    });
    const mBtn = card.querySelector('[data-measure-task]');
    if (mBtn) mBtn.addEventListener('click', () => Modals.openMeasure(task.id, task.measureLabel, task.measureValue, () => App.refreshDashboard()));
    const eBtn = card.querySelector('[data-edit-standalone]');
    if (eBtn) eBtn.addEventListener('click', () => Modals.openEditTask(task.id, null));
    return card;
  };

  const buildGranularTaskItem = ({ task, module: mod }) => {
    const item = document.createElement('div');
    item.className = 'granular-task' + (task.status ? ' done' : '');
    item.innerHTML = `
      <div class="check-ring${task.status ? ' checked' : ''}${mod ? ' check-ring-accent' : ''}" data-g-check="${task.id}"
           style="${mod ? `--accent:${mod.colour}` : ''}"></div>
      <span class="task-name">${UI.escHtml(task.name)}</span>
      ${task.type === 'measure' && task.measureValue !== null ? `<span class="measure-value-badge">${task.measureValue}${task.measureLabel ? ' ' + task.measureLabel : ''}</span>` : ''}
      ${mod ? `<span class="task-module-tag" style="border-color:${mod.colour}40;color:${mod.colour}">${UI.escHtml(mod.name)}</span>` : ''}
      ${task.type === 'measure' ? `<button class="icon-btn" data-g-measure="${task.id}" style="color:var(--purple);font-size:13px">📏</button>` : ''}
    `;
    item.querySelector('[data-g-check]').addEventListener('click', () => {
      if (task.type === 'measure') {
        Modals.openMeasure(task.id, task.measureLabel, task.measureValue, () => App.refreshDashboard());
      } else { DB.updateTask(task.id, { status: !task.status }); App.refreshDashboard(); }
    });
    const mBtn = item.querySelector('[data-g-measure]');
    if (mBtn) mBtn.addEventListener('click', () => Modals.openMeasure(task.id, task.measureLabel, task.measureValue, () => App.refreshDashboard()));
    return item;
  };

  return { render };
})();
