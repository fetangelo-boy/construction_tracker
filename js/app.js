/* Основной модуль приложения */
(function (global) {
  'use strict';

  const D = global.TrackerData;
  const S = global.TrackerStore;
  const G = global.TrackerGantt;

  const app = {
    view: 'dashboard',
    currentProjectId: 'p1',
    selectedTaskId: null,
    taskFilters: { status: '', assignee: '', priority: '', search: '' },
    modal: null,
    toastTimer: null
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  }

  function daysUntil(str) {
    return Math.round((new Date(str + 'T00:00:00') - new Date(D.TODAY + 'T00:00:00')) / 86400000);
  }

  function plusDays(str, n) {
    const d = new Date(str + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return D.iso(d);
  }

  function statusBadge(status) {
    const s = D.STATUSES[status];
    return '<span class="badge" style="--badge-color:' + s.color + '"><i></i>' + s.label + '</span>';
  }

  function priorityBadge(priority) {
    const p = D.PRIORITIES[priority];
    return '<span class="priority" style="--priority-color:' + p.color + '">' + p.label + '</span>';
  }

  function avatar(user, size) {
    if (!user) return '<span class="avatar avatar-empty">?</span>';
    return '<span class="avatar' + (size ? ' avatar-' + size : '') + '" style="--avatar-color:' + user.color + '" title="' + esc(user.name) + '">' + esc(user.initials) + '</span>';
  }

  function toast(message, type) {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast show ' + (type || 'success');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function tasksOf(projectId) {
    return S.getState().tasks.filter(t => t.projectId === projectId);
  }

  /* ---------- Навигация ---------- */
  function renderNav() {
    const user = S.currentUser();
    $('#user-avatar').outerHTML = '<button id="user-avatar" class="user-chip" title="Сменить пользователя">' + avatar(user) +
      '<span class="user-chip-info"><strong>' + esc(user.name) + '</strong><small>' + D.ROLES[user.role].label + '</small></span></button>';

    const items = [
      { id: 'dashboard', label: 'Дашборд', icon: '▦' },
      { id: 'projects', label: 'Проекты', icon: '▤' },
      { id: 'tasks', label: 'Задачи', icon: '☑' },
      { id: 'gantt', label: 'Гант', icon: '▭' },
      { id: 'team', label: 'Команда', icon: '◉' }
    ];
    $('#nav').innerHTML = items.map(i =>
      '<button class="nav-item ' + (app.view === i.id ? 'active' : '') + '" data-view="' + i.id + '"><span class="nav-icon">' + i.icon + '</span>' + i.label + '</button>').join('');

    const unread = S.getState().notifications.filter(n => !n.read).length;
    $('#notif-count').textContent = unread > 9 ? '9+' : unread;
    $('#notif-count').style.display = unread ? '' : 'none';
  }

  /* ---------- Дашборд ---------- */
  function renderDashboard() {
    const st = S.getState();
    const activeProjects = st.projects.filter(p => p.status === 'active').length;
    const allTasks = st.tasks;
    const overdue = allTasks.filter(t => t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled');
    const upcoming = allTasks.filter(t => {
      const d = daysUntil(t.end);
      return d >= 0 && d <= 7 && t.status !== 'done' && t.status !== 'cancelled';
    });
    const byStatus = Object.keys(D.STATUSES).map(k => ({ key: k, count: allTasks.filter(t => t.status === k).length }));
    const workload = st.users.filter(u => u.role !== 'observer').map(u => ({
      user: u,
      count: allTasks.filter(t => t.assigneeId === u.id && t.status !== 'done' && t.status !== 'cancelled').length
    })).sort((a, b) => b.count - a.count);
    const maxLoad = Math.max(1, ...workload.map(w => w.count));

    $('#page-title').textContent = 'Дашборд';
    $('#page-subtitle').textContent = 'Обзор проектов, сроков и загрузки команды';

    $('#content').innerHTML =
      '<div class="stats-grid">' +
        statCard('Проекты в работе', activeProjects, '▤', 'var(--accent)') +
        statCard('Всего задач', allTasks.length, '☑', 'var(--blue)') +
        statCard('Просрочено', overdue.length, '⚠', 'var(--red)') +
        statCard('Близкий срок (7 дней)', upcoming.length, '◷', 'var(--amber)') +
      '</div>' +
      '<div class="dashboard-grid">' +
        '<section class="card span-2">' +
          '<div class="card-head"><h3>Задачи по статусам</h3><span class="card-hint">все проекты</span></div>' +
          '<div class="status-bars">' + byStatus.map(s => {
            const pct = allTasks.length ? Math.round(s.count / allTasks.length * 100) : 0;
            return '<div class="status-row"><span class="status-name"><i style="background:' + D.STATUSES[s.key].color + '"></i>' + D.STATUSES[s.key].label + '</span>' +
              '<div class="status-track"><div class="status-fill" style="width:' + pct + '%;background:' + D.STATUSES[s.key].color + '"></div></div>' +
              '<strong>' + s.count + '</strong></div>';
          }).join('') + '</div>' +
        '</section>' +
        '<section class="card span-2">' +
          '<div class="card-head"><h3>Требуют внимания</h3></div>' +
          '<div class="attention-list">' + (overdue.concat(upcoming)).slice(0, 7).map(t => {
            const late = t.end < D.TODAY;
            return '<button class="attention-item" data-open-task="' + t.id + '">' +
              avatar(S.user(t.assigneeId), 'sm') +
              '<span class="attention-main"><strong>' + esc(t.title) + '</strong><small>' + esc(S.project(t.projectId).name) + '</small></span>' +
              '<span class="attention-date ' + (late ? 'late' : 'soon') + '">' + (late ? '−' + (-daysUntil(t.end)) + ' д.' : '+' + daysUntil(t.end) + ' д.') + '</span>' +
            '</button>';
          }).join('') + (overdue.length + upcoming.length === 0 ? '<div class="empty-inline">Проблемных сроков нет</div>' : '') + '</div>' +
        '</section>' +
        '<section class="card span-2">' +
          '<div class="card-head"><h3>Загрузка исполнителей</h3><span class="card-hint">активные задачи</span></div>' +
          '<div class="workload-list">' + workload.map(w =>
            '<div class="workload-row">' + avatar(w.user, 'sm') + '<span class="workload-name">' + esc(w.user.name) + '</span>' +
            '<div class="workload-track"><div class="workload-fill" style="width:' + Math.round(w.count / maxLoad * 100) + '%"></div></div>' +
            '<strong>' + w.count + '</strong></div>').join('') + '</div>' +
        '</section>' +
        '<section class="card span-2">' +
          '<div class="card-head"><h3>Проекты</h3><button class="btn-text" data-view="projects">Все проекты →</button></div>' +
          '<div class="project-mini-list">' + S.getState().projects.map(p => {
            const tasks = tasksOf(p.id);
            const done = tasks.filter(t => t.status === 'done').length;
            const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
            return '<button class="project-mini" data-open-project="' + p.id + '">' +
              '<div class="project-mini-top"><strong>' + esc(p.name) + '</strong>' +
              '<span class="status-pill" style="--pill-color:' + D.PROJECT_STATUSES[p.status].color + '">' + D.PROJECT_STATUSES[p.status].label + '</span></div>' +
              '<small>' + esc(p.address) + '</small>' +
              '<div class="mini-progress"><div style="width:' + pct + '%"></div></div>' +
              '<div class="project-mini-foot"><span>' + done + ' / ' + tasks.length + ' задач</span><span>' + fmtDate(p.end) + '</span></div>' +
            '</button>';
          }).join('') + '</div>' +
        '</section>' +
      '</div>';
  }

  function statCard(label, value, icon, color) {
    return '<div class="stat-card"><div class="stat-icon" style="color:' + color + '">' + icon + '</div>' +
      '<div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  /* ---------- Проекты ---------- */
  function renderProjects() {
    $('#page-title').textContent = 'Проекты';
    $('#page-subtitle').textContent = 'Объекты, сроки и участники';
    const canCreate = S.can('createTask');
    $('#content').innerHTML =
      '<div class="section-toolbar">' +
        '<div class="filter-tabs" id="project-tabs">' +
          ['all', 'active', 'planning', 'paused', 'finished'].map(k =>
            '<button data-filter="' + k + '" class="' + (k === 'all' ? 'active' : '') + '">' + (k === 'all' ? 'Все' : D.PROJECT_STATUSES[k].label) + '</button>').join('') +
        '</div>' +
        (canCreate ? '<button class="btn btn-primary" id="add-project">+ Новый проект</button>' : '') +
      '</div>' +
      '<div class="projects-grid" id="projects-grid"></div>';
    filterProjects('all');
  }

  function filterProjects(filter) {
    $$('#project-tabs button').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    const projects = S.getState().projects.filter(p => filter === 'all' || p.status === filter);
    $('#projects-grid').innerHTML = projects.map(p => {
      const tasks = tasksOf(p.id);
      const done = tasks.filter(t => t.status === 'done').length;
      const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      const late = tasks.filter(t => t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled').length;
      return '<article class="project-card" data-open-project="' + p.id + '">' +
        '<div class="project-card-head"><span class="status-pill" style="--pill-color:' + D.PROJECT_STATUSES[p.status].color + '">' + D.PROJECT_STATUSES[p.status].label + '</span>' +
        (late ? '<span class="late-pill">' + late + ' просрочено</span>' : '') + '</div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="project-address">◈ ' + esc(p.address) + '</p>' +
        '<p class="project-client">Заказчик: ' + esc(p.client) + '</p>' +
        '<div class="project-members">' + p.memberIds.slice(0, 5).map(id => avatar(S.user(id), 'sm')).join('') + (p.memberIds.length > 5 ? '<span class="avatar avatar-sm avatar-more">+' + (p.memberIds.length - 5) + '</span>' : '') + '</div>' +
        '<div class="project-meta"><span>◷ ' + fmtDate(p.start) + ' — ' + fmtDate(p.end) + '</span><span>' + tasks.length + ' задач</span></div>' +
        '<div class="mini-progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="project-card-foot"><span>Выполнено ' + pct + '%</span><span class="project-arrow">→</span></div>' +
      '</article>';
    }).join('') || '<div class="empty-state">Нет проектов с таким статусом</div>';
  }

  /* ---------- Задачи ---------- */
  function renderTasks() {
    $('#page-title').textContent = 'Задачи';
    $('#page-subtitle').textContent = 'Реестр задач с фильтрами';
    const f = app.taskFilters;
    const canCreate = S.can('createTask');
    $('#content').innerHTML =
      '<div class="section-toolbar">' +
        '<div class="filters-row">' +
          '<input class="input" id="task-search" placeholder="Поиск по названию..." value="' + esc(f.search) + '">' +
          '<select class="input" id="filter-status"><option value="">Все статусы</option>' + Object.keys(D.STATUSES).map(k => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + D.STATUSES[k].label + '</option>').join('') + '</select>' +
          '<select class="input" id="filter-assignee"><option value="">Все исполнители</option>' + S.getState().users.map(u => '<option value="' + u.id + '"' + (f.assignee === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>' +
          '<select class="input" id="filter-priority"><option value="">Все приоритеты</option>' + Object.keys(D.PRIORITIES).map(k => '<option value="' + k + '"' + (f.priority === k ? ' selected' : '') + '>' + D.PRIORITIES[k].label + '</option>').join('') + '</select>' +
        '</div>' +
        (canCreate ? '<button class="btn btn-primary" id="add-task">+ Новая задача</button>' : '') +
      '</div>' +
      '<div class="card table-card"><div id="tasks-table"></div></div>';
    renderTasksTable();
  }

  function renderTasksTable() {
    const f = app.taskFilters;
    const tasks = S.getState().tasks.filter(t => {
      if (f.search && t.title.toLowerCase().indexOf(f.search.toLowerCase()) === -1) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.assignee && t.assigneeId !== f.assignee) return false;
      if (f.priority && t.priority !== f.priority) return false;
      return true;
    }).sort((a, b) => a.end.localeCompare(b.end));

    $('#tasks-table').innerHTML = tasks.length ?
      '<table class="data-table"><thead><tr><th>Задача</th><th>Проект</th><th>Этап</th><th>Ответственный</th><th>Срок</th><th>Статус</th><th>Прогресс</th><th>Приоритет</th></tr></thead><tbody>' +
      tasks.map(t => {
        const late = t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled';
        return '<tr data-open-task="' + t.id + '">' +
          '<td><strong>' + esc(t.title) + '</strong>' + (t.dependsOn ? '<span class="dep-mark" title="Зависимость FS">⤳ FS</span>' : '') + '</td>' +
          '<td>' + esc(S.project(t.projectId).name) + '</td>' +
          '<td>' + esc(t.stage || '—') + '</td>' +
          '<td><span class="cell-user">' + avatar(S.user(t.assigneeId), 'sm') + esc(S.user(t.assigneeId) ? S.user(t.assigneeId).name : '—') + '</span></td>' +
          '<td' + (late ? ' class="cell-late"' : '') + '>' + fmtDate(t.start) + ' → ' + fmtDate(t.end) + '</td>' +
          '<td>' + statusBadge(t.status) + '</td>' +
          '<td><div class="table-progress"><div style="width:' + (t.progress || 0) + '%"></div></div><span>' + (t.progress || 0) + '%</span></td>' +
          '<td>' + priorityBadge(t.priority) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>' : '<div class="empty-state">Нет задач по выбранным фильтрам</div>';
  }

  /* ---------- Гант ---------- */
  function renderGantt() {
    $('#page-title').textContent = 'Диаграмма Ганта';
    $('#page-subtitle').textContent = 'Сроки, зависимости FS и статусы задач';
    $('#content').innerHTML =
      '<div class="section-toolbar gantt-filters">' +
        '<div class="filters-row">' +
          '<select class="input" id="gantt-project"><option value="">Все проекты</option>' + S.getState().projects.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select>' +
          '<select class="input" id="gantt-stage"><option value="">Все этапы</option>' + D.STAGES.map(s => '<option value="' + s + '">' + s + '</option>').join('') + '</select>' +
          '<select class="input" id="gantt-assignee"><option value="">Все исполнители</option>' + S.getState().users.map(u => '<option value="' + u.id + '">' + esc(u.name) + '</option>').join('') + '</select>' +
          '<select class="input" id="gantt-status"><option value="">Все статусы</option>' + Object.keys(D.STATUSES).map(k => '<option value="' + k + '">' + D.STATUSES[k].label + '</option>').join('') + '</select>' +
          '<input class="input" type="date" id="gantt-from" title="Начало периода">' +
          '<input class="input" type="date" id="gantt-to" title="Конец периода">' +
        '</div>' +
        '<button class="btn btn-ghost" id="gantt-reset">Сбросить</button>' +
      '</div>' +
      '<div class="card gantt-card"><div id="gantt-container"></div></div>' +
      '<p class="gantt-help">☆ Перетаскивайте полосы для изменения сроков (роли: руководитель, прораб). При конфликте зависимостей FS появится предупреждение.</p>';

    const f = G.getFilters();
    if (f.projectId) $('#gantt-project').value = f.projectId;
    if (f.stage) $('#gantt-stage').value = f.stage;
    if (f.assigneeId) $('#gantt-assignee').value = f.assigneeId;
    if (f.status) $('#gantt-status').value = f.status;
    if (f.from) $('#gantt-from').value = f.from;
    if (f.to) $('#gantt-to').value = f.to;

    drawGantt();
  }

  function drawGantt() {
    G.render($('#gantt-container'));
  }

  /* ---------- Команда ---------- */
  function renderTeam() {
    $('#page-title').textContent = 'Команда';
    $('#page-subtitle').textContent = 'Участники проектов и их роли';
    $('#content').innerHTML = '<div class="team-grid">' + S.getState().users.map(u => {
      const tasks = S.getState().tasks.filter(t => t.assigneeId === u.id && t.status !== 'done' && t.status !== 'cancelled');
      const projects = S.getState().projects.filter(p => p.memberIds.includes(u.id)).length;
      return '<div class="card team-card">' + avatar(u, 'lg') +
        '<div class="team-info"><strong>' + esc(u.name) + '</strong><span>' + esc(u.position) + '</span></div>' +
        '<span class="role-pill">' + D.ROLES[u.role].label + '</span>' +
        '<div class="team-stats"><div><strong>' + tasks.length + '</strong><span>активных задач</span></div><div><strong>' + projects + '</strong><span>проектов</span></div></div>' +
        (S.can('manageMembers') ? '<label class="role-select-label">Роль<select class="input role-select" data-role-user="' + u.id + '">' + Object.keys(D.ROLES).map(k => '<option value="' + k + '"' + (u.role === k ? ' selected' : '') + '>' + D.ROLES[k].label + '</option>').join('') + '</select></label>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------- Карточка задачи ---------- */
  function openTask(id) {
    app.selectedTaskId = id;
    app.modal = 'task';
    renderTaskModal();
  }

  function renderTaskModal() {
    const t = S.task(app.selectedTaskId);
    if (!t) return;
    const user = S.currentUser();
    const canEdit = S.can('editTask', t);
    const canDates = S.can('editTaskDates', t);
    const canComment = S.can('comment', t);
    const project = S.project(t.projectId);
    const parent = t.dependsOn ? S.task(t.dependsOn) : null;
    const successors = S.getState().tasks.filter(x => x.dependsOn === t.id);
    const fsConflict = parent && t.start < parent.end ? daysUntil(parent.end) - daysUntil(t.start) : 0;
    // Исключаем саму задачу и её непосредственных последователей, чтобы не создать цикл
    const depCandidates = S.getState().tasks.filter(x => x.id !== t.id && x.dependsOn !== t.id);

    const overlay = $('#modal-overlay');
    overlay.innerHTML =
      '<div class="modal modal-wide" id="task-modal">' +
        '<div class="modal-head">' +
          '<div><div class="modal-eyebrow">' + esc(project.name) + ' · ' + esc(t.stage || 'Без этапа') + '</div>' +
          '<h2>' + esc(t.title) + '</h2></div>' +
          '<button class="icon-btn" data-close-modal>×</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="task-modal-grid">' +
            '<div class="task-main">' +
              '<div class="task-section"><h4>Описание</h4><p>' + (esc(t.description) || '<span class="muted">Описание не заполнено</span>') + '</p></div>' +
              '<div class="task-section"><h4>Комментарии <span class="count">' + (t.comments || []).length + '</span></h4>' +
                '<div class="comments-list">' + (t.comments || []).map(c => {
                  const u = S.user(c.userId);
                  return '<div class="comment">' + avatar(u, 'sm') + '<div><div class="comment-head"><strong>' + esc(u ? u.name : '—') + '</strong><span>' + new Date(c.date).toLocaleString('ru-RU') + '</span></div><p>' + esc(c.text) + '</p></div></div>';
                }).join('') + ((t.comments || []).length === 0 ? '<div class="empty-inline">Комментариев пока нет</div>' : '') + '</div>' +
                (canComment ? '<div class="comment-form"><input class="input" id="comment-input" placeholder="Написать комментарий..."><button class="btn btn-primary" id="send-comment">Отправить</button></div>' : '<div class="empty-inline">Нет права комментировать</div>') +
              '</div>' +
              '<div class="task-section"><h4>Файлы <span class="count">' + (t.files || []).length + ' / 20</span></h4>' +
                '<div class="files-list">' + (t.files || []).map(f =>
                  '<a class="file-item" href="' + f.dataUrl + '" download="' + esc(f.name) + '">📎 ' + esc(f.name) + ' <small>' + Math.round(f.size / 1024) + ' КБ</small></a>').join('') + '</div>' +
                (S.can('upload', t) ? '<label class="file-upload">+ Прикрепить файл (до 10 МБ)<input type="file" id="file-input" multiple hidden></label>' : '<div class="empty-inline">Нет права загружать файлы</div>') +
              '</div>' +
            '</div>' +
            '<aside class="task-side">' +
              '<div class="side-field"><label>Статус</label>' + (canEdit ? '<select class="input" id="edit-status">' + Object.keys(D.STATUSES).map(k => '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + D.STATUSES[k].label + '</option>').join('') + '</select>' : statusBadge(t.status)) + '</div>' +
              '<div class="side-field"><label>Прогресс <strong id="progress-value">' + t.progress + '%</strong></label>' + (canEdit ? '<input type="range" min="0" max="100" step="5" value="' + t.progress + '" id="edit-progress">' : '<div class="table-progress"><div style="width:' + t.progress + '%"></div></div>') + '</div>' +
              '<div class="side-field"><label>Ответственный</label>' + (canEdit ? '<select class="input" id="edit-assignee">' + S.getState().users.map(u => '<option value="' + u.id + '"' + (t.assigneeId === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>' : '<span class="cell-user">' + avatar(S.user(t.assigneeId), 'sm') + esc(S.user(t.assigneeId) ? S.user(t.assigneeId).name : '—') + '</span>') + '</div>' +
              '<div class="side-field"><label>Приоритет</label>' + priorityBadge(t.priority) + '</div>' +
              '<div class="side-field"><label>Этап</label><span>' + esc(t.stage || '—') + '</span></div>' +
              '<div class="side-field"><label>Начало</label>' + (canDates ? '<input class="input" type="date" id="edit-start" value="' + t.start + '">' : '<span>' + fmtDate(t.start) + '</span>') + '</div>' +
              '<div class="side-field"><label>Окончание</label>' + (canDates ? '<input class="input" type="date" id="edit-end" value="' + t.end + '">' : '<span>' + fmtDate(t.end) + '</span>') + '</div>' +
              '<div class="side-field fs-field"><label>Зависимость FS (finish-to-start)</label>' +
                '<div class="fs-info">' + (parent
                  ? '<button class="fs-link" data-open-task="' + parent.id + '">⤳ ' + esc(parent.title) + '</button><small>Окончание предшественника: ' + parent.end + '</small>'
                  : '<span class="muted">Предшественника нет</span>') + '</div>' +
                (canDates ? '<select class="input" id="edit-dependency" title="Изменить FS-зависимость"><option value="">Нет зависимости</option>' +
                  depCandidates.map(x => '<option value="' + x.id + '"' + (x.id === t.dependsOn ? ' selected' : '') + '>' + esc(x.title) + ' (до ' + x.end + ')</option>').join('') + '</select>' : '') +
                '<small class="field-note">Задача начнётся не раньше дня, следующего за окончанием выбранной.</small>' +
              '</div>' +
              (fsConflict > 0 ? '<div class="side-warning danger">⚠ Конфликт FS: начало на ' + fsConflict + ' д. раньше окончания «' + esc(parent.title) + '» (' + parent.end + ')</div>' :
                parent ? '<div class="side-ok">✓ FS-порядок соблюдён: ' + t.start + ' после ' + parent.end + '</div>' : '') +
              (successors.length ? '<div class="side-field"><label>Ждут завершения этой задачи (FS)</label><div class="fs-successors">' +
                successors.map(x => '<button class="fs-link" data-open-task="' + x.id + '">⤳ ' + esc(x.title) + '</button>').join('') + '</div></div>' : '') +
              ((t.history || []).length ? '<div class="side-field"><label>История прогресса</label><div class="history-list">' + t.history.slice(0, 5).map(h => '<div><span>' + new Date(h.date).toLocaleDateString('ru-RU') + '</span> ' + h.from + '% → ' + h.to + '%</div>').join('') + '</div></div>' : '') +
              (!canDates ? '<div class="side-warning">🔒 У вас нет права изменять сроки</div>' : '') +
            '</aside>' +
          '</div>' +
        '</div>' +
      '</div>';
    overlay.classList.add('open');

    $('#edit-status') && $('#edit-status').addEventListener('change', e => {
      S.updateTask(t.id, { status: e.target.value });
      toast('Статус обновлён');
      renderAll(); renderTaskModal();
    });
    $('#edit-assignee') && $('#edit-assignee').addEventListener('change', e => {
      S.updateTask(t.id, { assigneeId: e.target.value });
      toast('Ответственный изменён');
      renderAll(); renderTaskModal();
    });
    const progress = $('#edit-progress');
    progress && progress.addEventListener('input', e => { $('#progress-value').textContent = e.target.value + '%'; });
    progress && progress.addEventListener('change', e => {
      S.updateTask(t.id, { progress: Number(e.target.value) });
      toast('Прогресс сохранён'); renderAll();
    });
    ['#edit-start', '#edit-end'].forEach(sel => {
      const el = $(sel);
      el && el.addEventListener('change', () => {
        const ns = $('#edit-start').value, ne = $('#edit-end').value;
        if (ne < ns) { toast('Окончание не может быть раньше начала', 'error'); renderTaskModal(); return; }
        const conflicts = G.fsConflicts(S.getState().tasks.map(x => x.id === t.id ? Object.assign({}, x, { start: ns, end: ne }) : x));
        if (conflicts.length && !global.confirm('Изменение создаёт конфликт зависимости FS. Продолжить?')) { renderTaskModal(); return; }
        S.updateTask(t.id, { start: ns, end: ne });
        toast('Сроки обновлены'); renderAll(); renderTaskModal();
      });
    });
    const depSelect = $('#edit-dependency');
    depSelect && depSelect.addEventListener('change', () => {
      const parentId = depSelect.value || null;
      const pred = parentId ? S.task(parentId) : null;
      let changes = { dependsOn: parentId };
      if (pred && t.start <= pred.end) {
        const newStart = plusDays(pred.end, 1);
        const duration = Math.max(1, daysUntil(t.end) - daysUntil(t.start) + 1);
        changes.start = newStart;
        changes.end = plusDays(newStart, duration - 1);
      }
      S.updateTask(t.id, changes);
      toast(pred ? 'FS-зависимость установлена, даты скорректированы' : 'FS-зависимость удалена');
      renderAll(); renderTaskModal();
    });
    $('#send-comment') && $('#send-comment').addEventListener('click', () => {
      const val = $('#comment-input').value.trim();
      if (!val) return;
      S.addComment(t.id, val);
      toast('Комментарий добавлен'); renderAll(); renderTaskModal();
    });
    $('#comment-input') && $('#comment-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') $('#send-comment').click();
    });
    const fileInput = $('#file-input');
    fileInput && fileInput.addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => {
        if (f.size > 10 * 1024 * 1024) { toast('Файл слишком большой: ' + f.name, 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => { S.addFile(t.id, { name: f.name, size: f.size, type: f.type, dataUrl: reader.result }); renderAll(); renderTaskModal(); toast('Файл прикреплён'); };
        reader.readAsDataURL(f);
      });
    });
  }

  /* ---------- Проект: детали и отчёт ---------- */
  function openProject(id) {
    app.currentProjectId = id;
    app.view = 'project-detail';
    renderAll();
  }

  function renderProjectDetail() {
    const p = S.project(app.currentProjectId);
    if (!p) return;
    const tasks = tasksOf(p.id);
    const done = tasks.filter(t => t.status === 'done').length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const overdue = tasks.filter(t => t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled');
    $('#page-title').textContent = p.name;
    $('#page-subtitle').textContent = p.address + ' · ' + p.client;

    $('#content').innerHTML =
      '<div class="detail-toolbar">' +
        '<button class="btn btn-ghost" data-view="projects">← К проектам</button>' +
        '<div><button class="btn btn-ghost" id="open-project-gantt">Гант проекта</button>' +
        (S.can('createTask') ? '<button class="btn btn-primary" id="add-task-in-project">+ Задача</button>' : '') + '</div>' +
      '</div>' +
      '<div class="stats-grid four">' +
        statCard('Задач в проекте', tasks.length, '☑', 'var(--blue)') +
        statCard('Выполнено', done, '✓', 'var(--green)') +
        statCard('Просрочено', overdue.length, '⚠', 'var(--red)') +
        statCard('Прогресс', pct + '%', '◔', 'var(--accent)') +
      '</div>' +
      '<div class="dashboard-grid">' +
        '<section class="card span-2">' +
          '<div class="card-head"><h3>Отчёт по проекту</h3><span class="card-hint">' + esc(p.start) + ' — ' + esc(p.end) + '</span></div>' +
          '<div class="card table-card"><table class="data-table"><thead><tr><th>Задача</th><th>Этап</th><th>Ответственный</th><th>Сроки</th><th>Статус</th><th>Прогресс</th><th>Отклонение</th></tr></thead><tbody>' +
          tasks.map(t => {
            const late = t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled';
            const delay = t.status === 'done' && t.end > p.end ? 'После плана' : (late ? 'Просрочена' : 'В плане');
            return '<tr data-open-task="' + t.id + '"><td><strong>' + esc(t.title) + '</strong></td><td>' + esc(t.stage || '—') + '</td>' +
              '<td><span class="cell-user">' + avatar(S.user(t.assigneeId), 'sm') + esc(S.user(t.assigneeId) ? S.user(t.assigneeId).name : '—') + '</span></td>' +
              '<td>' + fmtDate(t.start) + ' → ' + fmtDate(t.end) + '</td><td>' + statusBadge(t.status) + '</td>' +
              '<td><div class="table-progress"><div style="width:' + t.progress + '%"></div></div><span>' + t.progress + '%</span></td>' +
              '<td><span class="' + (late ? 'cell-late' : 'cell-ok') + '">' + delay + '</span></td></tr>';
          }).join('') + '</tbody></table></div>' +
        '</section>' +
        '<section class="card span-1">' +
          '<div class="card-head"><h3>Этапы и участники</h3></div>' +
          '<div class="detail-side">' +
            '<h4>Этапы работ</h4><div class="stage-list">' + (p.stages || []).map(s => {
              const st = tasks.filter(t => t.stage === s);
              return '<div class="stage-item"><span>' + esc(s) + '</span><small>' + st.length + ' задач</small></div>';
            }).join('') + '</div>' +
            '<h4>Участники</h4><div class="member-list">' + p.memberIds.map(id => {
              const u = S.user(id);
              return '<div class="member-item">' + avatar(u, 'sm') + '<span>' + esc(u.name) + '</span><small>' + D.ROLES[u.role].short + '</small></div>';
            }).join('') + '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
  }

  /* ---------- Уведомления ---------- */
  function renderNotifications() {
    const list = S.getState().notifications.slice(0, 20);
    $('#notif-panel').innerHTML =
      '<div class="notif-head"><strong>Уведомления</strong><button class="btn-text" id="read-all">Прочитать все</button></div>' +
      '<div class="notif-list">' + list.map(n => {
        const icons = { assign: '⊙', status: '↻', comment: '✎', deadline: '⚠' };
        return '<button class="notif-item ' + (n.read ? 'read' : '') + '" data-open-task="' + n.taskId + '">' +
          '<span class="notif-icon">' + (icons[n.type] || '•') + '</span>' +
          '<span><strong>' + esc(n.title) + '</strong><small>' + esc(n.text) + '</small><em>' + new Date(n.date).toLocaleString('ru-RU') + '</em></span>' +
        '</button>';
      }).join('') + '</div>';
  }

  /* ---------- Модальные формы ---------- */
  function renderFormModal() {
    const overlay = $('#modal-overlay');
    if (app.modal === 'task-form') {
      const p = S.getState().projects.find(x => x.id === app.currentProjectId) || S.getState().projects[0];
      const allTasks = S.getState().tasks.filter(t => t.projectId === p.id);
      overlay.innerHTML =
        '<div class="modal" id="form-modal"><div class="modal-head"><div><div class="modal-eyebrow">Новая задача</div><h2>Создать задачу</h2></div><button class="icon-btn" data-close-modal>×</button></div>' +
        '<div class="modal-body"><form id="task-form" class="form-grid">' +
          '<label class="form-field full"><span>Название *</span><input class="input" name="title" required></label>' +
          '<label class="form-field"><span>Проект</span><select class="input" name="projectId" id="form-project">' + S.getState().projects.map(x => '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
          '<label class="form-field"><span>Этап</span><select class="input" name="stage" id="form-stage">' + (p.stages || D.STAGES).map(s => '<option>' + esc(s) + '</option>').join('') + '</select></label>' +
          '<label class="form-field"><span>Ответственный</span><select class="input" name="assigneeId">' + S.getState().users.filter(u => u.role !== 'observer').map(u => '<option value="' + u.id + '">' + esc(u.name) + '</option>').join('') + '</select></label>' +
          '<label class="form-field"><span>Приоритет</span><select class="input" name="priority">' + Object.keys(D.PRIORITIES).map(k => '<option value="' + k + '"' + (k === 'normal' ? ' selected' : '') + '>' + D.PRIORITIES[k].label + '</option>').join('') + '</select></label>' +
          '<label class="form-field"><span>Начало *</span><input class="input" type="date" name="start" value="' + D.TODAY + '" required></label>' +
          '<label class="form-field"><span>Окончание *</span><input class="input" type="date" name="end" value="' + D.TODAY + '" required></label>' +
          '<label class="form-field"><span>Зависимость FS (finish-to-start)</span><select class="input" name="dependsOn" id="form-dep"><option value="">Нет</option>' + allTasks.map(t => '<option value="' + t.id + '">' + esc(t.title) + ' (до ' + t.end + ')</option>').join('') + '</select><small class="field-note">Следующая задача начнётся не раньше окончания выбранной. Даты подставятся автоматически.</small></label>' +
          '<label class="form-field"><span>Статус</span><select class="input" name="status">' + Object.keys(D.STATUSES).map(k => '<option value="' + k + '">' + D.STATUSES[k].label + '</option>').join('') + '</select></label>' +
          '<label class="form-field full"><span>Описание</span><textarea class="input" name="description" rows="3"></textarea></label>' +
          '<div class="form-actions full"><button type="button" class="btn btn-ghost" data-close-modal>Отмена</button><button type="submit" class="btn btn-primary">Создать задачу</button></div>' +
        '</form></div></div>';
      overlay.classList.add('open');
      $('#form-project').addEventListener('change', e => {
        const proj = S.project(e.target.value);
        $('#form-stage').innerHTML = (proj.stages || D.STAGES).map(s => '<option>' + esc(s) + '</option>').join('');
        $('#form-dep').innerHTML = '<option value="">Нет</option>' + S.getState().tasks.filter(t => t.projectId === proj.id).map(t => '<option value="' + t.id + '">' + esc(t.title) + ' (до ' + t.end + ')</option>').join('');
      });
      $('#form-dep').addEventListener('change', e => {
        const pred = e.target.value ? S.task(e.target.value) : null;
        if (!pred) return;
        const form = $('#task-form');
        const startInput = form.querySelector('[name="start"]');
        const endInput = form.querySelector('[name="end"]');
        if (startInput.value && startInput.value <= pred.end) {
          const duration = Math.max(1, daysUntil(endInput.value) - daysUntil(startInput.value) + 1);
          const newStart = plusDays(pred.end, 1);
          startInput.value = newStart;
          endInput.value = plusDays(newStart, duration - 1);
          toast('Даты скорректированы по FS: начало ' + newStart);
        }
      });
      $('#task-form').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        if (data.end < data.start) { toast('Окончание не может быть раньше начала', 'error'); return; }
        if (data.dependsOn) {
          const parent = S.task(data.dependsOn);
          if (parent && data.start < parent.end) {
            if (!global.confirm('Начало задачи раньше окончания зависимости FS. Создать с конфликтом?')) return;
          }
        }
        S.addTask(data);
        closeModal(); toast('Задача создана'); renderAll();
      });
    } else if (app.modal === 'project-form') {
      overlay.innerHTML =
        '<div class="modal" id="form-modal"><div class="modal-head"><div><div class="modal-eyebrow">Новый объект</div><h2>Создать проект</h2></div><button class="icon-btn" data-close-modal>×</button></div>' +
        '<div class="modal-body"><form id="project-form" class="form-grid">' +
          '<label class="form-field full"><span>Название *</span><input class="input" name="name" required></label>' +
          '<label class="form-field full"><span>Адрес / объект</span><input class="input" name="address"></label>' +
          '<label class="form-field full"><span>Заказчик</span><input class="input" name="client"></label>' +
          '<label class="form-field"><span>Начало *</span><input class="input" type="date" name="start" value="' + D.TODAY + '" required></label>' +
          '<label class="form-field"><span>Плановое окончание *</span><input class="input" type="date" name="end" value="' + D.TODAY + '" required></label>' +
          '<label class="form-field"><span>Статус</span><select class="input" name="status">' + Object.keys(D.PROJECT_STATUSES).map(k => '<option value="' + k + '">' + D.PROJECT_STATUSES[k].label + '</option>').join('') + '</select></label>' +
          '<label class="form-field"><span>Этапы (через запятую)</span><input class="input" name="stages" id="form-stages" value="' + D.STAGES.slice(0, 4).join(', ') + '"></label>' +
          '<div class="form-actions full"><button type="button" class="btn btn-ghost" data-close-modal>Отмена</button><button type="submit" class="btn btn-primary">Создать проект</button></div>' +
        '</form></div></div>';
      overlay.classList.add('open');
      $('#project-form').addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());
        if (data.end < data.start) { toast('Некорректный период', 'error'); return; }
        data.stages = data.stages.split(',').map(s => s.trim()).filter(Boolean);
        data.memberIds = [S.currentUser().id];
        const p = S.addProject(data);
        closeModal(); toast('Проект создан'); app.currentProjectId = p.id; renderAll();
      });
    } else if (app.modal === 'user-switch') {
      overlay.innerHTML =
        '<div class="modal" id="form-modal"><div class="modal-head"><div><div class="modal-eyebrow">Демо-режим</div><h2>Сменить пользователя</h2></div><button class="icon-btn" data-close-modal>×</button></div>' +
        '<div class="modal-body"><p class="modal-note">Выберите роль, чтобы проверить права доступа в интерфейсе.</p><div class="user-switch-list">' +
        S.getState().users.map(u => '<button class="user-switch-item ' + (u.id === S.currentUser().id ? 'active' : '') + '" data-switch-user="' + u.id + '">' + avatar(u) + '<span><strong>' + esc(u.name) + '</strong><small>' + D.ROLES[u.role].label + '</small></span></button>').join('') +
        '</div><div class="form-actions"><button class="btn btn-ghost" data-close-modal>Закрыть</button><button class="btn btn-ghost danger" id="reset-data">Сбросить демо-данные</button></div></div></div>';
      overlay.classList.add('open');
    }
  }

  function closeModal() {
    app.modal = null;
    app.selectedTaskId = null;
    $('#modal-overlay').classList.remove('open');
    $('#modal-overlay').innerHTML = '';
  }

  /* ---------- Рендер ---------- */
  function renderAll() {
    renderNav();
    switch (app.view) {
      case 'dashboard': renderDashboard(); break;
      case 'projects': renderProjects(); break;
      case 'project-detail': renderProjectDetail(); break;
      case 'tasks': renderTasks(); break;
      case 'gantt': renderGantt(); break;
      case 'team': renderTeam(); break;
    }
    renderNotifications();
  }

  /* ---------- События ---------- */
  function bindEvents() {
    document.addEventListener('click', e => {
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) { app.view = viewBtn.dataset.view; app.modal = null; renderAll(); return; }

      const openTask = e.target.closest('[data-open-task]');
      if (openTask && openTask.dataset.openTask) { openTaskId(openTask.dataset.openTask); return; }

      const projectLink = e.target.closest('[data-open-project]');
      if (projectLink) { openProject(projectLink.dataset.openProject); return; }

      if (e.target.closest('[data-close-modal]') || e.target.id === 'modal-overlay') { closeModal(); return; }

      if (e.target.closest('#mobile-menu')) { $('#sidebar').classList.toggle('open'); return; }

      if (e.target.closest('#user-avatar')) { app.modal = 'user-switch'; renderFormModal(); return; }
      if (e.target.closest('#notif-btn')) {
        const panel = $('#notif-panel');
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) renderNotifications();
        return;
      }
      if (e.target.closest('#read-all')) { S.markNotificationsRead(); renderNav(); renderNotifications(); return; }

      const switchUser = e.target.closest('[data-switch-user]');
      if (switchUser) { S.setCurrentUser(switchUser.dataset.switchUser); closeModal(); toast('Пользователь изменён'); renderAll(); return; }
      if (e.target.closest('#reset-data')) { if (global.confirm('Сбросить все изменения к демо-данным?')) { S.reset(); closeModal(); renderAll(); toast('Данные сброшены'); } return; }

      if (e.target.closest('#add-task') || e.target.closest('#add-task-in-project')) {
        if (!S.can('createTask')) { toast('Недостаточно прав', 'error'); return; }
        app.modal = 'task-form'; renderFormModal(); return;
      }
      if (e.target.closest('#add-project')) { app.modal = 'project-form'; renderFormModal(); return; }
      if (e.target.closest('#open-project-gantt')) {
        G.setFilters({ projectId: app.currentProjectId, stage: '', assigneeId: '', status: '', from: '', to: '' });
        app.view = 'gantt'; renderAll(); return;
      }
      if (e.target.closest('#gantt-reset')) {
        G.setFilters({ projectId: '', stage: '', assigneeId: '', status: '', from: '', to: '' });
        $('#gantt-project').value = ''; $('#gantt-stage').value = ''; $('#gantt-assignee').value = '';
        $('#gantt-status').value = ''; $('#gantt-from').value = ''; $('#gantt-to').value = '';
        drawGantt(); return;
      }
      const scaleBtn = e.target.closest('[data-scale]');
      if (scaleBtn) { G.setScale(scaleBtn.dataset.scale); drawGantt(); return; }
      const zoomBtn = e.target.closest('[data-zoom]');
      if (zoomBtn) {
        if (zoomBtn.dataset.zoom === 'in') G.zoomBy(1.25);
        else if (zoomBtn.dataset.zoom === 'out') G.zoomBy(1 / 1.25);
        else G.fit();
        drawGantt();
        return;
      }

      const tab = e.target.closest('#project-tabs [data-filter]');
      if (tab) { filterProjects(tab.dataset.filter); return; }
    });

    document.addEventListener('input', e => {
      if (e.target.id === 'task-search') { app.taskFilters.search = e.target.value; renderTasksTable(); }
    });
    document.addEventListener('change', e => {
      if (e.target.id === 'filter-status') { app.taskFilters.status = e.target.value; renderTasksTable(); }
      if (e.target.id === 'filter-assignee') { app.taskFilters.assignee = e.target.value; renderTasksTable(); }
      if (e.target.id === 'filter-priority') { app.taskFilters.priority = e.target.value; renderTasksTable(); }
      if (e.target.id === 'gantt-zoom-range') { G.zoomTo(e.target.value); return; }
      const ganttMap = { 'gantt-project': 'projectId', 'gantt-stage': 'stage', 'gantt-assignee': 'assigneeId', 'gantt-status': 'status', 'gantt-from': 'from', 'gantt-to': 'to' };
      if (ganttMap[e.target.id]) {
        const f = {}; f[ganttMap[e.target.id]] = e.target.value; G.setFilters(f); drawGantt();
      }
      const roleSelect = e.target.closest('[data-role-user]');
      if (roleSelect) {
        const u = S.getState().users.find(x => x.id === roleSelect.dataset.roleUser);
        if (u) { u.role = roleSelect.value; S.log('role', 'user', u.id, D.ROLES[u.role].label); S.save(); renderAll(); toast('Роль обновлена'); }
      }
    });

    S.subscribe(() => { renderNav(); });
  }

  function openTaskId(id) {
    openTask(id);
  }

  function init() {
    bindEvents();
    renderAll();
  }

  global.TrackerApp = { init, renderAll, openTask, openProject, toast };
})(window);
