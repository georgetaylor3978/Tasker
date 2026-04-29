/**
 * history.js — History analysis and run log
 * Shows per-module analysis (7d / 30d) + task breakdown + deletable run log.
 */

'use strict';

const History = (() => {

  // ---- Date helpers ----
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const runsInPeriod = (runs, days) => {
    const cutoff = daysAgo(days);
    return runs.filter(r => new Date(r.closedAt) >= cutoff);
  };

  // How many times should this module occur in the past N days
  const expectedOccurrences = (mod, days) => {
    switch (mod.freq) {
      case 'daily':    return days;
      case 'weekly':   return Math.max(1, Math.round(days / 7 * (mod.weekdays?.length || 1)));
      case 'biweekly': return Math.max(1, Math.round(days / 14));
      case 'monthly':  return Math.max(1, Math.round(days / 30));
      default:         return 1;
    }
  };

  // ---- Render entry point ----
  const render = () => {
    populateModuleFilter();
    populateDeleteHistorySelect();
    renderHistory();
  };

  const populateModuleFilter = () => {
    const sel = document.getElementById('history-module-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All Modules</option>';
    DB.getModules().filter(m => m.freq !== 'once').forEach(mod => {
      const opt = document.createElement('option');
      opt.value = mod.id;
      opt.textContent = mod.name;
      if (mod.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  };

  const populateDeleteHistorySelect = () => {
    const sel = document.getElementById('delete-history-module-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">All Modules</option>';
    DB.getModules().filter(m => m.freq !== 'once').forEach(mod => {
      const opt = document.createElement('option');
      opt.value = mod.id;
      opt.textContent = mod.name;
      sel.appendChild(opt);
    });
  };

  const renderHistory = () => {
    renderAnalysis();
    renderRunLog();
  };

  // ---- Analysis section ----
  const renderAnalysis = () => {
    const container = document.getElementById('history-analysis');
    if (!container) return;
    container.innerHTML = '';

    const filterModId = document.getElementById('history-module-select')?.value || '';
    const allRuns = DB.getRuns();
    let modules = DB.getModules().filter(m => m.freq !== 'once');
    if (filterModId) modules = modules.filter(m => m.id === filterModId);

    const hasRuns = modules.some(m => allRuns.some(r => r.moduleId === m.id));
    if (!modules.length || !hasRuns) {
      container.innerHTML = '<div class="dash-none-msg">No history yet — complete a module to start tracking.</div>';
      return;
    }

    modules.forEach(mod => {
      const modRuns = allRuns.filter(r => r.moduleId === mod.id);
      if (!modRuns.length) return;
      container.appendChild(buildModuleCard(mod, modRuns));
    });
  };

  const buildModuleCard = (mod, runs) => {
    const card = document.createElement('div');
    card.className = 'history-analysis-card';

    const runs7  = runsInPeriod(runs, 7);
    const runs30 = runsInPeriod(runs, 30);
    const exp7   = expectedOccurrences(mod, 7);
    const exp30  = expectedOccurrences(mod, 30);
    const avgPct7  = runs7.length  ? Math.round(runs7.reduce((a, r)  => a + r.pct, 0)  / runs7.length)  : null;
    const avgPct30 = runs30.length ? Math.round(runs30.reduce((a, r) => a + r.pct, 0) / runs30.length) : null;

    card.innerHTML = `
      <div class="history-card-header" style="border-left:3px solid ${mod.colour}">
        <div>
          <div class="history-card-title">${UI.escHtml(mod.name)}</div>
          <div class="history-card-freq">${Scheduler.freqLabel(mod)}</div>
        </div>
        <div class="history-period-grid">
          <div class="history-period-col">
            <div class="history-period-label">7 Days</div>
            <div class="history-period-stat" style="color:${avgPct7 != null ? UI.pctColor(avgPct7) : 'var(--text-muted)'}">
              ${avgPct7 != null ? avgPct7 + '%' : '—'}
            </div>
            <div class="history-period-sub">${runs7.length}/${exp7} runs</div>
          </div>
          <div class="history-period-col">
            <div class="history-period-label">30 Days</div>
            <div class="history-period-stat" style="color:${avgPct30 != null ? UI.pctColor(avgPct30) : 'var(--text-muted)'}">
              ${avgPct30 != null ? avgPct30 + '%' : '—'}
            </div>
            <div class="history-period-sub">${runs30.length}/${exp30} runs</div>
          </div>
        </div>
      </div>
    `;

    const taskBreakdown = buildTaskBreakdown(runs7, runs30);
    if (taskBreakdown) card.appendChild(taskBreakdown);

    return card;
  };

  const buildTaskBreakdown = (runs7, runs30) => {
    // Collect unique tasks from run records
    const taskMap = new Map();

    const collect = (runs, period) => {
      runs.forEach(run => {
        (run.taskRecords || []).forEach(tr => {
          if (!taskMap.has(tr.taskId)) {
            taskMap.set(tr.taskId, { ...tr, r7: [], r30: [] });
          }
          taskMap.get(tr.taskId)[`r${period}`].push(tr);
        });
      });
    };
    collect(runs7,  '7');
    collect(runs30, '30');

    if (!taskMap.size) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'history-task-breakdown';

    taskMap.forEach(task => {
      const row = document.createElement('div');
      row.className = 'history-task-row';

      let stats7 = '—', stats30 = '—';

      if (task.type === 'yesno') {
        const done7  = task.r7.filter(r => r.status).length;
        const done30 = task.r30.filter(r => r.status).length;
        const pct7   = task.r7.length  ? Math.round(done7  / task.r7.length  * 100) : null;
        const pct30  = task.r30.length ? Math.round(done30 / task.r30.length * 100) : null;
        stats7  = task.r7.length  ? `${done7}/${task.r7.length} <span style="color:${UI.pctColor(pct7)}">(${pct7}%)</span>` : '—';
        stats30 = task.r30.length ? `${done30}/${task.r30.length} <span style="color:${UI.pctColor(pct30)}">(${pct30}%)</span>` : '—';
      } else {
        const vals7  = task.r7.map(r => r.actualValue).filter(v => v != null);
        const vals30 = task.r30.map(r => r.actualValue).filter(v => v != null);
        const unit   = task.measureLabel ? ` ${task.measureLabel}` : '';
        const avg7   = vals7.length  ? (vals7.reduce((a, v) => a + v, 0)  / vals7.length).toFixed(1) : null;
        const avg30  = vals30.length ? (vals30.reduce((a, v) => a + v, 0) / vals30.length).toFixed(1) : null;

        if (task.hasGoal && task.goalAmount) {
          const cum7   = vals7.length  ? vals7.reduce((a, v) => a + v, 0).toFixed(1)  : null;
          const cum30  = vals30.length ? vals30.reduce((a, v) => a + v, 0).toFixed(1) : null;
          const goal7  = (task.goalAmount * Math.max(task.r7.length,  1)).toFixed(1);
          const goal30 = (task.goalAmount * Math.max(task.r30.length, 1)).toFixed(1);
          stats7  = avg7  != null ? `avg ${avg7}${unit} · ${cum7}/${goal7}${unit}` : '—';
          stats30 = avg30 != null ? `avg ${avg30}${unit} · ${cum30}/${goal30}${unit}` : '—';
        } else {
          stats7  = avg7  != null ? `avg ${avg7}${unit}` : '—';
          stats30 = avg30 != null ? `avg ${avg30}${unit}` : '—';
        }
      }

      const icon = task.type === 'measure' ? '&#128207;' : '&#10004;';
      row.innerHTML = `
        <span class="history-task-icon">${icon}</span>
        <span class="history-task-name">${UI.escHtml(task.taskName)}</span>
        <div class="history-task-stats">
          <span class="history-stat-pill">${stats7}</span>
          <span class="history-stat-pill">${stats30}</span>
        </div>
      `;
      wrapper.appendChild(row);
    });

    return wrapper;
  };

  // ---- Run log section ----
  const renderRunLog = () => {
    const container = document.getElementById('history-run-log');
    if (!container) return;
    container.innerHTML = '';

    const filterModId = document.getElementById('history-module-select')?.value || '';
    let runs = DB.getRuns().sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    if (filterModId) runs = runs.filter(r => r.moduleId === filterModId);

    if (!runs.length) {
      container.innerHTML = '<div class="dash-none-msg">No run records yet.</div>';
      return;
    }

    runs.forEach(run => {
      const pctClr = UI.pctColor(run.pct);
      const row = document.createElement('div');
      row.className = 'run-log-row';
      row.innerHTML = `
        <div class="run-log-info">
          <div class="run-log-name">${UI.escHtml(run.moduleName)}</div>
          <div class="run-log-date">${run.occurrenceDate || run.closedAt?.slice(0,10)} · ${run.completedTasks}/${run.totalTasks} tasks</div>
        </div>
        <span class="run-log-pct" style="color:${pctClr}">${run.pct}%</span>
        <button class="icon-btn run-log-del" title="Delete this record" style="color:var(--rose);font-size:15px">&#128465;</button>
      `;
      row.querySelector('.run-log-del').addEventListener('click', async () => {
        const ok = await UI.confirm('Delete Record', `Delete this run record for "${run.moduleName}"? This cannot be undone.`);
        if (!ok) return;
        DB.deleteRun(run.id);
        renderRunLog();
        renderAnalysis();
      });
      container.appendChild(row);
    });
  };

  return { render, renderHistory };
})();
