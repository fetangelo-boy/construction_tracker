/* Хранилище состояния: localStorage, роли, аудит, уведомления */
(function (global) {
  'use strict';

  const D = global.TrackerData;
  const KEY = 'stroika-tracker-v1';

  let state = null;
  const listeners = [];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaults() {
    return {
      currentUserId: 'u1',
      users: deepClone(D.USERS),
      projects: deepClone(D.PROJECTS),
      tasks: deepClone(D.TASKS),
      notifications: deepClone(D.NOTIFICATIONS),
      audit: [],
      lastDateShift: null
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.projects)) {
          state = parsed;
          if (!state.audit) state.audit = [];
          if (!state.notifications) state.notifications = [];
          return;
        }
      }
    } catch (e) {
      console.warn('Не удалось загрузить состояние, используются демо-данные', e);
    }
    state = defaults();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Не удалось сохранить состояние', e);
    }
    emit();
  }

  function emit() {
    listeners.forEach(fn => fn(state));
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function currentUser() {
    return state.users.find(u => u.id === state.currentUserId) || state.users[0];
  }

  function setCurrentUser(id) {
    state.currentUserId = id;
    save();
  }

  function user(id) {
    return state.users.find(u => u.id === id);
  }

  function project(id) {
    return state.projects.find(p => p.id === id);
  }

  function task(id) {
    return state.tasks.find(t => t.id === id);
  }

  /* Права: централизованная проверка (аналог backend-проверок в MVP) */
  function can(action, target) {
    const role = currentUser().role;
    const level = D.ROLES[role] ? D.ROLES[role].level : 0;
    switch (action) {
      case 'viewProject':
        return true;
      case 'createTask':
        return level >= 3;
      case 'editTaskDates':
        return level >= 3;
      case 'editTask':
        if (level >= 3) return true;
        if (level === 2) {
          // Исполнитель может менять только назначенные ему задачи (не сроки)
          return target && target.assigneeId === currentUser().id;
        }
        return false;
      case 'comment':
        return level >= 2;
      case 'upload':
        return level >= 2;
      case 'manageMembers':
        return level === 4;
      case 'editProject':
        return level >= 3;
      default:
        return false;
    }
  }

  function log(action, entityType, entityId, details) {
    state.audit.unshift({
      id: 'a' + Date.now() + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      userId: state.currentUserId,
      action,
      entityType,
      entityId,
      details: details || ''
    });
    if (state.audit.length > 200) state.audit.length = 200;
  }

  function notify(payload) {
    state.notifications.unshift(Object.assign({
      id: 'n' + Date.now() + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      read: false
    }, payload));
  }

  function updateTask(id, changes, silent) {
    const t = task(id);
    if (!t) return null;
    const before = deepClone(t);
    Object.assign(t, changes);
    if (changes.progress !== undefined && changes.progress !== before.progress) {
      t.history = t.history || [];
      t.history.unshift({ date: new Date().toISOString(), userId: state.currentUserId, from: before.progress, to: changes.progress });
    }
    if (!silent) {
      log('update', 'task', id, describeChanges(before, t));
      notify({
        type: 'status',
        title: 'Задача обновлена',
        text: '«' + t.title + '»: ' + (describeChanges(before, t) || 'изменения'),
        userId: t.assigneeId,
        taskId: id
      });
    }
    save();
    return t;
  }

  function describeChanges(before, after) {
    const parts = [];
    if (before.status !== after.status) parts.push('статус: ' + D.STATUSES[before.status].label + ' → ' + D.STATUSES[after.status].label);
    if (before.progress !== after.progress) parts.push('прогресс: ' + before.progress + '% → ' + after.progress + '%');
    if (before.start !== after.start || before.end !== after.end) parts.push('сроки: ' + before.start + ' — ' + before.end + ' → ' + after.start + ' — ' + after.end);
    if (before.assigneeId !== after.assigneeId) parts.push('ответственный: ' + (user(before.assigneeId) ? user(before.assigneeId).name : '—') + ' → ' + (user(after.assigneeId) ? user(after.assigneeId).name : '—'));
    return parts.join('; ');
  }

  function addTask(data) {
    const id = 't' + Date.now();
    const task = Object.assign({
      id,
      stage: '',
      collaboratorIds: [],
      dependsOn: null,
      status: 'not-started',
      progress: 0,
      priority: 'normal',
      description: '',
      comments: [],
      files: [],
      history: []
    }, data);
    state.tasks.push(task);
    log('create', 'task', id, task.title);
    notify({ type: 'assign', title: 'Назначена задача', text: '«' + task.title + '» — вы ответственный.', userId: task.assigneeId, taskId: id });
    save();
    return task;
  }

  function addComment(taskId, text) {
    const t = task(taskId);
    if (!t) return;
    t.comments = t.comments || [];
    t.comments.push({ id: 'c' + Date.now(), userId: state.currentUserId, text, date: new Date().toISOString() });
    log('comment', 'task', taskId, text.slice(0, 80));
    if (t.assigneeId !== state.currentUserId) {
      notify({ type: 'comment', title: 'Новый комментарий', text: currentUser().name + ': ' + text.slice(0, 70), userId: t.assigneeId, taskId });
    }
    save();
  }

  function addFile(taskId, file) {
    const t = task(taskId);
    if (!t) return;
    t.files = t.files || [];
    if (t.files.length >= 20) return;
    t.files.push({ id: 'f' + Date.now(), name: file.name, size: file.size, type: file.type, date: new Date().toISOString(), dataUrl: file.dataUrl });
    log('file', 'task', taskId, file.name);
    save();
  }

  function addProject(data) {
    const id = 'p' + Date.now();
    const project = Object.assign({
      id,
      status: 'planning',
      managerId: state.currentUserId,
      memberIds: [state.currentUserId],
      stages: deepClone(D.STAGES)
    }, data);
    state.projects.push(project);
    log('create', 'project', id, project.name);
    save();
    return project;
  }

  function updateProject(id, changes) {
    const p = project(id);
    if (!p) return;
    Object.assign(p, changes);
    log('update', 'project', id, p.name);
    save();
  }

  function markNotificationsRead() {
    state.notifications.forEach(n => { n.read = true; });
    save();
  }

  function reset() {
    state = defaults();
    save();
  }

  function getState() { return state; }

  load();

  global.TrackerStore = {
    getState, subscribe, save, currentUser, setCurrentUser, user, project, task,
    can, log, notify, updateTask, addTask, addComment, addFile, addProject, updateProject,
    markNotificationsRead, reset
  };
})(window);
