/**
 * scheduler.js ΓÇö Handles module recurrence logic
 *
 * Determines which modules should be "active" today (i.e., visible as Today items),
 * which are Future, and handles auto-close triggering + run record creation.
 */

'use strict';

const Scheduler = (() => {

  // Return today as a Date at midnight local time
  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Parse a YYYY-MM-DD string to a local midnight Date
  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // Format a Date to YYYY-MM-DD
  const fmtDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Day-of-week name short
  const dayName = (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];

  /**
   * Given a module, compute the next occurrence date ON or AFTER `fromDate`.
   * Returns a Date or null for one-time modules that have passed.
   */
  const nextOccurrence = (mod, fromDate) => {
    const start = parseDate(mod.startDate);
    if (!start) return null;
    const from = fromDate || today();

    switch (mod.freq) {
      case 'once':
        return start >= from ? start : null;

      case 'daily': {
        const d = new Date(Math.max(start, from));
        d.setHours(0,0,0,0);
        return d;
      }

      case 'weekly': {
        if (!mod.weekdays || mod.weekdays.length === 0) {
          // Default: same day-of-week as startDate
          let d = new Date(Math.max(start, from));
          d.setHours(0,0,0,0);
          const targetDay = start.getDay();
          while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
          return d;
        }
        // Find next matching weekday
        let d = new Date(Math.max(start, from));
        d.setHours(0,0,0,0);
        for (let i = 0; i < 8; i++) {
          if (mod.weekdays.includes(d.getDay())) return d;
          d.setDate(d.getDate() + 1);
        }
        return null;
      }

      case 'biweekly': {
        let d = new Date(start);
        d.setHours(0,0,0,0);
        while (d < from) d.setDate(d.getDate() + 14);
        return d;
      }

      case 'monthly': {
        let d = new Date(start);
        d.setHours(0,0,0,0);
        while (d < from) d.setMonth(d.getMonth() + 1);
        return d;
      }

      default:
        return null;
    }
  };

  /**
   * Returns all dates (as YYYY-MM-DD strings) on which a module has recurred,
   * from startDate up to and including today. Used for run-record mapping.
   */
  const allOccurrencesDates = (mod) => {
    const start = parseDate(mod.startDate);
    if (!start) return [];
    const t = today();
    const dates = [];

    if (mod.freq === 'once') {
      if (start <= t) dates.push(fmtDate(start));
      return dates;
    }

    let cursor = new Date(start);
    cursor.setHours(0,0,0,0);
    let safety = 0;

    while (cursor <= t && safety < 500) {
      safety++;
      if (mod.freq === 'daily') {
        dates.push(fmtDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      } else if (mod.freq === 'weekly') {
        if (!mod.weekdays || mod.weekdays.length === 0) {
          dates.push(fmtDate(cursor));
          cursor.setDate(cursor.getDate() + 7);
        } else {
          if (mod.weekdays.includes(cursor.getDay())) {
            dates.push(fmtDate(cursor));
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      } else if (mod.freq === 'biweekly') {
        dates.push(fmtDate(cursor));
        cursor.setDate(cursor.getDate() + 14);
      } else if (mod.freq === 'monthly') {
        dates.push(fmtDate(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return dates;
  };

  /**
   * Determine the auto-close deadline for a module given its occurrence date.
   * Returns a Date.
   */
  const autocloseDeadline = (mod, occurrenceDate) => {
    const d = new Date(occurrenceDate);
    d.setHours(0,0,0,0);
    if (mod.autoclose === 0) {
      // End of day on occurrence date
      d.setHours(23, 59, 59, 999);
    } else {
      d.setDate(d.getDate() + mod.autoclose);
      d.setHours(23, 59, 59, 999);
    }
    return d;
  };

  /**
   * Classifies all modules into: today, future, complete, archived.
   * Also handles auto-close: if deadline passed, marks complete.
   * Returns { today: [...], future: [...], complete: [...] }
   * Each item: { module, occurrenceDate (str), deadline (Date), pct, autoCloseTriggered }
   */
  const classifyModules = () => {
    const modules = DB.getModules();
    const t = today();
    const todayItems   = [];
    const futureItems  = [];
    const completeItems = [];

    for (const mod of modules) {
      if (!mod.active && mod.freq === 'once') {
        // Stopped + one-time: skip
        continue;
      }

      const start = parseDate(mod.startDate);
      if (!start) continue;

      // For stopped repeating modules, only show existing runs, no new occurrences
      if (!mod.active && mod.freq !== 'once') {
        continue; // Will appear in history only
      }

      const occ = nextOccurrence(mod, t);

      if (!occ) {
        // Past one-time or no more occurrences
        const stats = DB.getModuleCompletionStats(mod.id);
        completeItems.push({ module: mod, occurrenceDate: mod.startDate, pct: stats.pct });
        continue;
      }

      const occStr     = fmtDate(occ);
      const deadline   = autocloseDeadline(mod, occ);
      const stats      = DB.getModuleCompletionStats(mod.id);
      const now        = new Date();
      const isToday    = fmtDate(occ) === fmtDate(t);
      const isPast     = occ < t;

      // Check if all tasks are already done (module self-completes)
      const allDone = stats.total > 0 && stats.done === stats.total;

      // Auto-close check
      const autoCloseTriggered = now > deadline;

      if (allDone || autoCloseTriggered) {
        completeItems.push({
          module: mod, occurrenceDate: occStr,
          deadline, pct: stats.pct, autoCloseTriggered
        });
      } else if (isToday || isPast) {
        todayItems.push({ module: mod, occurrenceDate: occStr, deadline, pct: stats.pct });
      } else {
        // Future
        const daysUntil = Math.ceil((occ - t) / (1000*60*60*24));
        futureItems.push({ module: mod, occurrenceDate: occStr, deadline, pct: stats.pct, daysUntil });
      }
    }

    const timeSort = (a, b) => {
      const aT = a.module.startTime || null;
      const bT = b.module.startTime || null;
      if (aT && !bT) return -1;
      if (!aT && bT) return 1;
      if (aT && bT) return aT.localeCompare(bT);
      return a.module.name.localeCompare(b.module.name);
    };

    todayItems.sort(timeSort);
    futureItems.sort((a, b) => {
      const dd = (a.daysUntil || 0) - (b.daysUntil || 0);
      if (dd !== 0) return dd;
      const aT = a.module.startTime || null, bT = b.module.startTime || null;
      if (aT && !bT) return -1; if (!aT && bT) return 1;
      if (aT && bT) return aT.localeCompare(bT);
      return a.module.name.localeCompare(b.module.name);
    });
    completeItems.sort((a, b) => new Date(b.occurrenceDate) - new Date(a.occurrenceDate));

    // Prune completed items older than 3 days from display
    const threeDaysAgo = new Date(t);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const visibleComplete = completeItems.filter(item => {
      const d = parseDate(item.occurrenceDate);
      return d && d >= threeDaysAgo;
    });

    return { today: todayItems, future: futureItems, complete: visibleComplete };
  };

  /**
   * Classify standalone tasks (no moduleId).
   */
  const classifyStandaloneTasks = () => {
    const tasks = DB.getStandaloneTasks();
    return {
      active:   tasks.filter(t => !t.status),
      complete: tasks.filter(t => t.status),
    };
  };

  /**
   * Close a module occurrence: snapshot all tasks, record run, reset statuses.
   */
  const closeModuleOccurrence = (mod, occurrenceDateStr) => {
    const tasks  = DB.getTasksByModule(mod.id);
    const stacks = DB.getStacksByModule(mod.id);

    // Build per-task snapshot BEFORE resetting
    const taskRecords = tasks.map(task => {
      const stack = stacks.find(s => s.id === task.stackId) || null;
      return {
        taskId:       task.id,
        taskName:     task.name,
        stackId:      task.stackId   || null,
        stackName:    stack ? stack.name : null,
        type:         task.type,
        status:       task.status,
        measureLabel: task.measureLabel || '',
        actualValue:  task.measureValue,
        hasGoal:      task.optGoal    || false,
        goalAmount:   task.optGoal ? (task.goalAmount || null) : null,
      };
    });

    const totalTasks     = tasks.length;
    const completedTasks = tasks.filter(t => t.status).length;
    const dateForRun     = occurrenceDateStr || fmtDate(today());

    DB.addRun(mod.id, mod.name, totalTasks, completedTasks, dateForRun, taskRecords);

    if (mod.freq !== 'once' && mod.active) {
      tasks.forEach(t => DB.updateTask(t.id, { status: false, measureValue: null }));
    }
  };


  /**
   * processPendingResets ΓÇö called on app load and every minute.
   *
   * Fixes the rollover gap: for repeating modules, `classifyModules` always
   * shows the NEXT upcoming occurrence, so once a weekly/monthly deadline
   * passes the module jumps straight to "Future" and the old
   * checkAutoClose pipeline never fires. This function independently walks
   * every repeating module's past occurrences and closes any whose deadline
   * has passed but has no run record yet.
   */
  const processPendingResets = () => {
    const now     = new Date();
    const modules = DB.getModules().filter(m => m.active && m.freq !== 'once');

    modules.forEach(mod => {
      // All past occurrence dates up to and including today
      const allDates = allOccurrencesDates(mod);
      if (!allDates.length) return;

      // Walk backwards ΓÇö find the most recent past occurrence whose deadline has passed
      for (let i = allDates.length - 1; i >= 0; i--) {
        const occStr    = allDates[i];
        const occDate   = parseDate(occStr);
        const deadline  = autocloseDeadline(mod, occDate);

        if (now <= deadline) continue; // Deadline not yet reached for this occurrence

        // Deadline has passed ΓÇö check if we already have a run for this occurrence
        const runs = DB.getRunsByModule(mod.id);
        const alreadyClosed = runs.some(r => r.occurrenceDate === occStr);

        if (!alreadyClosed) {
          closeModuleOccurrence(mod, occStr);
        }
        break; // Only need to handle the most recent past occurrence
      }
    });
  };


  // Frequency display strings
  const freqLabel = (mod) => {
    switch (mod.freq) {
      case 'once':     return 'One-time';
      case 'daily':    return 'Daily';
      case 'weekly': {
        if (mod.weekdays && mod.weekdays.length > 0) {
          const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          return 'Weekly ┬╖ ' + mod.weekdays.map(d => names[d]).join(', ');
        }
        const start = parseDate(mod.startDate);
        return start ? 'Weekly ┬╖ ' + dayName(start) : 'Weekly';
      }
      case 'biweekly': return 'Bi-weekly';
      case 'monthly':  return 'Monthly';
      default:         return mod.freq;
    }
  };

  const friendlyDate = (str) => {
    if (!str) return '';
    const d = parseDate(str);
    if (!d) return str;
    const t = today();
    const diff = Math.round((d - t) / (1000*60*60*24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    if (diff < 7) return `In ${diff}d ┬╖ ${d.toLocaleDateString('en-CA', { weekday: 'short' })}`;
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  return {
    classifyModules, classifyStandaloneTasks,
    nextOccurrence, autocloseDeadline, closeModuleOccurrence,
    allOccurrencesDates, freqLabel, friendlyDate, parseDate, fmtDate, today,
    processPendingResets,
  };
})();
