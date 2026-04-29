/**
 * db.js ΓÇö Data layer for Pyro Lagoon
 * All data persisted to localStorage as JSON.
 *
 * Data model:
 *   modules[]   ΓÇö Module objects
 *   stacks[]    ΓÇö Stack objects (linked to a module)
 *   tasks[]     ΓÇö Task/subtask objects (linked to stack and/or module)
 *   runs[]      ΓÇö Historical run records (snapshots when a module closes)
 */

'use strict';

const DB = (() => {

  const KEYS = {
    modules: 'pl_modules',
    stacks:  'pl_stacks',
    tasks:   'pl_tasks',
    runs:    'pl_runs',
  };

  // ---- Low-level helpers ----
  const load = (key) => JSON.parse(localStorage.getItem(key) || '[]');
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
  const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now  = () => new Date().toISOString();

  // ---- Modules ----
  // {
  //   id, name, description, colour, freq, startDate,
  //   weekdays (array of 0-6 for weekly), autoclose (days, 0=EOD),
  //   active (bool, if false = stopped repeating), createdAt, updatedAt
  // }

  const getModules = () => load(KEYS.modules);
  const saveModules = (arr) => save(KEYS.modules, arr);

  const addModule = (data) => {
    const modules = getModules();
    const m = {
      id:          uid(),
      name:        data.name || 'Untitled Module',
      description: data.description || '',
      colour:      data.colour || '#f97316',
      freq:        data.freq || 'once',
      startDate:   data.startDate || todayStr(),
      weekdays:    data.weekdays || [],
      autoclose:   data.autoclose ?? 0,
      active:      data.active ?? true,
      startTime:   data.startTime || null,
      createdAt:   now(),
      updatedAt:   now(),
    };
    modules.push(m);
    saveModules(modules);
    return m;
  };

  const updateModule = (id, changes) => {
    const modules = getModules();
    const idx = modules.findIndex(m => m.id === id);
    if (idx === -1) return null;
    modules[idx] = { ...modules[idx], ...changes, updatedAt: now() };
    saveModules(modules);
    return modules[idx];
  };

  const deleteModule = (id) => {
    // Cascade: delete stacks and tasks
    const stacks = getStacks().filter(s => s.moduleId !== id);
    save(KEYS.stacks, stacks);
    const tasks = getTasks().filter(t => t.moduleId !== id);
    save(KEYS.tasks, tasks);
    const modules = getModules().filter(m => m.id !== id);
    saveModules(modules);
  };

  const getModuleById = (id) => getModules().find(m => m.id === id) || null;

  // ---- Stacks ----
  // {
  //   id, name, moduleId, rank, status (bool), createdAt, updatedAt
  // }

  const getStacks = () => load(KEYS.stacks);
  const saveStacks = (arr) => save(KEYS.stacks, arr);

  const addStack = (data) => {
    const stacks = getStacks();
    const s = {
      id:        uid(),
      name:      data.name || 'Untitled Stack',
      moduleId:  data.moduleId || null,
      rank:      data.rank ?? 1,
      status:    false, // not completed
      createdAt: now(),
      updatedAt: now(),
    };
    stacks.push(s);
    saveStacks(stacks);
    return s;
  };

  const updateStack = (id, changes) => {
    const stacks = getStacks();
    const idx = stacks.findIndex(s => s.id === id);
    if (idx === -1) return null;
    stacks[idx] = { ...stacks[idx], ...changes, updatedAt: now() };
    saveStacks(stacks);
    return stacks[idx];
  };

  const deleteStack = (id) => {
    // Move tasks to standalone within module (detach from stack but keep module)
    const tasks = getTasks().map(t => {
      if (t.stackId === id) return { ...t, stackId: null };
      return t;
    });
    save(KEYS.tasks, tasks);
    save(KEYS.stacks, getStacks().filter(s => s.id !== id));
  };

  const getStacksByModule = (moduleId) =>
    getStacks().filter(s => s.moduleId === moduleId).sort((a, b) => a.rank - b.rank);

  // ---- Tasks ----
  // {
  //   id, name, moduleId (nullable), stackId (nullable),
  //   rank, status (bool), type ('yesno'|'measure'),
  //   measureLabel, measureValue (number|null),
  //   createdAt, updatedAt
  // }

  const getTasks = () => load(KEYS.tasks);
  const saveTasks = (arr) => save(KEYS.tasks, arr);

  const addTask = (data) => {
    const tasks = getTasks();
    const t = {
      id:           uid(),
      name:         data.name || 'Untitled Task',
      moduleId:     data.moduleId || null,
      stackId:      data.stackId || null,
      rank:         data.rank ?? 1,
      status:       false,
      type:         data.type || 'yesno',
      measureLabel: data.measureLabel || '',
      measureValue: null,
      optGoal:      data.optGoal    ?? false,
      goalAmount:   data.goalAmount ?? null,
      createdAt:    now(),
      updatedAt:    now(),
    };
    tasks.push(t);
    saveTasks(tasks);
    return t;
  };

  const updateTask = (id, changes) => {
    const tasks = getTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...changes, updatedAt: now() };
    saveTasks(tasks);
    return tasks[idx];
  };

  const deleteTask = (id) => {
    save(KEYS.tasks, getTasks().filter(t => t.id !== id));
  };

  const getTasksByModule = (moduleId) =>
    getTasks().filter(t => t.moduleId === moduleId).sort((a, b) => a.rank - b.rank);

  const getTasksByStack = (stackId) =>
    getTasks().filter(t => t.stackId === stackId).sort((a, b) => a.rank - b.rank);

  const getStandaloneTasks = () =>
    getTasks().filter(t => !t.moduleId && !t.stackId).sort((a, b) => a.rank - b.rank);

  // ---- Runs (historical records) ----
  // {
  //   id, moduleId, moduleName, closedAt,
  //   totalTasks, completedTasks, pct
  // }

  const getRuns = () => load(KEYS.runs);
  const saveRuns = (arr) => save(KEYS.runs, arr);

  const addRun = (moduleId, moduleName, totalTasks, completedTasks, occurrenceDate, taskRecords) => {
    const runs = getRuns();
    const r = {
      id:             uid(),
      moduleId,
      moduleName,
      occurrenceDate: occurrenceDate || null,
      closedAt:       now(),
      totalTasks,
      completedTasks,
      pct:            totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100,
      taskRecords:    taskRecords || [],
    };
    runs.push(r);
    saveRuns(runs);
    return r;
  };

  const getRunsByModule = (moduleId) =>
    getRuns().filter(r => r.moduleId === moduleId)
             .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));

  const deleteRun          = (id)       => saveRuns(getRuns().filter(r => r.id !== id));
  const deleteRunsByModule = (moduleId) => saveRuns(getRuns().filter(r => r.moduleId !== moduleId));
  const deleteAllRuns      = ()         => saveRuns([]);

  // On-load migration: patch existing records to add new fields gracefully
  const migrateData = () => {
    const tasks = getTasks().map(t => ({
      ...t,
      optGoal:    t.optGoal    ?? false,
      goalAmount: t.goalAmount ?? null,
    }));
    saveTasks(tasks);
    const runs = getRuns().map(r => ({
      ...r,
      occurrenceDate: r.occurrenceDate ?? null,
      taskRecords:    r.taskRecords    ?? [],
    }));
    saveRuns(runs);
  };

  // ---- Utility ----
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const exportData = () => JSON.stringify({
    modules: getModules(),
    stacks:  getStacks(),
    tasks:   getTasks(),
    runs:    getRuns(),
    exportedAt: now(),
  }, null, 2);

  const importData = (json) => {
    try {
      const d = JSON.parse(json);
      if (d.modules) saveModules(d.modules);
      if (d.stacks)  saveStacks(d.stacks);
      if (d.tasks)   saveTasks(d.tasks);
      if (d.runs)    saveRuns(d.runs);
      return true;
    } catch(e) { return false; }
  };

  const clearAll = () => {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  };

  // Module completion helpers
  const getModuleCompletionStats = (moduleId) => {
    const tasks = getTasksByModule(moduleId);
    const total = tasks.length;
    const done  = tasks.filter(t => t.status).length;
    return { total, done, pct: total > 0 ? Math.round((done/total)*100) : 100 };
  };

  return {
    getModules, addModule, updateModule, deleteModule, getModuleById,
    getStacks, addStack, updateStack, deleteStack, getStacksByModule,
    getTasks, addTask, updateTask, deleteTask,
    getTasksByModule, getTasksByStack, getStandaloneTasks,
    getRuns, addRun, getRunsByModule, deleteRun, deleteRunsByModule, deleteAllRuns,
    todayStr, exportData, importData, clearAll, getModuleCompletionStats,
    migrateData, uid,
  };
})();
