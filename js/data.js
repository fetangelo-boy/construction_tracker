/* Демо-данные и справочники трекера */
(function (global) {
  'use strict';

  const ROLES = {
    manager: { label: 'Руководитель проекта', short: 'РП', level: 4 },
    foreman: { label: 'Прораб / менеджер', short: 'Прораб', level: 3 },
    worker: { label: 'Исполнитель', short: 'Исполнитель', level: 2 },
    observer: { label: 'Наблюдатель', short: 'Наблюдатель', level: 1 }
  };

  const STATUSES = {
    'not-started': { label: 'Не начата', color: '#94a3b8', order: 1 },
    'in-progress': { label: 'В работе', color: '#3b82f6', order: 2 },
    'review': { label: 'На проверке', color: '#8b5cf6', order: 3 },
    'done': { label: 'Выполнена', color: '#22c55e', order: 4 },
    'blocked': { label: 'Заблокирована', color: '#ef4444', order: 5 },
    'cancelled': { label: 'Отменена', color: '#64748b', order: 6 }
  };

  const PRIORITIES = {
    low: { label: 'Низкий', color: '#94a3b8' },
    normal: { label: 'Обычный', color: '#3b82f6' },
    high: { label: 'Высокий', color: '#f59e0b' },
    critical: { label: 'Критический', color: '#ef4444' }
  };

  const PROJECT_STATUSES = {
    planning: { label: 'Планирование', color: '#8b5cf6' },
    active: { label: 'В работе', color: '#3b82f6' },
    paused: { label: 'Приостановлен', color: '#f59e0b' },
    finished: { label: 'Завершён', color: '#22c55e' }
  };

  const STAGES = ['Подготовка', 'Фундамент', 'Стены', 'Кровля', 'Инженерные сети', 'Отделка', 'Благоустройство'];

  const USERS = [
    { id: 'u1', name: 'Сергей Волков', role: 'manager', initials: 'СВ', color: '#f97316', position: 'Руководитель проекта' },
    { id: 'u2', name: 'Андрей Ковалёв', role: 'foreman', initials: 'АК', color: '#3b82f6', position: 'Прораб' },
    { id: 'u3', name: 'Дмитрий Соколов', role: 'foreman', initials: 'ДС', color: '#8b5cf6', position: 'Менеджер' },
    { id: 'u4', name: 'Иван Петров', role: 'worker', initials: 'ИП', color: '#14b8a6', position: 'Бригадир' },
    { id: 'u5', name: 'Павел Морозов', role: 'worker', initials: 'ПМ', color: '#eab308', position: 'Монтажник' },
    { id: 'u6', name: 'Олег Сидоров', role: 'worker', initials: 'ОС', color: '#ec4899', position: 'Электрик' },
    { id: 'u7', name: 'Мария Белова', role: 'observer', initials: 'МБ', color: '#6366f1', position: 'Представитель заказчика' },
    { id: 'u8', name: 'Николай Егоров', role: 'worker', initials: 'НЕ', color: '#06b6d4', position: 'Отделочник' }
  ];

  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function shift(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return iso(d);
  }

  // Базовый «сегодня» для демо-данных — 17 ноября 2026
  const TODAY = '2026-11-17';

  const PROJECTS = [
    {
      id: 'p1',
      name: 'ЖК «Северный» — корп. 3',
      address: 'Москва, Дмитровское ш., 107',
      client: 'ООО «СеверДевелопмент»',
      start: '2026-10-01',
      end: '2027-03-15',
      status: 'active',
      managerId: 'u1',
      memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
      stages: ['Подготовка', 'Фундамент', 'Стены', 'Кровля', 'Инженерные сети', 'Отделка']
    },
    {
      id: 'p2',
      name: 'Реконструкция склада «Логика»',
      address: 'МО, Химки, ул. Транспортная, 12',
      client: 'АО «Логика»',
      start: '2026-11-01',
      end: '2027-01-30',
      status: 'active',
      managerId: 'u2',
      memberIds: ['u2', 'u3', 'u5', 'u6', 'u7'],
      stages: ['Подготовка', 'Фундамент', 'Стены', 'Инженерные сети']
    },
    {
      id: 'p3',
      name: 'Коттедж «Лесной»',
      address: 'МО, Красногорск, Лесная ул., 8',
      client: 'Частный заказчик',
      start: '2026-12-01',
      end: '2027-06-30',
      status: 'planning',
      managerId: 'u1',
      memberIds: ['u1', 'u3', 'u4', 'u7'],
      stages: ['Подготовка', 'Фундамент', 'Стены', 'Кровля', 'Отделка']
    }
  ];

  const TASKS = [
    // Проект 1
    { id: 't1', projectId: 'p1', title: 'Разработка рабочей документации', stage: 'Подготовка', assigneeId: 'u3', collaboratorIds: ['u1'], start: '2026-10-01', end: '2026-10-20', dependsOn: null, status: 'done', progress: 100, priority: 'high', description: 'Подготовить комплект рабочих чертежей для возведения корп. 3.', comments: [], files: [], history: [] },
    { id: 't2', projectId: 'p1', title: 'Оформление разрешения на строительство', stage: 'Подготовка', assigneeId: 'u1', collaboratorIds: [], start: '2026-10-21', end: '2026-11-05', dependsOn: 't1', status: 'done', progress: 100, priority: 'critical', description: 'Получить разрешение в Мосгосэкспертизе.', comments: [], files: [], history: [] },
    { id: 't3', projectId: 'p1', title: 'Разбивка осей и геодезия', stage: 'Подготовка', assigneeId: 'u2', collaboratorIds: ['u4'], start: '2026-10-21', end: '2026-10-28', dependsOn: 't1', status: 'done', progress: 100, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't4', projectId: 'p1', title: 'Земляные работы и котлован', stage: 'Фундамент', assigneeId: 'u4', collaboratorIds: ['u5'], start: '2026-10-29', end: '2026-11-14', dependsOn: 't3', status: 'done', progress: 100, priority: 'high', description: 'Выемка грунта, укрепление стенок.', comments: [], files: [], history: [] },
    { id: 't5', projectId: 'p1', title: 'Монтаж опалубки и арматуры', stage: 'Фундамент', assigneeId: 'u4', collaboratorIds: ['u5'], start: '2026-11-16', end: '2026-11-27', dependsOn: 't4', status: 'in-progress', progress: 45, priority: 'high', description: 'Опалубка фундаментной плиты.', comments: [], files: [], history: [] },
    { id: 't6', projectId: 'p1', title: 'Заливка фундаментной плиты', stage: 'Фундамент', assigneeId: 'u5', collaboratorIds: ['u4'], start: '2026-11-28', end: '2026-12-03', dependsOn: 't5', status: 'not-started', progress: 0, priority: 'critical', description: '', comments: [], files: [], history: [] },
    { id: 't7', projectId: 'p1', title: 'Гидроизоляция фундамента', stage: 'Фундамент', assigneeId: 'u5', collaboratorIds: [], start: '2026-12-04', end: '2026-12-10', dependsOn: 't6', status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't8', projectId: 'p1', title: 'Возведение стен 1–3 этажа', stage: 'Стены', assigneeId: 'u4', collaboratorIds: ['u5', 'u8'], start: '2026-12-11', end: '2027-01-20', dependsOn: 't7', status: 'not-started', progress: 0, priority: 'high', description: 'Кирпичная кладка, перемычки.', comments: [], files: [], history: [] },
    { id: 't9', projectId: 'p1', title: 'Монтаж плит перекрытия', stage: 'Стены', assigneeId: 'u5', collaboratorIds: [], start: '2027-01-21', end: '2027-02-05', dependsOn: 't8', status: 'not-started', progress: 0, priority: 'high', description: '', comments: [], files: [], history: [] },
    { id: 't10', projectId: 'p1', title: 'Устройство кровли', stage: 'Кровля', assigneeId: 'u5', collaboratorIds: [], start: '2027-02-06', end: '2027-02-25', dependsOn: 't9', status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't11', projectId: 'p1', title: 'Электромонтаж', stage: 'Инженерные сети', assigneeId: 'u6', collaboratorIds: [], start: '2027-02-26', end: '2027-03-10', dependsOn: 't9', status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't12', projectId: 'p1', title: 'Отделка квартир', stage: 'Отделка', assigneeId: 'u8', collaboratorIds: [], start: '2027-03-11', end: '2027-03-15', dependsOn: 't11', status: 'not-started', progress: 0, priority: 'low', description: '', comments: [], files: [], history: [] },
    // Проект 2
    { id: 't13', projectId: 'p2', title: 'Обследование здания', stage: 'Подготовка', assigneeId: 'u3', collaboratorIds: [], start: '2026-11-01', end: '2026-11-08', dependsOn: null, status: 'done', progress: 100, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't14', projectId: 'p2', title: 'Демонтаж старых конструкций', stage: 'Подготовка', assigneeId: 'u5', collaboratorIds: ['u6'], start: '2026-11-09', end: '2026-11-16', dependsOn: 't13', status: 'blocked', progress: 60, priority: 'critical', description: 'Задержка из-за отсутствия допуска подрядчика.', comments: [], files: [], history: [] },
    { id: 't15', projectId: 'p2', title: 'Усиление фундамента', stage: 'Фундамент', assigneeId: 'u5', collaboratorIds: [], start: '2026-11-17', end: '2026-11-28', dependsOn: 't14', status: 'in-progress', progress: 20, priority: 'high', description: '', comments: [], files: [], history: [] },
    { id: 't16', projectId: 'p2', title: 'Монтаж новых стен', stage: 'Стены', assigneeId: 'u5', collaboratorIds: [], start: '2026-11-29', end: '2026-12-15', dependsOn: 't15', status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't17', projectId: 'p2', title: 'Прокладка кабельных линий', stage: 'Инженерные сети', assigneeId: 'u6', collaboratorIds: [], start: '2026-12-16', end: '2026-12-28', dependsOn: 't16', status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    // Проект 3
    { id: 't18', projectId: 'p3', title: 'Подготовка участка', stage: 'Подготовка', assigneeId: 'u4', collaboratorIds: [], start: '2026-12-01', end: '2026-12-10', dependsOn: null, status: 'not-started', progress: 0, priority: 'normal', description: '', comments: [], files: [], history: [] },
    { id: 't19', projectId: 'p3', title: 'Разработка проекта дома', stage: 'Подготовка', assigneeId: 'u3', collaboratorIds: ['u1'], start: '2026-12-01', end: '2026-12-25', dependsOn: null, status: 'not-started', progress: 0, priority: 'high', description: '', comments: [], files: [], history: [] },
    { id: 't20', projectId: 'p3', title: 'Заливка фундамента', stage: 'Фундамент', assigneeId: 'u4', collaboratorIds: [], start: '2026-12-26', end: '2027-01-15', dependsOn: 't18', status: 'not-started', progress: 0, priority: 'high', description: '', comments: [], files: [], history: [] }
  ];

  const NOTIFICATIONS = [
    { id: 'n1', type: 'assign', title: 'Назначена задача', text: '«Монтаж опалубки и арматуры» — вы ответственный.', userId: 'u4', taskId: 't5', read: false, date: '2026-11-16T09:12:00' },
    { id: 'n2', type: 'deadline', title: 'Срок истекает', text: '«Демонтаж старых конструкций» — просрочена на 1 день.', userId: 'u2', taskId: 't14', read: false, date: '2026-11-17T08:00:00' },
    { id: 'n3', type: 'comment', title: 'Новый комментарий', text: 'Сергей Волков прокомментировал «Земляные работы и котлован».', userId: 'u4', taskId: 't4', read: false, date: '2026-11-15T16:40:00' },
    { id: 'n4', type: 'status', title: 'Статус изменён', text: 'Задача «Усиление фундамента» переведена в «В работе».', userId: 'u1', taskId: 't15', read: true, date: '2026-11-17T10:05:00' }
  ];

  global.TrackerData = { ROLES, STATUSES, PRIORITIES, PROJECT_STATUSES, STAGES, USERS, PROJECTS, TASKS, NOTIFICATIONS, TODAY, iso, shift };
})(window);
