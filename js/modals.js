/**
 * modals.js Î“Ã‡Ã¶ All modal open/close/save logic
 * Module editor, Stack editor, Task editor, Module detail view, Measure input
 */

'use strict';

const Modals = (() => {

  // Currently editing IDs
  let editingModuleId = null;
  let editingStackId  = null;
  let editingTaskId   = null;
  let getSelectedColour = null;
  let measureCallback  = null;
  let selectedWeekdays = [];

  // ============================================================
  // GENERIC MODAL HELPERS
  // ============================================================
  const openModal  = (id) => document.getElementById(id).classList.remove('hidden');
  const closeModal = (id) => document.getElementById(id).classList.add('hidden');

  // Close on backdrop click Î“Ã‡Ã¶ set up once per modal
  const bindBackdropClose = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(modalId));
    modal.querySelectorAll('.modal-close').forEach(btn =>
      btn.addEventListener('click', () => closeModal(modalId))
    );
  };

  // ============================================================
  // MODULE EDITOR MODAL
  // ============================================================
  const openEditModule = (moduleId = null) => {
    editingModuleId = moduleId;
    selectedWeekdays = [];
    const isNew = !moduleId;
    const mod   = isNew ? null : DB.getModuleById(moduleId);

    document.getElementById('edit-module-title').textContent = isNew ? 'New Module' : 'Edit Module';
    document.getElementById('mod-name').value        = mod ? mod.name : '';
    document.getElementById('mod-desc').value        = mod ? mod.description : '';
    document.getElementById('mod-freq').value        = mod ? mod.freq : 'once';
    document.getElementById('mod-start-date').value  = mod ? mod.startDate : DB.todayStr();
    document.getElementById('mod-autoclose').value   = mod ? mod.autoclose : 0;
    document.getElementById('mod-active').checked    = mod ? mod.active : true;

    // Time picker
    const hasTime = mod && mod.startTime;
    document.getElementById('mod-allday-btn').classList.toggle('active', !hasTime);
    document.getElementById('mod-starttime-btn').classList.toggle('active', !!hasTime);
    document.getElementById('mod-time-input-wrap').style.display = hasTime ? '' : 'none';
    document.getElementById('mod-start-time').value = hasTime ? mod.startTime : '';

    if (mod && mod.weekdays) selectedWeekdays = [...mod.weekdays];

    // Colour picker
    const colourGetter = UI.renderColourPicker('colour-picker', mod ? mod.colour : UI.COLOURS[0]);
    getSelectedColour = colourGetter;

    // Weekday buttons
    renderWeekdayButtons();
    toggleWeekdayVisibility(document.getElementById('mod-freq').value);

    openModal('modal-edit-module');
    setTimeout(() => document.getElementById('mod-name').focus(), 100);
  };

  const renderWeekdayButtons = () => {
    document.querySelectorAll('.weekday-btn').forEach(btn => {
      const day = parseInt(btn.dataset.day);
      btn.classList.toggle('selected', selectedWeekdays.includes(day));
    });
  };

  const toggleWeekdayVisibility = (freq) => {
    const show = freq === 'weekly' || freq === 'biweekly';
    document.getElementById('mod-weekday-group').style.display = show ? '' : 'none';
  };

  const saveModule = () => {
    const name = document.getElementById('mod-name').value.trim();
    if (!name) { UI.toast('Please enter a module name'); return; }

    const isAllDay = document.getElementById('mod-allday-btn').classList.contains('active');
    const data = {
      name,
      description: document.getElementById('mod-desc').value.trim(),
      colour:      getSelectedColour ? getSelectedColour() : UI.COLOURS[0],
      freq:        document.getElementById('mod-freq').value,
      startDate:   document.getElementById('mod-start-date').value,
      autoclose:   parseInt(document.getElementById('mod-autoclose').value) || 0,
      active:      document.getElementById('mod-active').checked,
      weekdays:    selectedWeekdays,
      startTime:   isAllDay ? null : (document.getElementById('mod-start-time').value || null),
    };

    if (editingModuleId) {
      DB.updateModule(editingModuleId, data);
      UI.toast('Module updated');
    } else {
      DB.addModule(data);
      UI.toast('Module created');
    }

    closeModal('modal-edit-module');
    App.refreshAll();
  };

  // ============================================================
  // MODULE DETAIL MODAL
  // ============================================================
  const openModuleDetail = (moduleId) => {
    UI.state.activeModuleId = moduleId;
    refreshModuleDetail(moduleId);
    openModal('modal-module-detail');
  };

  const refreshModuleDetail = (moduleId) => {
    moduleId = moduleId || UI.state.activeModuleId;
    if (!moduleId) return;
    const mod = DB.getModuleById(moduleId);
    if (!mod) return;

    document.getElementById('module-detail-title').textContent = mod.name;
    document.getElementById('module-detail-title').style.color = mod.colour;

    // Meta bar
    const meta = document.getElementById('module-detail-meta');
    const stats = DB.getModuleCompletionStats(moduleId);
    meta.innerHTML = `
      <span class="meta-chip">${Scheduler.freqLabel(mod)}</span>
      <span class="meta-chip" style="color:${UI.pctColor(stats.pct)}">${stats.done}/${stats.total} done</span>
      ${mod.autoclose === 0 ? '<span class="meta-chip">Closes EOD</span>' : `<span class="meta-chip">Auto-close +${mod.autoclose}d</span>`}
      ${!mod.active ? '<span class="meta-chip" style="color:var(--rose)">Î“Ã…â•£ Stopped</span>' : ''}
    `;

    // Body Î“Ã‡Ã¶ stacks and tasks
    const body = document.getElementById('module-detail-body');
    body.innerHTML = '';

    const stacks = DB.getStacksByModule(moduleId);
    const allTasks = DB.getTasksByModule(moduleId);

    stacks.forEach(stack => {
      const section = document.createElement('div');
      section.className = 'stack-section';

      const stackTasks = allTasks.filter(t => t.stackId === stack.id)
                                  .sort((a, b) => a.rank - b.rank);

      section.innerHTML = `
        <div class="stack-header">
          <span class="stack-name-label">${UI.escHtml(stack.name)}</span>
          <div style="display:flex;gap:6px">
            <button class="icon-btn" style="font-size:13px;color:var(--text-muted)" data-edit-stack="${stack.id}">Î“Â£Ã…âˆ©â••Ã…</button>
            <button class="icon-btn" style="font-size:13px;color:var(--rose)" data-delete-stack="${stack.id}">â‰¡Æ’Ã¹Ã¦</button>
          </div>
        </div>
      `;

      stackTasks.forEach((task, i) => {
        section.appendChild(buildSubtaskRow(task, i + 1, moduleId));
      });

      // Add subtask button
      const addBtn = document.createElement('button');
      addBtn.className = 'secondary-btn';
      addBtn.style.cssText = 'font-size:12px;height:30px;margin-top:4px;width:100%';
      addBtn.textContent = '+ Add Subtask';
      addBtn.dataset.addTaskToStack = stack.id;
      section.appendChild(addBtn);

      body.appendChild(section);
    });

    // Standalone tasks within the module (no stackId)
    const standaloneTasks = allTasks.filter(t => !t.stackId).sort((a, b) => a.rank - b.rank);
    if (standaloneTasks.length > 0) {
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = 'Module Tasks';
      body.appendChild(label);

      standaloneTasks.forEach((task, i) => {
        body.appendChild(buildSubtaskRow(task, null, moduleId));
      });
    }

    if (stacks.length === 0 && standaloneTasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-icon">â‰¡Æ’Ã´Â¡</div><p>No stacks or tasks yet.<br>Add some below!</p>';
      body.appendChild(empty);
    }

    // Wire up stack edit/delete buttons
    body.querySelectorAll('[data-edit-stack]').forEach(btn => {
      btn.addEventListener('click', () => openEditStack(btn.dataset.editStack, moduleId));
    });
    body.querySelectorAll('[data-delete-stack]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await UI.confirm('Delete Stack', 'This will detach all its tasks from the stack (they stay in the module). Continue?');
        if (!ok) return;
        DB.deleteStack(btn.dataset.deleteStack);
        refreshModuleDetail(moduleId);
        App.refreshAll();
      });
    });
    body.querySelectorAll('[data-add-task-to-stack]').forEach(btn => {
      btn.addEventListener('click', () => openAddTask(moduleId, btn.dataset.addTaskToStack));
    });
  };

  const buildSubtaskRow = (task, rankDisplay, moduleId) => {
    const row = document.createElement('div');
    row.className = 'subtask-row' + (task.status ? ' done' : '');
    row.innerHTML = `
      <div class="check-ring${task.status ? ' checked' : ''}" data-task-check="${task.id}"></div>
      ${rankDisplay !== null ? `<span class="subtask-rank">${rankDisplay}.</span>` : ''}
      <span class="subtask-name">${UI.escHtml(task.name)}</span>
      ${task.type === 'measure' && task.measureValue !== null ? `<span class="measure-value-badge">${task.measureValue}${task.measureLabel ? ' ' + task.measureLabel : ''}</span>` : ''}
      ${task.type === 'measure' ? `<button class="icon-btn" style="font-size:13px;color:var(--purple)" data-task-measure="${task.id}" data-unit="${UI.escHtml(task.measureLabel)}">â‰¡Æ’Ã´Ã…</button>` : ''}
      <button class="subtask-edit-btn" data-edit-task="${task.id}">Î“Â£Ã…âˆ©â••Ã…</button>
      <button class="icon-btn" style="font-size:12px;color:var(--rose);opacity:0.6" data-delete-task="${task.id}">Î“Â£Ã²</button>
    `;

    // Check toggle
    row.querySelector(`[data-task-check]`).addEventListener('click', () => {
      DB.updateTask(task.id, { status: !task.status });
      refreshModuleDetail(moduleId);
      App.refreshDashboard();
    });

    // Measure input
    const measureBtn = row.querySelector('[data-task-measure]');
    if (measureBtn) {
      measureBtn.addEventListener('click', () => {
        openMeasure(task.id, task.measureLabel, task.measureValue, () => {
          refreshModuleDetail(moduleId);
          App.refreshDashboard();
        });
      });
    }

    // Edit task
    row.querySelector('[data-edit-task]').addEventListener('click', () => openEditTask(task.id, moduleId));

    // Delete task
    row.querySelector('[data-delete-task]').addEventListener('click', async () => {
      const ok = await UI.confirm('Delete Task', `Delete "${task.name}"?`);
      if (!ok) return;
      DB.deleteTask(task.id);
      refreshModuleDetail(moduleId);
      App.refreshAll();
    });

    return row;
  };

  // ============================================================
  // STACK EDITOR MODAL
  // ============================================================
  const openEditStack = (stackId = null, moduleId = null) => {
    editingStackId = stackId;
    const isNew  = !stackId;
    const stack  = isNew ? null : DB.getStacks().find(s => s.id === stackId);
    const modId  = moduleId || (stack ? stack.moduleId : null);

    document.getElementById('edit-stack-title').textContent = isNew ? 'New Stack' : 'Edit Stack';
    document.getElementById('stack-name').value  = stack ? stack.name : '';
    document.getElementById('stack-rank').value  = stack ? stack.rank : (DB.getStacksByModule(modId).length + 1);

    // Store moduleId for save
    document.getElementById('modal-edit-stack').dataset.moduleId = modId || '';
    openModal('modal-edit-stack');
    setTimeout(() => document.getElementById('stack-name').focus(), 100);
  };

  const saveStack = () => {
    const name = document.getElementById('stack-name').value.trim();
    if (!name) { UI.toast('Please enter a stack name'); return; }
    const rank = parseInt(document.getElementById('stack-rank').value) || 1;
    const moduleId = document.getElementById('modal-edit-stack').dataset.moduleId || null;

    if (editingStackId) {
      DB.updateStack(editingStackId, { name, rank });
      UI.toast('Stack updated');
    } else {
      DB.addStack({ name, rank, moduleId });
      UI.toast('Stack added');
    }

    closeModal('modal-edit-stack');
    if (moduleId) refreshModuleDetail(moduleId);
    App.refreshAll();
  };

  // ============================================================
  // TASK EDITOR MODAL
  // ============================================================
  const openAddTask = (moduleId = null, stackId = null) => {
    editingTaskId = null;
    prepareTaskModal(null, moduleId, stackId);
    openModal('modal-edit-task');
    setTimeout(() => document.getElementById('task-name').focus(), 100);
  };

  const openEditTask = (taskId, moduleId = null) => {
    editingTaskId = taskId;
    prepareTaskModal(taskId, moduleId, null);
    openModal('modal-edit-task');
  };

  const openAddStandaloneTask = () => {
    editingTaskId = null;
    prepareTaskModal(null, null, null, true);
    openModal('modal-edit-task');
    setTimeout(() => document.getElementById('task-name').focus(), 100);
  };

  const prepareTaskModal = (taskId, moduleId, stackId, standalone = false) => {
    const task   = taskId ? DB.getTasks().find(t => t.id === taskId) : null;
    const modId  = task ? task.moduleId : moduleId;

    document.getElementById('edit-task-title').textContent = task ? 'Edit Task' : 'New Task';
    document.getElementById('task-name').value          = task ? task.name : '';
    document.getElementById('task-type').value          = task ? task.type : 'yesno';
    document.getElementById('task-rank').value          = task ? task.rank : 1;
    document.getElementById('task-measure-label').value = task ? (task.measureLabel || '') : '';

    // Set visibility of measure label
    toggleMeasureLabelVisibility(task ? task.type : 'yesno');

    // Populate stack select
    const stackSel = document.getElementById('task-stack');
    stackSel.innerHTML = '<option value="">Î“Ã‡Ã¶ No Stack (standalone in module) Î“Ã‡Ã¶</option>';
    if (modId) {
      const stacks = DB.getStacksByModule(modId);
      stacks.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        if ((task && task.stackId === s.id) || (!task && stackId === s.id)) opt.selected = true;
        stackSel.appendChild(opt);
      });
    }

    document.getElementById('modal-edit-task').dataset.moduleId = modId || '';
    document.getElementById('modal-edit-task').dataset.standalone = standalone ? 'true' : '';

    // Show/hide stack and rank for standalone tasks (new or editing existing)
    const isStandalone = standalone || (!modId && !task?.moduleId);
    document.getElementById('task-stack-group').style.display = isStandalone ? 'none' : '';
    document.getElementById('task-rank-group').style.display  = isStandalone ? 'none' : '';

    // Goal toggle (measure tasks only)
    const hasGoal = !!(task && task.optGoal);
    document.getElementById('task-nogoal-btn').classList.toggle('active', !hasGoal);
    document.getElementById('task-hasgoal-btn').classList.toggle('active', hasGoal);
    document.getElementById('task-goal-wrap').style.display = hasGoal ? '' : 'none';
    document.getElementById('task-goal-amount').value = (task && task.goalAmount != null) ? task.goalAmount : '';
    document.getElementById('task-goal-unit-label').textContent = task ? (task.measureLabel || '') : '';
  };

  const toggleMeasureLabelVisibility = (type) => {
    const isMeasure = type === 'measure';
    document.getElementById('task-measure-label-group').style.display = isMeasure ? '' : 'none';
    document.getElementById('task-goal-group').style.display          = isMeasure ? '' : 'none';
  };

  const saveTask = () => {
    const name = document.getElementById('task-name').value.trim();
    if (!name) { UI.toast('Please enter a task name'); return; }

    const moduleId  = document.getElementById('modal-edit-task').dataset.moduleId || null;
    const stackId   = document.getElementById('task-stack').value || null;
    const type      = document.getElementById('task-type').value;
    const rank      = parseInt(document.getElementById('task-rank').value) || 1;
    const mLabel    = document.getElementById('task-measure-label').value.trim();
    const optGoal   = type === 'measure' && document.getElementById('task-hasgoal-btn').classList.contains('active');
    const goalAmount = optGoal ? (parseFloat(document.getElementById('task-goal-amount').value) || null) : null;

    const payload = { name, type, rank, stackId: stackId || null, moduleId: moduleId || null, measureLabel: mLabel, optGoal, goalAmount };

    if (editingTaskId) {
      DB.updateTask(editingTaskId, payload);
      UI.toast('Task updated');
    } else {
      DB.addTask(payload);
      UI.toast('Task added');
    }

    closeModal('modal-edit-task');
    if (moduleId) refreshModuleDetail(moduleId);
    App.refreshAll();
  };

  // ============================================================
  // MEASURE INPUT MODAL
  // ============================================================
  const openMeasure = (taskId, unit, currentVal, callback) => {
    measureCallback = callback;
    document.getElementById('measure-title').textContent = 'Enter ' + (unit || 'Measurement');
    document.getElementById('measure-input').value = currentVal || '';
    document.getElementById('measure-unit-label').textContent = unit || '';
    document.getElementById('modal-measure').dataset.taskId = taskId;
    openModal('modal-measure');
    setTimeout(() => document.getElementById('measure-input').focus(), 100);
  };

  const saveMeasure = () => {
    const taskId = document.getElementById('modal-measure').dataset.taskId;
    const val = parseFloat(document.getElementById('measure-input').value);
    if (isNaN(val)) { UI.toast('Enter a valid number'); return; }
    DB.updateTask(taskId, { measureValue: Math.round(val * 10) / 10, status: true });
    closeModal('modal-measure');
    UI.toast('Measurement saved');
    if (measureCallback) measureCallback();
  };

  // ============================================================
  // QUICK ADD MODAL
  // ============================================================
  const openQuickAdd = () => openModal('modal-quick-add');

  // ============================================================
  // INIT Î“Ã‡Ã¶ bind all modal events
  // ============================================================
  const init = () => {
    // Backdrop / close buttons
    ['modal-edit-module', 'modal-edit-stack', 'modal-edit-task',
     'modal-quick-add', 'modal-measure', 'modal-module-detail'].forEach(bindBackdropClose);

    // Weekday buttons
    document.querySelectorAll('.weekday-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = parseInt(btn.dataset.day);
        if (selectedWeekdays.includes(day)) {
          selectedWeekdays = selectedWeekdays.filter(d => d !== day);
        } else {
          selectedWeekdays.push(day);
        }
        renderWeekdayButtons();
      });
    });

    // Freq select Î“Ã‡Ã¶ show/hide weekday selector
    document.getElementById('mod-freq').addEventListener('change', (e) => {
      toggleWeekdayVisibility(e.target.value);
    });

    // Time picker toggle
    document.getElementById('mod-allday-btn').addEventListener('click', () => {
      document.getElementById('mod-allday-btn').classList.add('active');
      document.getElementById('mod-starttime-btn').classList.remove('active');
      document.getElementById('mod-time-input-wrap').style.display = 'none';
    });
    document.getElementById('mod-starttime-btn').addEventListener('click', () => {
      document.getElementById('mod-allday-btn').classList.remove('active');
      document.getElementById('mod-starttime-btn').classList.add('active');
      document.getElementById('mod-time-input-wrap').style.display = '';
      setTimeout(() => document.getElementById('mod-start-time').focus(), 50);
    });

    // Save module
    document.getElementById('save-module-btn').addEventListener('click', saveModule);

    // Save stack
    document.getElementById('save-stack-btn').addEventListener('click', saveStack);

    // Save task
    document.getElementById('save-task-btn').addEventListener('click', saveTask);

    // Task type change
    document.getElementById('task-type').addEventListener('change', (e) => {
      toggleMeasureLabelVisibility(e.target.value);
    });

    // Measure label Î“Ã¥Ã† sync to goal unit label
    document.getElementById('task-measure-label').addEventListener('input', (e) => {
      document.getElementById('task-goal-unit-label').textContent = e.target.value;
    });

    // Goal toggle
    document.getElementById('task-nogoal-btn').addEventListener('click', () => {
      document.getElementById('task-nogoal-btn').classList.add('active');
      document.getElementById('task-hasgoal-btn').classList.remove('active');
      document.getElementById('task-goal-wrap').style.display = 'none';
    });
    document.getElementById('task-hasgoal-btn').addEventListener('click', () => {
      document.getElementById('task-nogoal-btn').classList.remove('active');
      document.getElementById('task-hasgoal-btn').classList.add('active');
      document.getElementById('task-goal-wrap').style.display = '';
      setTimeout(() => document.getElementById('task-goal-amount').focus(), 50);
    });

    // Measure save
    document.getElementById('measure-save-btn').addEventListener('click', saveMeasure);

    // Module detail Î“Ã‡Ã¶ edit / add stack / add task buttons
    document.getElementById('module-detail-edit-btn').addEventListener('click', () => {
      openEditModule(UI.state.activeModuleId);
    });
    document.getElementById('add-stack-btn').addEventListener('click', () => {
      openEditStack(null, UI.state.activeModuleId);
    });
    document.getElementById('add-task-to-module-btn').addEventListener('click', () => {
      openAddTask(UI.state.activeModuleId, null);
    });

    // Quick add cards
    document.getElementById('qa-module').addEventListener('click', () => {
      closeModal('modal-quick-add');
      openEditModule(null);
    });
    document.getElementById('qa-task').addEventListener('click', () => {
      closeModal('modal-quick-add');
      openAddStandaloneTask();
    });

    // Mod active checkbox label update
    document.getElementById('mod-active').addEventListener('change', (e) => {
      document.getElementById('mod-active-label').textContent =
        e.target.checked ? 'Active (repeating)' : 'Stopped (no longer repeats)';
    });
  };

  return {
    init,
    openEditModule, openModuleDetail, refreshModuleDetail,
    openEditStack, openEditTask, openAddTask, openAddStandaloneTask,
    openMeasure, openQuickAdd,
    closeModal, openModal,
  };
})();

