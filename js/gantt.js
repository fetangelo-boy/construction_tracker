/* Диаграмма Ганта: полосы, FS-зависимости, масштаб, перетаскивание, конфликты */
(function (global) {
  'use strict';

  const D = global.TrackerData;
  const S = global.TrackerStore;

  function parseDate(str) { return new Date(str + 'T00:00:00'); }
  function dayDiff(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
  function addDays(str, n) { const d = parseDate(str); d.setDate(d.getDate() + n); return D.iso(d); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // Непрерывный масштаб: пикселей на один день. Пресеты День/Неделя/Месяц — его частные случаи.
  const PRESETS = { day: 40, week: 14, month: 5 };
  const MIN_ZOOM = 2, MAX_ZOOM = 80;
  let pxPerDay = PRESETS.week;
  let scrollX = 0;
  let pendingFocus = null;   // {day, offsetX} — сохранить дату под курсором при зуме
  let lastContainer = null;
  let lastRender = null;

  const state = {
    filters: { projectId: '', stage: '', assigneeId: '', status: '', from: '', to: '' }
  };

  function getFilters() { return state.filters; }
  function setFilters(f) { Object.assign(state.filters, f); }

  function scaleLabel() {
    return pxPerDay >= 24 ? 'day' : pxPerDay >= 8 ? 'week' : 'month';
  }
  function setScale(s) { pxPerDay = PRESETS[s] || pxPerDay; }
  function getScale() { return scaleLabel(); }
  function getZoom() { return pxPerDay; }
  function setZoom(px) { pxPerDay = clamp(Number(px) || pxPerDay, MIN_ZOOM, MAX_ZOOM); }
  function dayWidth() { return pxPerDay; }
  function headerStep() { return scaleLabel(); }

  function filteredTasks() {
    const f = state.filters;
    return S.getState().tasks.filter(t => {
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.stage && t.stage !== f.stage) return false;
      if (f.assigneeId && t.assigneeId !== f.assigneeId) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.from && t.end < f.from) return false;
      if (f.to && t.start > f.to) return false;
      return true;
    });
  }

  /* FS (finish-to-start): зависимая задача не может начаться раньше окончания предшественника.
     Проверка не блокирует изменения, а только помечает конфликт. */
  function fsConflicts(tasks) {
    const map = {};
    tasks.forEach(t => { map[t.id] = t; });
    const conflicts = [];
    tasks.forEach(t => {
      if (!t.dependsOn || !map[t.dependsOn]) return;
      const parent = map[t.dependsOn];
      if (dayDiff(t.start, parent.end) < 0) {
        conflicts.push({ taskId: t.id, parentId: parent.id, days: -dayDiff(t.start, parent.end) });
      }
    });
    return conflicts;
  }

  function dateRange(tasks) {
    if (!tasks.length) {
      const now = D.TODAY;
      return { min: addDays(now, -7), max: addDays(now, 30) };
    }
    let min = tasks[0].start, max = tasks[0].end;
    tasks.forEach(t => {
      if (t.start < min) min = t.start;
      if (t.end > max) max = t.end;
    });
    return { min: addDays(min, -3), max: addDays(max, 7) };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(container, options) {
    lastContainer = container;
    const tasks = filteredTasks();
    const allTasks = S.getState().tasks;
    const conflicts = fsConflicts(allTasks);
    const visibleIds = new Set(tasks.map(t => t.id));
    const visibleConflicts = conflicts.filter(c => visibleIds.has(c.taskId));
    const conflictIds = new Set(conflicts.map(c => c.taskId));
    const { min, max } = dateRange(tasks);
    const start = parseDate(min);
    const totalDays = dayDiff(max, min) + 1;
    const w = dayWidth();
    const width = totalDays * w;
    const rowHeight = 44;
    const headerHeight = 56;
    lastRender = { min, totalDays, width, w };

    // Шапка: месяцы + дни/недели
    let monthsHtml = '', cellsHtml = '';
    let monthLabel = '', monthSpan = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const mLabel = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      if (mLabel !== monthLabel) {
        if (monthLabel) monthsHtml += '<div class="gantt-month" style="width:' + (monthSpan * w) + 'px">' + escapeHtml(monthLabel) + '</div>';
        monthLabel = mLabel; monthSpan = 0;
      }
      monthSpan++;

      if (headerStep() === 'day') {
        const dow = d.getDay();
        const cls = 'gantt-cell' + (dow === 0 || dow === 6 ? ' weekend' : '') + (D.iso(d) === D.TODAY ? ' today' : '');
        cellsHtml += '<div class="' + cls + '" style="width:' + w + 'px"><span>' + d.getDate() + '</span></div>';
      } else if (headerStep() === 'week') {
        const isMonday = d.getDay() === 1;
        cellsHtml += '<div class="gantt-cell week' + (isMonday ? ' week-start' : '') + (D.iso(d) === D.TODAY ? ' today' : '') + '" style="width:' + w + 'px">' + (isMonday ? '<span>' + d.getDate() + '</span>' : '') + '</div>';
      } else {
        const isFirst = d.getDate() === 1;
        cellsHtml += '<div class="gantt-cell month' + (isFirst ? ' month-start' : '') + '" style="width:' + w + 'px">' + (isFirst ? '<span>' + d.getDate() + '</span>' : '') + '</div>';
      }
    }
    if (monthLabel) monthsHtml += '<div class="gantt-month" style="width:' + (monthSpan * w) + 'px">' + escapeHtml(monthLabel) + '</div>';

    const rows = tasks.map(t => {
      const left = dayDiff(t.start, min) * w;
      const barWidth = (dayDiff(t.end, t.start) + 1) * w;
      const statusColor = D.STATUSES[t.status].color;
      const late = t.end < D.TODAY && t.status !== 'done' && t.status !== 'cancelled';
      const conflict = conflictIds.has(t.id);
      const canDrag = S.can('editTaskDates', t);
      const assignee = S.user(t.assigneeId);
      const progress = t.progress || 0;
      const pred = t.dependsOn ? allTasks.find(x => x.id === t.dependsOn) : null;
      const successors = allTasks.filter(x => x.dependsOn === t.id);
      let title = t.title + ' | ' + t.start + ' — ' + t.end + ' | ' + progress + '%';
      if (pred) title += '\nFS ← предшественник: ' + pred.title + ' (окончание ' + pred.end + ')';
      if (successors.length) title += '\nFS → ждут этой задачи: ' + successors.map(x => x.title).join(', ');
      return '<div class="gantt-row" data-task-id="' + t.id + '" style="height:' + rowHeight + 'px">' +
        '<div class="gantt-grid">' + Array.from({ length: totalDays }, (_, i) => {
          const d = new Date(start); d.setDate(d.getDate() + i);
          const dow = d.getDay();
          return '<div class="gantt-grid-cell' + (dow === 0 || dow === 6 ? ' weekend' : '') + (D.iso(d) === D.TODAY ? ' today' : '') + '" style="width:' + w + 'px"></div>';
        }).join('') + '</div>' +
        '<div class="gantt-bar ' + (conflict ? 'conflict' : '') + (late ? ' late' : '') + (canDrag ? ' draggable' : '') + '" ' +
        'data-task-id="' + t.id + '" data-open-task="' + t.id + '" data-start="' + t.start + '" data-end="' + t.end + '" ' +
        'style="left:' + left + 'px;width:' + barWidth + 'px;--bar-color:' + statusColor + '" ' +
        'title="' + escapeHtml(title) + '">' +
        '<div class="gantt-bar-progress" style="width:' + progress + '%"></div>' +
        '<span class="gantt-bar-label">' + escapeHtml(t.title) + '</span>' +
        (conflict ? '<span class="gantt-conflict-icon" title="Конфликт FS: задача начинается раньше окончания предшественника">!</span>' : '') +
        (pred ? '<span class="gantt-fs-mark" title="Имеет FS-предшественника">⤳</span>' : '') +
        '</div></div>';
    }).join('');

    // FS-стрелки (SVG слой)
    const indexById = {};
    tasks.forEach((t, i) => { indexById[t.id] = i; });
    let arrows = '';
    tasks.forEach((t, i) => {
      if (!t.dependsOn || indexById[t.dependsOn] === undefined) return;
      const parentIdx = indexById[t.dependsOn];
      const parent = tasks[parentIdx];
      const x1 = (dayDiff(parent.end, min) + 1) * w;
      const y1 = parentIdx * rowHeight + rowHeight / 2;
      const x2 = dayDiff(t.start, min) * w;
      const y2 = i * rowHeight + rowHeight / 2;
      const midX = Math.max(x1 + 10, x2 - 10);
      const arrowTitle = 'FS (finish-to-start): «' + parent.title + '» → «' + t.title + '». ' +
        'Следующая задача должна начинаться не раньше ' + parent.end + '.';
      const conflictClass = conflictIds.has(t.id) ? ' conflict' : '';
      arrows += '<g class="gantt-arrow-group' + conflictClass + '" data-from="' + parent.id + '" data-to="' + t.id + '">' +
        '<title>' + escapeHtml(arrowTitle) + '</title>' +
        '<path class="gantt-arrow' + conflictClass + '" d="M ' + x1 + ' ' + y1 + ' L ' + midX + ' ' + y1 + ' L ' + midX + ' ' + y2 + ' L ' + x2 + ' ' + y2 + '" marker-end="url(#arrowhead)"/>' +
        '<path class="gantt-arrow-hit" d="M ' + x1 + ' ' + y1 + ' L ' + midX + ' ' + y1 + ' L ' + midX + ' ' + y2 + ' L ' + x2 + ' ' + y2 + '"/>' +
        '</g>';
    });

    const todayX = dayDiff(D.TODAY, min) * w;

    const alertText = visibleConflicts.slice(0, 3).map(c => {
      const child = S.task(c.taskId), parent = S.task(c.parentId);
      return '«' + (child ? child.title : c.taskId) + '» на ' + c.days + ' д. раньше, чем заканчивается «' + (parent ? parent.title : c.parentId) + '»';
    }).join('; ');

    container.innerHTML =
      '<div class="gantt-toolbar">' +
        '<div class="gantt-legend">' + Object.keys(D.STATUSES).map(k =>
          '<span class="legend-item"><i style="background:' + D.STATUSES[k].color + '"></i>' + D.STATUSES[k].label + '</span>').join('') +
        '</div>' +
        '<div class="gantt-controls">' +
          '<div class="gantt-scale">' +
            ['day', 'week', 'month'].map(k => '<button data-scale="' + k + '" class="' + (scaleLabel() === k ? 'active' : '') + '">' +
              ({ day: 'День', week: 'Неделя', month: 'Месяц' })[k] + '</button>').join('') +
          '</div>' +
          '<div class="gantt-zoom">' +
            '<button class="zoom-btn" data-zoom="out" title="Уменьшить масштаб">−</button>' +
            '<input type="range" min="' + MIN_ZOOM + '" max="' + MAX_ZOOM + '" step="1" value="' + Math.round(pxPerDay) + '" id="gantt-zoom-range" title="Масштаб: пикселей на день">' +
            '<button class="zoom-btn" data-zoom="in" title="Увеличить масштаб">+</button>' +
            '<span class="zoom-value">' + Math.round(pxPerDay) + ' px/день</span>' +
            '<button class="btn btn-ghost zoom-fit" data-zoom="fit" title="Показать весь период">Вписать</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gantt-hint">⤳ <strong>FS (finish-to-start)</strong>: стрелка идёт от задачи-предшественника к зависимой — она не должна начинаться раньше, чем закончится предшественник. Наведите на стрелку для деталей. · Колесо мыши над диаграммой — масштаб вокруг курсора, Shift+колесо — прокрутка.</div>' +
      (visibleConflicts.length ? '<div class="gantt-alert">⚠ Конфликты FS (' + visibleConflicts.length + '): ' + alertText + (visibleConflicts.length > 3 ? ' и ещё ' + (visibleConflicts.length - 3) : '') + '</div>' : '') +
      '<div class="gantt-shell">' +
        '<div class="gantt-labels" style="padding-top:' + headerHeight + 'px">' +
          tasks.map(t => {
            const u = S.user(t.assigneeId);
            const pred = t.dependsOn ? allTasks.find(x => x.id === t.dependsOn) : null;
            return '<div class="gantt-label" style="height:' + rowHeight + 'px" data-open-task="' + t.id + '">' +
              '<div class="gantt-label-title">' + (pred ? '<span class="label-fs" title="FS-зависимость">⤳</span>' : '') + escapeHtml(t.title) + '</div>' +
              '<div class="gantt-label-meta">' + (u ? escapeHtml(u.name) : '—') + ' · ' + t.start + ' → ' + t.end + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="gantt-scroll" id="gantt-scroll">' +
          '<div class="gantt-inner" style="width:' + width + 'px">' +
            '<div class="gantt-header" style="height:' + headerHeight + 'px">' +
              '<div class="gantt-months">' + monthsHtml + '</div>' +
              '<div class="gantt-cells">' + cellsHtml + '</div>' +
            '</div>' +
            '<div class="gantt-body" style="height:' + (tasks.length * rowHeight) + 'px">' +
              '<div class="gantt-today-line" style="left:' + todayX + 'px"></div>' +
              '<svg class="gantt-arrows" width="' + width + '" height="' + (tasks.length * rowHeight) + '">' +
                '<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#94a3b8"/></marker></defs>' +
                arrows +
              '</svg>' +
              rows +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (tasks.length ? '' : '<div class="empty-state">Нет задач по выбранным фильтрам</div>');

    const scroll = container.querySelector('#gantt-scroll');
    if (scroll) {
      if (pendingFocus) {
        scroll.scrollLeft = pendingFocus.day * w - pendingFocus.offsetX;
        pendingFocus = null;
      } else {
        scroll.scrollLeft = clamp(scrollX, 0, Math.max(0, width - scroll.clientWidth));
      }
      scrollX = scroll.scrollLeft;
      scroll.onscroll = () => { scrollX = scroll.scrollLeft; };

      scroll.addEventListener('wheel', e => {
        if (e.shiftKey) {
          scroll.scrollLeft += e.deltaY;
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomAt(container, e.clientX, factor);
      }, { passive: false });
    }

    bindDrag(container, min, w, rowHeight, tasks);
    bindDependencies(container, tasks, allTasks);
  }

  /* Масштаб вокруг заданной точки: дата под курсором остаётся на месте */
  function zoomTo(px, clientX) {
    if (!lastContainer || !lastRender) return;
    const scroll = lastContainer.querySelector('#gantt-scroll');
    if (!scroll) return;
    const next = clamp(Number(px), MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - pxPerDay) < 0.01) return;
    const rect = scroll.getBoundingClientRect();
    const offsetX = clientX === undefined ? scroll.clientWidth / 2 : clamp(clientX - rect.left, 0, scroll.clientWidth);
    const anchorDay = (scroll.scrollLeft + offsetX) / lastRender.w;
    pxPerDay = next;
    pendingFocus = { day: anchorDay, offsetX };
    render(lastContainer);
  }

  function zoomAt(container, clientX, factor) {
    zoomTo(pxPerDay * factor, clientX);
  }

  function zoomBy(factor) {
    if (!lastContainer) return;
    const scroll = lastContainer.querySelector('#gantt-scroll');
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    zoomAt(lastContainer, rect.left + scroll.clientWidth / 2, factor);
  }

  function fit() {
    if (!lastContainer || !lastRender) return;
    const scroll = lastContainer.querySelector('#gantt-scroll');
    if (!scroll) return;
    pxPerDay = clamp((scroll.clientWidth - 8) / lastRender.totalDays, MIN_ZOOM, MAX_ZOOM);
    pendingFocus = { day: 0, offsetX: 0 };
    render(lastContainer);
  }

  function bindDependencies(container, tasks, allTasks) {
    const barMap = {};
    container.querySelectorAll('.gantt-bar').forEach(b => { barMap[b.dataset.taskId] = b; });
    const groups = Array.from(container.querySelectorAll('.gantt-arrow-group'));

    function clearHighlights() {
      container.querySelectorAll('.dep-related').forEach(el => el.classList.remove('dep-related'));
    }
    function highlight(id) {
      clearHighlights();
      const related = new Set([id]);
      allTasks.forEach(t => {
        if (t.dependsOn === id) related.add(t.id);
        if (t.id === id && t.dependsOn) related.add(t.dependsOn);
      });
      related.forEach(r => { if (barMap[r]) barMap[r].classList.add('dep-related'); });
      groups.forEach(g => {
        if (related.has(g.dataset.from) && related.has(g.dataset.to)) g.classList.add('dep-related');
      });
    }

    container.querySelectorAll('.gantt-bar').forEach(bar => {
      bar.addEventListener('mouseenter', () => highlight(bar.dataset.taskId));
      bar.addEventListener('mouseleave', clearHighlights);
    });
    groups.forEach(g => {
      g.addEventListener('mouseenter', () => {
        highlight(g.dataset.to);
        highlight(g.dataset.from);
        container.querySelectorAll('.gantt-arrow-group').forEach(x => {
          if (x.dataset.from === g.dataset.from && x.dataset.to === g.dataset.to) x.classList.add('dep-related');
        });
      });
      g.addEventListener('mouseleave', clearHighlights);
      g.addEventListener('click', () => global.TrackerApp.openTask(g.dataset.to));
    });
  }

  function bindDrag(container, min, w, rowHeight, tasks) {
    const bars = container.querySelectorAll('.gantt-bar.draggable');
    bars.forEach(bar => {
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX;
        const origStart = this.dataset.start;
        const origEnd = this.dataset.end;
        const taskId = this.dataset.taskId;
        const el = this;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');

        function onMove(ev) {
          const deltaDays = Math.round((ev.clientX - startX) / w);
          if (deltaDays === 0) return;
          const ns = addDays(origStart, deltaDays);
          const ne = addDays(origEnd, deltaDays);
          el.style.left = (dayDiff(ns, min) * w) + 'px';
          el.dataset.previewStart = ns;
          el.dataset.previewEnd = ne;
        }
        function onUp() {
          el.classList.remove('dragging');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          const ns = el.dataset.previewStart, ne = el.dataset.previewEnd;
          delete el.dataset.previewStart; delete el.dataset.previewEnd;
          if (ns && ne && (ns !== origStart || ne !== origEnd)) {
            const affected = fsConflicts(S.getState().tasks.map(t => {
              if (t.id === taskId) return Object.assign({}, t, { start: ns, end: ne });
              if (t.dependsOn === taskId) return Object.assign({}, t, { start: addDays(t.start, dayDiff(ns, origStart)), end: addDays(t.end, dayDiff(ns, origStart)) });
              return t;
            }));
            const msg = affected.length
              ? 'Сдвиг создаёт конфликт FS у ' + affected.length + ' зависимых задач. Всё равно применить?'
              : 'Применить новые даты: ' + ns + ' — ' + ne + '?';
            if (global.confirm(msg)) {
              S.updateTask(taskId, { start: ns, end: ne });
              global.TrackerApp.renderAll();
            } else {
              global.TrackerApp.renderAll();
            }
          }
        }
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
      });
    });
  }

  global.TrackerGantt = {
    render, getFilters, setFilters, setScale, getScale, getZoom, setZoom, zoomTo, zoomBy, fit,
    fsConflicts, filteredTasks
  };
})(window);
