'use strict';
/*
  Путь клиента — кликабельный прототип системы SolutionCRM.
  Все данные выдуманные и хранятся только в этом браузере (localStorage).
  Процесс, блоки и правила взяты из BRIEF.md и SYSTEM.md.
*/

// ===== Справочники процесса =====
const KEY = 'solution-client-path:v1';
const VERSION = 1;

// Цвета этапов — пастельные, как у этапов воронки в CRM
const STAGES = [
  { n: 1, title: 'Заявка и передача', color: '#99CCFF' },
  { n: 2, title: 'Старт и ТЗ', color: '#FFCC66' },
  { n: 3, title: 'Блоки 2–4', color: '#F2E36B' },
  { n: 4, title: 'Обучение и сдача', color: '#B6E36B' },
  { n: 5, title: 'После акта', color: '#7FDDB4' },
];

const ROLES = { sales: 'Менеджер по продажам', am: 'Аккаунт-менеджер', analyst: 'Аналитик', lead: 'Руководитель', admin: 'Админ' };

const BLOCK_TPL = [
  { n: 1, title: 'Требования и ТЗ', checks: [], tasks: ['Опросник заполнен, доступы получены', 'Установочная встреча проведена', 'Протокол и черновик ТЗ готовы', 'ТЗ отредактировано аналитиком'] },
  { n: 2, title: 'Аккаунт и структура', checks: ['pipelines', 'fields', 'users'], tasks: ['Шаблон аккаунта применён', 'Воронки и этапы настроены', 'Поля и роли настроены'] },
  { n: 3, title: 'Каналы и интеграции', checks: ['channels'], tasks: ['Почта и мессенджеры подключены', 'Телефония подключена', 'Заявки с сайта приходят в amoCRM'] },
  { n: 4, title: 'База и автоматизации', checks: ['automations'], tasks: ['База клиентов импортирована', 'Автоматизации и триггеры настроены'] },
  { n: 5, title: 'Обучение и сдача', checks: [], tasks: ['Курс обучения выдан клиенту', 'Обучение проведено', 'Видео результата загружено на Яндекс Диск'] },
];

const CHECK_LABELS = { pipelines: 'Воронки', fields: 'Поля сделки', users: 'Пользователи', channels: 'Каналы связи', automations: 'Автоматизации' };

const RANGES = [
  { v: '0.5', label: 'до 0,5 ч' },
  { v: '1', label: 'до 1 ч' },
  { v: '3', label: 'до 3 ч' },
  { v: 'more', label: 'больше' },
];

const MODELS = [
  { id: 'deepseek', name: 'DeepSeek', key: true },
  { id: 'claude', name: 'Claude', key: false },
  { id: 'chatgpt', name: 'ChatGPT', key: false },
  { id: 'yandexgpt', name: 'YandexGPT', key: true },
  { id: 'gigachat', name: 'GigaChat', key: false },
];
const LLM_TASKS = { protocol: 'Протокол встречи', tz: 'Черновик ТЗ', audit: 'Черновик аудита' };

const TOUCHES = [
  { day: 7, title: 'Вопрос клиенту «что вам мешает?»', role: 'am' },
  { day: 30, title: 'Контрольный созвон по цифрам клиента', role: 'am' },
  { day: 45, title: 'Аудит: проверить черновик и цифры (до 60-го дня)', role: 'analyst' },
  { day: 76, title: 'Напоминание о продлении (за 14 дней)', role: 'am' },
  { day: 90, title: 'Продление', role: 'am' },
];

const DOC_TYPES = { act: 'Акт', invoice: 'Счёт на поддержку' };
const DOC_STATUS = { draft: 'Не направлено клиенту', sent: 'Направлено клиенту', accepted: 'Принято клиентом', rejected: 'Не принято клиентом', signed: 'Подписано юридически' };
const BLOCK_STATUS = { work: 'В работе', sent: 'На приёмке у клиента', accepted: 'Принят', auto: 'Принят автоматически', returned: 'Возврат: «не ок»' };

// Производственный календарь РФ: выходные праздничные дни (кроме обычных суббот и воскресений).
// 2026 — по утверждённому календарю, 2027 — предварительно, проверить по официальному.
const HOLIDAYS_DEFAULT = [
  '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  '2026-02-23', '2026-03-09', '2026-05-01', '2026-05-11', '2026-06-12', '2026-11-04', '2026-12-31',
  '2027-01-01', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
  '2027-02-23', '2027-03-08', '2027-05-03', '2027-05-10', '2027-06-14', '2027-11-04',
];

// ===== Состояние =====
let S = null;
const ui = { tab: {}, reasonFor: null, adminTab: 'users', stage: 0, onlyMine: false, onlyProblems: false, weekShift: 0, owner: '' };

// ===== Мелкие помощники =====
const $ = (sel, root = document) => root.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const numRu = n => String(Math.round(n * 10) / 10).replace('.', ',');
const pad = n => String(n).padStart(2, '0');
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// ===== Даты =====
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const realToday = () => iso(new Date());
const today = () => (S && S.testDate) || realToday();
const clock = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function fmt(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return d + '.' + m + '.' + y; }
function isWorkDay(s) {
  const wd = parse(s).getDay();
  const hol = S ? S.settings.holidays : HOLIDAYS_DEFAULT;
  return wd !== 0 && wd !== 6 && !hol.includes(s);
}
function addWorkDays(s, n) { let c = s, k = 0; while (k < n) { c = addDays(c, 1); if (isWorkDay(c)) k++; } return c; }
function prevWorkDay(s) { let c = addDays(s, -1); while (!isWorkDay(c)) c = addDays(c, -1); return c; }
function mondayOf(s) { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); }
function weekKey(s) {
  const d = parse(s);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + '-W' + pad(wk);
}
function parseUserDate(str) {
  const t = String(str).trim();
  let m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  let s = null;
  if (m) s = `${m[3]}-${m[2]}-${m[1]}`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) s = t;
  // отсекаем несуществующие даты вроде 31.31.2026
  return s && iso(parse(s)) === s ? s : null;
}

// ===== Хранение =====
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.version === VERSION ? d : null;
  } catch (e) { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Браузер не дал сохранить данные. Скачайте копию в разделе «Данные», чтобы ничего не потерять.'); }
}

// ===== Начальные данные =====
function defaultSettings() {
  return {
    autoAcceptDays: 3, overrunPct: 25, promiseTarget: 80,
    rate: 1500, overhead: 20, capacity: 112, moreHours: 5,
    holidays: HOLIDAYS_DEFAULT.slice(),
    llm: { protocol: 'deepseek', tz: 'deepseek', audit: 'deepseek', fallback: 'yandexgpt' },
    botTexts: {
      blockSent: 'Блок {n} «{title}» готов. Проверьте, пожалуйста, и ответьте кнопкой.',
      reminder: 'Напоминаем: блок {n} ждёт вашего ответа. Если ответа не будет до {date}, блок примем автоматически.',
      promise: 'Приняли задачу: «{text}». Срок — {date}.',
      promiseDone: 'Задача выполнена: «{text}». Подтвердите, пожалуйста, кнопкой.',
      docSent: '{type} № {num} готов. Проверьте и ответьте кнопкой.',
    },
  };
}
function defaultPackages() {
  return {
    base: { name: 'Базовый', price: 60000, planHours: 20, items: { pipelines: 1, fields: 10, users: 3, channels: 1, automations: 3 } },
    ext: { name: 'Расширенный', price: 120000, planHours: 40, items: { pipelines: 3, fields: 20, users: 5, channels: 3, automations: 8 } },
    pro: { name: 'Профессиональный', price: 210000, planHours: 70, items: { pipelines: 5, fields: 40, users: 10, channels: 5, automations: 15 } },
  };
}
const MAIN_ADMIN = { id: 'u_admin', name: 'Главный админ', login: 'admin', roles: ['admin', 'lead'], isMain: true, tg: true };

function baseState() {
  return {
    version: VERSION, testDate: '', currentUserId: 'u_admin',
    settings: defaultSettings(), packages: defaultPackages(), packageOrder: ['base', 'ext', 'pro'],
    users: [Object.assign({}, MAIN_ADMIN)],
    projects: [], promises: [], documents: [], hours: [], bot: [], meetings: [], journal: [], history: [],
    seq: { act: 0, invoice: 0 },
  };
}

function makeBlocks(statuses, pkg, T) {
  return BLOCK_TPL.map((t, i) => {
    const st = statuses[i] || 'work';
    const passed = st === 'accepted' || st === 'auto' || st === 'sent';
    const items = {};
    if (passed) t.checks.forEach(k => { items[k] = { need: pkg.items[k], have: pkg.items[k], state: 'ok', comment: '' }; });
    return {
      n: t.n, status: st,
      tasks: t.tasks.map(x => ({ id: uid(), text: x, done: passed })),
      check: { ran: passed, items },
      sentAt: passed ? addDays(T, -40 + i * 6) : '',
      acceptedAt: st === 'accepted' || st === 'auto' ? addDays(T, -38 + i * 6) : '',
      answer: st === 'accepted' ? 'ok' : '', reason: '', reminded: false,
    };
  });
}

function demoState() {
  const T = realToday();
  const s = baseState();
  S = s; // помощники дат читают календарь из S
  s.users.push(
    { id: 'u_lead', name: 'Мария Лебедева', login: 'm.lebedeva', roles: ['lead'], tg: true },
    { id: 'u_sales', name: 'Ирина Ковалёва', login: 'i.kovaleva', roles: ['sales'], tg: true },
    { id: 'u_am', name: 'Олег Мартынов', login: 'o.martynov', roles: ['am'], tg: true },
    { id: 'u_an1', name: 'Дарья Соколова', login: 'd.sokolova', roles: ['analyst'], tg: true },
    { id: 'u_an2', name: 'Павел Ершов', login: 'p.ershov', roles: ['analyst', 'am'], tg: false },
    { id: 'u_admin2', name: 'Никита Белов', login: 'n.belov', roles: ['admin'], tg: true },
  );
  const P = s.packages;
  const mk = (id, client, industry, pkgId, team, opts) => Object.assign({
    id, client, industry, deal: String(48000 + Math.floor(Math.random() * 900)), packageId: pkgId,
    createdAt: addDays(T, -20), started: true, tgLinked: true, tgCode: 'SC-' + id.toUpperCase(),
    team, account: Object.assign({}, P[pkgId].items), blocks: makeBlocks([], P[pkgId], T), actDate: '', touchesDone: {}, contractor: false,
  }, opts);
  const teamA = { sales: 'u_sales', am: 'u_am', analyst: 'u_an1' };
  const teamB = { sales: 'u_sales', am: 'u_an2', analyst: 'u_an2' };
  const teamC = { sales: 'u_sales', am: 'u_am', analyst: 'u_an2' };

  const p1 = mk('p1', 'Северный ветер', 'Стройматериалы', 'base', teamA, { started: false, tgLinked: false, createdAt: addDays(T, -1) });
  const p2 = mk('p2', 'Мята', 'Сеть кофеен', 'ext', teamA, { createdAt: addDays(T, -9) });
  p2.blocks[0].tasks.forEach(t => { t.done = true; });
  p2.blocks[0].status = 'sent'; p2.blocks[0].sentAt = prevWorkDay(T);
  const p3 = mk('p3', 'Ладога Девелопмент', 'Застройщик', 'pro', teamB, { blocks: makeBlocks(['accepted', 'returned'], P.pro, T) });
  p3.blocks[1].tasks.forEach((t, i) => { t.done = i < 2; });
  p3.blocks[1].reason = 'В воронке «Ипотека» нет этапа «Одобрено банком», без него менеджеры не смогут работать.';
  p3.blocks[1].sentAt = addDays(T, -4);
  const p4 = mk('p4', 'Профмебель', 'Производство мебели', 'ext', teamC, { blocks: makeBlocks(['accepted', 'accepted', 'accepted', 'work'], P.ext, T) });
  p4.blocks[3].tasks[0].done = true;
  p4.account.fields = 18; p4.account.automations = 6;
  const p5 = mk('p5', 'Кедр', 'Окна и двери', 'base', teamA, { blocks: makeBlocks(['accepted', 'accepted', 'accepted', 'accepted', 'accepted'], P.base, T) });
  const p6 = mk('p6', 'Зелёный квартал', 'Ландшафтный дизайн', 'base', teamA, {
    blocks: makeBlocks(['accepted', 'accepted', 'accepted', 'accepted', 'auto'], P.base, T), actDate: addDays(T, -35), touchesDone: { 7: true, 30: true },
  });
  s.projects.push(p1, p2, p3, p4, p5, p6);

  s.seq.act = 2; s.seq.invoice = 1;
  s.documents.push(
    { id: uid(), projectId: 'p5', type: 'act', num: 'А-002', status: 'sent', createdAt: addDays(T, -2), reason: '' },
    { id: uid(), projectId: 'p6', type: 'act', num: 'А-001', status: 'signed', createdAt: addDays(T, -37), reason: '' },
    { id: uid(), projectId: 'p6', type: 'invoice', num: 'С-001', status: 'accepted', createdAt: addDays(T, -28), reason: '' },
  );

  // 10 закрытых или просроченных обещаний: 8 выполнены в срок → метрика 80 %
  const pr = (projectId, text, ownerId, due, status, doneAt) => ({ id: uid(), projectId, text, ownerId, due, status, doneAt: doneAt || '', moves: [], informed: true, confirmed: status === 'done' });
  s.promises.push(
    pr('p6', 'Добавить поле «Площадь участка»', 'u_an1', addDays(T, -30), 'done', addDays(T, -31)),
    pr('p6', 'Настроить отчёт по источникам', 'u_an1', addDays(T, -26), 'done', addDays(T, -26)),
    pr('p5', 'Подключить вторую линию телефонии', 'u_an1', addDays(T, -21), 'done', addDays(T, -22)),
    pr('p5', 'Прислать доступы к почте в чат', 'u_am', addDays(T, -18), 'done', addDays(T, -18)),
    pr('p4', 'Перенести базу из Excel', 'u_an2', addDays(T, -15), 'done', addDays(T, -16)),
    pr('p4', 'Созвон по автоматизациям', 'u_am', addDays(T, -12), 'done', addDays(T, -12)),
    pr('p3', 'Согласовать список ролей', 'u_an2', addDays(T, -10), 'done', addDays(T, -11)),
    pr('p2', 'Прислать опросник повторно', 'u_am', addDays(T, -8), 'done', addDays(T, -8)),
    pr('p3', 'Исправить права менеджеров', 'u_an2', addDays(T, -7), 'done', addDays(T, -5)),
    pr('p4', 'Дать ответ по интеграции с 1С', 'u_an2', addDays(T, -2), 'open'),
    pr('p2', 'Показать черновик ТЗ', 'u_an1', addDays(T, 1), 'open'),
    pr('p6', 'Выгрузить цифры для созвона', 'u_am', T, 'open'),
  );

  // часы: «Зелёный квартал» — план 20 ч, факт 26 ч (+30 %)
  const wk = n => weekKey(addDays(T, -7 * n));
  ['more', 'more', 'more', 'more', 'more', '1'].forEach((r, i) => s.hours.push({ id: uid(), projectId: 'p6', userId: 'u_an1', week: wk(i + 1), range: r }));
  ['3', '3', '1'].forEach((r, i) => s.hours.push({ id: uid(), projectId: 'p4', userId: 'u_an2', week: wk(i + 1), range: r }));

  const say = (projectId, kind, text, ref, buttons, date, answer) => s.bot.push({ id: uid(), projectId, date, time: '10:15', kind, text, ref, buttons, answer: answer || null });
  say('p2', 'block', fill(s.settings.botTexts.blockSent, { n: 1, title: BLOCK_TPL[0].title }), { n: 1 }, ['ok', 'ask', 'no'], p2.blocks[0].sentAt);
  say('p3', 'block', fill(s.settings.botTexts.blockSent, { n: 2, title: BLOCK_TPL[1].title }), { n: 2 }, ['ok', 'ask', 'no'], p3.blocks[1].sentAt, { value: 'no', reason: p3.blocks[1].reason });
  const actP5 = s.documents[0];
  say('p5', 'doc', fill(s.settings.botTexts.docSent, { type: 'Акт', num: actP5.num }), { docId: actP5.id }, ['accept', 'reject'], actP5.createdAt);

  s.meetings.push({ id: uid(), projectId: 'p2', date: addDays(T, -6), title: 'Установочная встреча', model: 'deepseek', summary: 'Черновик протокола: 4 точки продаж, заявки из сайта и Яндекс Карт, нужна телефония и воронка для корпоративных заказов.' });

  const jr = (projectId, date, who, text) => s.journal.push({ id: uid(), at: date + ' 10:00', projectId, projectName: s.projects.find(p => p.id === projectId).client, who, text });
  jr('p3', p3.blocks[1].sentAt, 'Павел Ершов', 'Блок 2 «Аккаунт и структура» отправлен клиенту целиком');
  jr('p3', p3.blocks[1].sentAt, 'Клиент', 'Ответ по блоку 2: «не ок». Причина: ' + p3.blocks[1].reason);
  jr('p2', p2.blocks[0].sentAt, 'Дарья Соколова', 'Блок 1 «Требования и ТЗ» отправлен клиенту целиком');
  jr('p5', actP5.createdAt, 'Дарья Соколова', 'Акт № А-002 направлен клиенту');
  S = null;
  return s;
}

// ===== Пользователи и права =====
const me = () => S.users.find(u => u.id === S.currentUserId) || S.users[0];
const has = r => me().roles.includes(r);
const isAdmin = () => has('admin');
const canMoney = () => has('lead') || has('admin');
const userName = id => (S.users.find(u => u.id === id) || { name: 'не назначен' }).name;
const rolesText = u => u.roles.map(r => ROLES[r].toLowerCase()).join(', ');
function canSee(p) {
  const u = me();
  if (has('lead') || has('admin')) return true;
  return (has('analyst') && p.team.analyst === u.id) || (has('am') && p.team.am === u.id) || (has('sales') && p.team.sales === u.id);
}
const visibleProjects = () => S.projects.filter(canSee);
const actsAs = (p, role) => isAdmin() || p.team[role] === me().id;
const proj = id => S.projects.find(p => p.id === id);
const pkgOf = p => S.packages[p.packageId];

// ===== Логика процесса =====
const isAccepted = b => b.status === 'accepted' || b.status === 'auto';
const curBlock = p => p.blocks.find(b => !isAccepted(b));
const tplOf = b => BLOCK_TPL[b.n - 1];
const actOf = p => S.documents.find(d => d.projectId === p.id && d.type === 'act');
const tasksLeft = b => b.tasks.filter(t => !t.done).length;
const deadlineOf = b => addWorkDays(b.sentAt, S.settings.autoAcceptDays);

function stageOf(p) {
  if (!p.started) return 1;
  const b = curBlock(p);
  if (b) return b.n === 1 ? 2 : b.n <= 4 ? 3 : 4;
  return p.actDate ? 5 : 4;
}
function checkPassed(b) {
  const keys = tplOf(b).checks;
  if (!keys.length) return true;
  if (!b.check.ran) return false;
  return keys.every(k => b.check.items[k] && (b.check.items[k].state === 'ok' || b.check.items[k].state === 'confirmed'));
}
const canSend = b => (b.status === 'work' || b.status === 'returned') && tasksLeft(b) === 0 && checkPassed(b);
const touchDate = (p, day) => addDays(p.actDate, day);
const nextTouch = p => p.actDate ? TOUCHES.find(t => !p.touchesDone[t.day]) : null;

// Чей сейчас ход в проекте
function turn(p) {
  if (!p.started) return { role: 'am', userId: p.team.am, text: 'Поприветствовать клиента, согласовать даты, привязать Telegram-группу' };
  const b = curBlock(p);
  if (b) {
    if (b.status === 'sent') return { role: 'client', userId: null, text: `Блок ${b.n} у клиента на приёмке до ${fmt(deadlineOf(b))}` };
    if (b.status === 'returned') return { role: 'analyst', userId: p.team.analyst, text: `Блок ${b.n}: правки по «не ок» и повторная сверка` };
    const left = tasksLeft(b);
    return { role: 'analyst', userId: p.team.analyst, text: left ? `Блок ${b.n}: осталось задач — ${left}` : `Блок ${b.n}: пройти сверку и отправить клиенту` };
  }
  const a = actOf(p);
  if (!a) return { role: 'analyst', userId: p.team.analyst, text: 'Сформировать акт из принятых блоков' };
  if (a.status === 'draft') return { role: 'analyst', userId: p.team.analyst, text: `Направить акт № ${a.num} клиенту` };
  if (a.status === 'sent') return { role: 'client', userId: null, text: `Акт № ${a.num} у клиента` };
  if (a.status === 'rejected') return { role: 'analyst', userId: p.team.analyst, text: `Акт № ${a.num} не принят: исправить и направить снова` };
  if (a.status === 'accepted') return { role: 'analyst', userId: p.team.analyst, text: `Отметить акт № ${a.num} подписанным юридически` };
  const t = nextTouch(p);
  if (t) return { role: t.role, userId: p.team[t.role], text: `День ${t.day}: ${t.title.toLowerCase()} — ${fmt(touchDate(p, t.day))}` };
  return null;
}

// Часы и деньги
const hoursValue = r => (r === 'more' ? Number(S.settings.moreHours) : Number(r));
const factHours = p => S.hours.filter(h => h.projectId === p.id).reduce((a, h) => a + hoursValue(h.range), 0);
function overrunPct(p) { const plan = pkgOf(p).planHours; return plan ? ((factHours(p) - plan) / plan) * 100 : 0; }
const isOverrun = p => overrunPct(p) > Number(S.settings.overrunPct);
const costOf = h => h * S.settings.rate * (1 + S.settings.overhead / 100);

// Обещания
const isOverdue = x => x.status === 'open' && x.due < today();
function promiseMetric(list) {
  const done = list.filter(x => x.status === 'done');
  const counted = done.length + list.filter(isOverdue).length;
  const inTime = done.filter(x => x.doneAt <= x.due).length;
  return { counted, inTime, pct: counted ? Math.round((inTime / counted) * 100) : null };
}
function hasProblem(p) {
  const b = curBlock(p);
  return S.promises.some(x => x.projectId === p.id && isOverdue(x)) || (b && b.status === 'returned') ||
    S.documents.some(d => d.projectId === p.id && d.status === 'rejected') || (canMoney() && isOverrun(p));
}

// ===== Журнал (только дописывается) =====
function log(p, text, who) {
  S.journal.push({ id: uid(), at: today() + ' ' + clock(), projectId: p.id, projectName: p.client, who: who || me().name, text });
}
// ===== Имитация бота =====
function fill(tpl, vars) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)); }
function botSay(p, kind, text, ref, buttons) {
  S.bot.push({ id: uid(), projectId: p.id, date: today(), time: clock(), kind, text, ref: ref || null, buttons: buttons || [], answer: null });
}

// Автоприёмка и напоминания: срабатывают при каждом открытии экрана
function tick() {
  let changed = false;
  const T = today();
  S.projects.forEach(p => p.blocks.forEach(b => {
    if (b.status !== 'sent' || !b.sentAt) return;
    const dl = deadlineOf(b);
    if (!b.reminded && T >= prevWorkDay(dl) && T < dl) {
      b.reminded = true; changed = true;
      botSay(p, 'info', fill(S.settings.botTexts.reminder, { n: b.n, date: fmt(dl) }));
      log(p, `Клиенту отправлено напоминание по блоку ${b.n}`, 'Система');
    }
    if (T >= dl) {
      b.status = 'auto'; b.acceptedAt = dl; b.answer = 'auto'; changed = true;
      S.bot.filter(m => m.projectId === p.id && m.kind === 'block' && m.ref && m.ref.n === b.n && !m.answer)
        .forEach(m => { m.answer = { value: 'auto' }; });
      botSay(p, 'info', `Блок ${b.n} принят автоматически: ответа не было ${S.settings.autoAcceptDays} рабочих дня.`);
      log(p, `Блок ${b.n} принят автоматически ${fmt(dl)}: нет ответа ${S.settings.autoAcceptDays} рабочих дня`, 'Система');
    }
  }));
  return changed;
}

// ===== Настройки с историей и откатом =====
function getPath(path) { return path.reduce((o, k) => (o == null ? undefined : o[k]), S); }
function setPath(path, value, label) {
  const from = getPath(path);
  if (JSON.stringify(from) === JSON.stringify(value)) return false;
  const parent = getPath(path.slice(0, -1));
  parent[path[path.length - 1]] = value;
  S.history.push({ id: uid(), at: today() + ' ' + clock(), who: me().name, label, path, from, to: value });
  save();
  toast('Сохранено. Вернуть прежнее значение можно в «Истории изменений».');
  return true;
}
function showVal(v) {
  if (Array.isArray(v)) return v.length + ' ' + plural(v.length, 'дата', 'даты', 'дат');
  if (v && typeof v === 'object') return JSON.stringify(v);
  const s = String(v ?? '—');
  const m = MODELS.find(x => x.id === s);
  if (m) return m.name;
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

// ===== Диалоги и уведомления =====
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}
function fieldHtml(f) {
  const id = 'f_' + f.name;
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  let input;
  if (f.type === 'select') {
    input = `<select id="${id}" name="${f.name}">${f.options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.name}" rows="3">${esc(f.value || '')}</textarea>`;
  } else if (f.type === 'checkbox') {
    return `<label class="check-line"><input type="checkbox" name="${f.name}"${f.value ? ' checked' : ''}> <span>${esc(f.label)}</span></label><small class="err" data-err="${f.name}"></small>`;
  } else if (f.type === 'checks') {
    return `<fieldset class="field"><legend>${esc(f.label)}${req}</legend><div class="checks">${f.options.map(o => `<label class="check-line"><input type="checkbox" name="${f.name}" value="${esc(o.value)}"${(f.value || []).includes(o.value) ? ' checked' : ''}${o.disabled ? ' disabled' : ''}> <span>${esc(o.label)}</span></label>`).join('')}</div>${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}<small class="err" data-err="${f.name}"></small></fieldset>`;
  } else {
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"${f.min != null ? ` min="${f.min}"` : ''}>`;
  }
  return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label>${input}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}<small class="err" data-err="${f.name}"></small></div>`;
}
function openForm(cfg) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form class="dlg-form" novalidate>
    <h2>${esc(cfg.title)}</h2>
    ${cfg.text ? `<p class="dlg-text">${esc(cfg.text)}</p>` : ''}
    ${(cfg.fields || []).map(fieldHtml).join('')}
    <div class="dlg-actions">
      <button type="button" class="btn ghost" data-close>Отмена</button>
      <button type="submit" class="btn ${cfg.danger ? 'danger' : 'primary'}">${esc(cfg.submit || 'Сохранить')}</button>
    </div></form>`;
  const form = dlg.querySelector('form');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  form.onsubmit = e => {
    e.preventDefault();
    const vals = {};
    (cfg.fields || []).forEach(f => {
      if (f.type === 'checks') vals[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map(i => i.value);
      else if (f.type === 'checkbox') vals[f.name] = form.querySelector(`input[name="${f.name}"]`).checked;
      else vals[f.name] = form.elements[f.name].value.trim();
    });
    form.querySelectorAll('.err').forEach(el => { el.textContent = ''; });
    let ok = true;
    (cfg.fields || []).forEach(f => {
      const v = vals[f.name];
      if (f.required && (v === '' || v === false || (Array.isArray(v) && !v.length))) {
        form.querySelector(`[data-err="${f.name}"]`).textContent = f.requiredText || 'Заполните это поле.';
        ok = false;
      }
    });
    if (ok && cfg.validate) {
      const errs = cfg.validate(vals) || {};
      Object.keys(errs).forEach(k => { const el = form.querySelector(`[data-err="${k}"]`); if (el) el.textContent = errs[k]; ok = false; });
    }
    if (!ok) { const first = form.querySelector('.err:not(:empty)'); if (first) first.scrollIntoView({ block: 'nearest' }); return; }
    dlg.close();
    cfg.onSubmit(vals);
  };
  dlg.showModal();
  const first = form.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
  if (first) first.focus();
}
const confirmBox = (title, text, submit, onSubmit) => openForm({ title, text, submit, danger: true, onSubmit });

// ===== Общие кусочки разметки =====
const pill = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;
const blockPill = b => pill({ work: 'neutral', sent: 'wait', accepted: 'ok', auto: 'ok', returned: 'no' }[b.status], BLOCK_STATUS[b.status]);
const docPill = d => pill({ draft: 'neutral', sent: 'wait', accepted: 'ok', rejected: 'no', signed: 'ok strong' }[d.status], DOC_STATUS[d.status]);
const empty = (text, action) => `<div class="empty"><p>${esc(text)}</p>${action || ''}</div>`;
// Полоса этапа, как в карточке сделки: закрашено до текущего этапа его цветом
function stageBar(p) {
  const st = stageOf(p);
  const b = curBlock(p);
  const note = b && b.status === 'sent' ? '<span class="sb-note wait">ждём ответа клиента</span>'
    : b && b.status === 'returned' ? '<span class="sb-note no">возврат «не ок»</span>' : '';
  return `<div class="stagebar" style="--stage:${STAGES[st - 1].color}" aria-label="Этап ${st} из 5: ${esc(STAGES[st - 1].title)}">
    <div class="sb-segs">${STAGES.map(s => `<span class="sb-seg${s.n <= st ? ' on' : ''}" title="${esc(s.title)}"></span>`).join('')}</div>
    <div class="sb-label"><b>${esc(STAGES[st - 1].title)}</b><span>этап ${st} из 5</span>${note}</div>
  </div>`;
}
const turnText = t => (t ? (t.role === 'client' ? 'Ход клиента' : `${ROLES[t.role]}: ${userName(t.userId)}`) : 'Все шаги пройдены');

// ===== Экраны =====
function viewWelcome() {
  return `<section class="welcome">
    <div class="welcome-route" aria-hidden="true">${STAGES.map(s => `<span class="w-st"><span class="dot"></span><span>${esc(s.title)}</span></span>`).join('')}</div>
    <h1>Путь каждого клиента — от оплаты до продления</h1>
    <p class="lead">Здесь команда видит, на каком этапе клиент и чей сейчас ход, а клиент принимает работу блоками. Это прототип: данных пока нет, и все клиенты в нём будут выдуманные.</p>
    <div class="welcome-actions">
      <button class="btn primary big" data-act="loadDemo">Загрузить демо-клиентов</button>
      <button class="btn ghost big" data-act="startEmpty">Начать с пустой системы</button>
      <button class="btn ghost big" data-act="pickFile">Загрузить копию данных</button>
    </div>
    <ol class="welcome-steps">
      <li><b>Демо-клиенты</b> — 6 выдуманных проектов на разных этапах. Удобно, чтобы сразу всё посмотреть.</li>
      <li><b>Пустая система</b> — вы главный админ. Добавьте сотрудников в «Админке», затем проект кнопкой «Сделка оплачена».</li>
      <li><b>Копия данных</b> — файл, который вы раньше скачали в разделе «Данные».</li>
    </ol>
    <p class="muted"><a href="#/client">Посмотреть страницу для клиентов «Как мы работаем»</a></p>
  </section>`;
}

function viewDay() {
  const u = me();
  const mine = visibleProjects();
  const tasks = mine.map(p => ({ p, t: turn(p) })).filter(x => x.t && x.t.userId === u.id);
  const tom = addDays(today(), 1);
  const prom = S.promises.filter(x => x.status === 'open' && x.ownerId === u.id && x.due <= tom).sort((a, b) => a.due.localeCompare(b.due));
  const wk = weekKey(today());
  const needHours = has('analyst') ? S.projects.filter(p => p.team.analyst === u.id && p.started && !S.hours.some(h => h.projectId === p.id && h.userId === u.id && h.week === wk)) : [];
  const waiting = mine.map(p => ({ p, t: turn(p) })).filter(x => x.t && x.t.role === 'client');
  return `<section class="page-head"><h1>Мой день</h1><p class="lead">${esc(u.name)} — ${esc(rolesText(u))}. Здесь только то, что ждёт именно вас.</p></section>
  <div class="grid-2">
    <section class="panel"><h2>Ваш ход в проектах <span class="count">${tasks.length}</span></h2>
      ${tasks.length ? `<ul class="list">${tasks.map(({ p, t }) => `<li><a class="row-link" href="#/project/${p.id}"><b>${esc(p.client)}</b><span>${esc(t.text)}</span></a></li>`).join('')}</ul>`
        : empty(mine.length ? 'Сейчас ход не за вами. Когда клиент ответит или подойдёт срок, задача появится здесь.' : 'У вас пока нет проектов. Их назначает руководитель или админ.')}
    </section>
    <section class="panel"><h2>Обещания на сегодня и завтра <span class="count">${prom.length}</span></h2>
      ${prom.length ? `<ul class="list">${prom.map(x => promiseRow(x, true)).join('')}</ul>` : empty('Срочных обещаний нет.', '<a class="btn ghost" href="#/promises">Все обещания</a>')}
    </section>
  </div>
  ${needHours.length ? `<section class="panel notice"><h2>Внесите часы за эту неделю</h2><p>Не внесено по ${needHours.length} ${plural(needHours.length, 'проекту', 'проектам', 'проектам')}: ${needHours.map(p => esc(p.client)).join(', ')}.</p><a class="btn primary" href="#/hours">Внести часы</a></section>` : ''}
  ${waiting.length ? `<section class="panel"><h2>Ждём клиента <span class="count">${waiting.length}</span></h2><ul class="list">${waiting.map(({ p, t }) => `<li><a class="row-link" href="#/project/${p.id}"><b>${esc(p.client)}</b><span>${esc(t.text)}</span></a></li>`).join('')}</ul></section>` : ''}`;
}

function viewProjects() {
  let list = visibleProjects();
  if (ui.onlyMine) list = list.filter(p => Object.values(p.team).includes(me().id));
  if (ui.onlyProblems) list = list.filter(hasProblem);
  const canCreate = isAdmin() || has('lead') || has('sales');
  const showMoney = canMoney();
  const total = list.reduce((a, p) => a + pkgOf(p).price, 0);
  const toolbar = `<div class="toolbar">
      <div class="toolbar-info"><b>${list.length} ${plural(list.length, 'проект', 'проекта', 'проектов')}</b>${showMoney && list.length ? `<span>на ${money(total)}</span>` : ''}</div>
      <div class="toggles">
        <label class="check-line"><input type="checkbox" data-change="onlyMine"${ui.onlyMine ? ' checked' : ''}> <span>Только мои</span></label>
        <label class="check-line"><input type="checkbox" data-change="onlyProblems"${ui.onlyProblems ? ' checked' : ''}> <span>Только с проблемами</span></label>
      </div>
      ${canCreate ? '<button class="btn primary" data-act="newProject">+ Сделка оплачена</button>' : ''}
    </div>`;
  if (!S.projects.length) {
    return toolbar + empty('Проектов пока нет. В настоящей системе проект появится сам, когда сделка в amoCRM перейдёт в «Оплачено». В прототипе нажмите «Сделка оплачена».',
      canCreate ? '<button class="btn primary" data-act="newProject">+ Сделка оплачена</button>' : '');
  }
  return `${toolbar}
    <div class="pipeline">${STAGES.map(s => {
      const items = list.filter(p => stageOf(p) === s.n);
      const sum = items.reduce((a, p) => a + pkgOf(p).price, 0);
      return `<section class="col" style="--stage:${s.color}" aria-label="${esc(s.title)}">
        <header class="col-head"><b>${esc(s.title)}</b><span>${items.length} ${plural(items.length, 'проект', 'проекта', 'проектов')}${showMoney && items.length ? ': ' + money(sum) : ''}</span></header>
        <div class="col-body">${items.length ? items.map(projectCard).join('') : '<p class="col-empty">Здесь пока никого</p>'}</div>
      </section>`;
    }).join('')}</div>
    ${!list.length ? '<p class="muted">По этим фильтрам проектов нет. Снимите галочки, чтобы увидеть остальные.</p>' : ''}`;
}
function projectCard(p) {
  const t = turn(p);
  const overdue = S.promises.filter(x => x.projectId === p.id && isOverdue(x)).length;
  const b = curBlock(p);
  const flags = [];
  if (overdue) flags.push(pill('no', `Просрочено обещаний: ${overdue}`));
  if (b && b.status === 'returned') flags.push(pill('no', `Блок ${b.n}: «не ок»`));
  if (canMoney() && isOverrun(p)) flags.push(pill('ask', `Перерасход часов +${Math.round(overrunPct(p))}%`));
  if (!p.tgLinked) flags.push(pill('neutral', 'Группа не привязана'));
  const who = !t ? 'done' : t.role === 'client' ? 'client' : 'team';
  return `<a class="kcard prow" href="#/project/${p.id}">
    <div class="k-row"><b class="k-name">${esc(p.client)}</b><span class="k-date">${fmt(p.createdAt).slice(0, 5)}</span></div>
    <div class="k-sub">${esc(p.industry || 'Отрасль не указана')}</div>
    <div class="k-sub">${esc(pkgOf(p).name)}${canMoney() ? `, <b>${money(pkgOf(p).price)}</b>` : ''}</div>
    <div class="k-turn ${who}"><span class="k-dot" aria-hidden="true"></span><span><b>${esc(turnText(t))}</b>${esc(t ? t.text : 'Проект завершён')}</span></div>
    ${flags.length ? `<div class="k-flags">${flags.join('')}</div>` : ''}
  </a>`;
}

function viewProject(id) {
  const p = proj(id);
  if (!p) return `<section class="page-head"><h1>Проект не найден</h1><p class="lead">Возможно, его удалили.</p><a class="btn ghost" href="#/projects">К списку проектов</a></section>`;
  if (!canSee(p)) return `<section class="page-head"><h1>Нет доступа к этому проекту</h1><p class="lead">Вы не входите в команду проекта «${esc(p.client)}». Доступ дают руководитель или админ.</p><a class="btn ghost" href="#/projects">К своим проектам</a></section>`;
  const tabs = [['blocks', 'Блоки'], ['bot', 'Telegram-группа'], ['promises', 'Обещания'], ['docs', 'Документы'], ['meetings', 'Встречи'], ['after', 'После акта']];
  if (canMoney() || has('analyst')) tabs.push(['hours', 'Часы']);
  tabs.push(['journal', 'Журнал']);
  const tab = tabs.some(x => x[0] === ui.tab[p.id]) ? ui.tab[p.id] : 'blocks';
  const t = turn(p);
  const pk = pkgOf(p);
  const unanswered = S.bot.filter(m => m.projectId === p.id && m.buttons.length && !m.answer).length;
  return `<div class="deal">
    <aside class="deal-side">
      <a class="back" href="#/projects">Все проекты</a>
      <h1>${esc(p.client)}</h1>
      <p class="deal-id">Сделка в amoCRM № ${esc(p.deal || '—')}</p>
      ${stageBar(p)}
      <div class="now ${t && t.role === 'client' ? 'client' : ''}"><span>Сейчас</span><b>${esc(turnText(t))}</b>${esc(t ? t.text : 'Все шаги пройдены')}</div>
      <dl class="fields">
        <div><dt>Пакет</dt><dd>${esc(pk.name)}</dd></div>
        ${canMoney() ? `<div><dt>Бюджет</dt><dd>${money(pk.price)}</dd></div>` : ''}
        <div><dt>Отрасль</dt><dd>${esc(p.industry || '—')}</dd></div>
        <div><dt>Продажи</dt><dd>${esc(userName(p.team.sales))}</dd></div>
        <div><dt>Аккаунт-менеджер</dt><dd>${esc(userName(p.team.am))}</dd></div>
        <div><dt>Аналитик</dt><dd>${esc(userName(p.team.analyst))}</dd></div>
        <div><dt>Telegram-группа</dt><dd>${p.tgLinked ? 'привязана' : 'не привязана'}</dd></div>
        <div><dt>Создан</dt><dd>${fmt(p.createdAt)}</dd></div>
      </dl>
      <div class="head-actions">
        ${actsAs(p, 'am') && !p.started ? `<button class="btn primary" data-act="startProject" data-id="${p.id}">Клиента поприветствовали, даты согласованы</button>` : ''}
        <button class="btn ghost" data-act="editProject" data-id="${p.id}">Изменить</button>
        ${isAdmin() ? `<button class="btn ghost danger-text" data-act="deleteProject" data-id="${p.id}">Удалить</button>` : ''}
      </div>
    </aside>
    <section class="deal-main">
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="tab${k === tab ? ' on' : ''}" data-act="tab" data-id="${p.id}" data-tab="${k}">${l}${k === 'bot' && unanswered ? ` <b class="badge">${unanswered}</b>` : ''}</button>`).join('')}</div>
      <div class="tab-body">${({ blocks: tabBlocks, bot: tabBot, promises: tabPromises, docs: tabDocs, meetings: tabMeetings, after: tabAfter, hours: tabHours, journal: tabJournal })[tab](p)}</div>
    </section>
  </div>`;
}

function tabBlocks(p) {
  if (!p.started) {
    return empty('Проект только что создан из оплаченной сделки. Аккаунт-менеджер приветствует клиента, согласует даты и привязывает Telegram-группу — после этого откроется блок 1.',
      actsAs(p, 'am') ? `<button class="btn primary" data-act="startProject" data-id="${p.id}">Клиента поприветствовали, даты согласованы</button>` : '');
  }
  const cur = curBlock(p);
  return `<ol class="blocks">${p.blocks.map(b => {
    const t = tplOf(b);
    const isCur = cur && cur.n === b.n;
    const locked = cur && b.n > cur.n;
    let body = '';
    if (isCur) body = blockBody(p, b);
    else if (isAccepted(b)) body = `<p class="muted block-note">${b.status === 'auto' ? 'Принят автоматически' : 'Принят клиентом'} ${fmt(b.acceptedAt)}.</p>`;
    else if (locked) body = '<p class="muted block-note">Откроется после приёмки предыдущего блока.</p>';
    return `<li class="block${isCur ? ' current' : ''}${locked ? ' locked' : ''}">
      <div class="block-head"><span class="block-n">${b.n}</span><h3>${esc(t.title)}</h3>${locked ? pill('neutral', 'Ещё не начат') : blockPill(b)}</div>${body}</li>`;
  }).join('')}</ol>`;
}
function blockBody(p, b) {
  const t = tplOf(b);
  const mayWork = actsAs(p, 'analyst');
  const editable = mayWork && (b.status === 'work' || b.status === 'returned');
  let html = '';
  if (b.status === 'returned') html += `<div class="callout no"><b>Клиент ответил «не ок».</b> Причина: ${esc(b.reason)}<br>Внесите правки, заново пройдите сверку и отправьте блок.</div>`;
  if (b.status === 'sent') {
    const dl = deadlineOf(b);
    html += `<div class="callout wait">Блок у клиента с ${fmt(b.sentAt)}. Напоминание клиенту — ${fmt(prevWorkDay(dl))}. Если ответа не будет, блок примем автоматически ${fmt(dl)} (${S.settings.autoAcceptDays} рабочих дня по производственному календарю).</div>`;
  }
  html += `<h4>Задачи</h4><ul class="tasks">${b.tasks.map(x => `<li><label class="check-line big"><input type="checkbox" data-change="task" data-id="${p.id}" data-n="${b.n}" data-task="${x.id}"${x.done ? ' checked' : ''}${editable ? '' : ' disabled'}> <span>${esc(x.text)}</span></label></li>`).join('')}</ul>`;
  if (t.checks.length) {
    html += `<h4>Сверка аккаунта с пакетом «${esc(pkgOf(p).name)}»</h4>
      <p class="muted small">Система читает настройки amoCRM клиента и сравнивает с пакетом. Сделано столько же или больше — «ок». Меньше — решает аналитик.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Что</th><th class="numc">По пакету</th><th class="numc">В amoCRM клиента<span class="th-note">имитация, можно менять</span></th><th>Итог</th></tr></thead><tbody>
      ${t.checks.map(k => {
        const it = b.check.ran ? b.check.items[k] : null;
        const state = it ? it.state : '';
        const res = !it ? '<span class="muted">не проверено</span>'
          : state === 'ok' ? pill('ok', 'ок') : state === 'confirmed' ? pill('ok', 'ок по решению аналитика') + `<small class="muted block">${esc(it.comment)}</small>`
          : pill('no', `не хватает ${it.need - it.have}`) + (editable ? `<div class="mini-actions"><button class="btn tiny" data-act="confirmCheck" data-id="${p.id}" data-n="${b.n}" data-k="${k}">Подтверждаю, это ок</button><button class="btn tiny ghost" data-act="recheck" data-id="${p.id}" data-n="${b.n}" data-k="${k}">Сделал, перепроверь</button></div>` : '');
        return `<tr><td>${CHECK_LABELS[k]}</td><td class="numc">${pkgOf(p).items[k]}</td><td class="numc"><input class="num-in" type="number" min="0" value="${p.account[k]}" data-change="account" data-id="${p.id}" data-k="${k}" aria-label="${CHECK_LABELS[k]} в amoCRM клиента"${editable ? '' : ' disabled'}></td><td>${res}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${editable ? `<button class="btn ghost" data-act="runCheck" data-id="${p.id}" data-n="${b.n}">Запустить сверку</button>` : ''}`;
  } else {
    html += '<p class="muted small">Для этого блока сверка аккаунта не нужна.</p>';
  }
  if (b.status === 'work' || b.status === 'returned') {
    const left = tasksLeft(b);
    const why = [];
    if (left) why.push(`отметьте задачи (осталось ${left})`);
    if (!checkPassed(b)) why.push('пройдите сверку');
    html += `<div class="send-row"><button class="btn primary" data-act="sendBlock" data-id="${p.id}" data-n="${b.n}"${canSend(b) && mayWork ? '' : ' disabled'}>Отправить блок клиенту целиком</button>
      <span class="muted small">${!mayWork ? 'Отправляет аналитик проекта.' : why.length ? 'Чтобы отправить: ' + why.join(' и ') + '.' : 'Всё готово: клиент получит блок в Telegram-группе с кнопками ответа.'}</span></div>`;
  }
  return html;
}

const ANSWERS = { ok: 'Ок', ask: 'Ок, но есть вопрос', no: 'Не ок', accept: 'Принимаю', reject: 'Не принимаю', confirm: 'Подтверждаю' };
function tabBot(p) {
  const msgs = S.bot.filter(m => m.projectId === p.id);
  return `<div class="tg">
    <div class="tg-head"><b>Группа «${esc(p.client)} и SolutionCRM»</b><span>${p.tgLinked ? 'Привязана к проекту' : 'Не привязана'}</span></div>
    ${!p.tgLinked ? `<div class="tg-link"><p>Создайте группу в Telegram: клиент, команда и бот. Затем отправьте в группу код — бот привяжет её к проекту.</p><p class="code">${esc(p.tgCode)}</p>${actsAs(p, 'am') ? `<button class="btn ghost" data-act="linkTg" data-id="${p.id}">Бот получил код (имитация)</button>` : ''}</div>` : ''}
    <ol class="tg-feed">${msgs.length ? msgs.map(m => tgMsg(p, m)).join('') : '<li class="tg-empty">Сообщений бота пока нет. Они появятся, когда аналитик отправит блок или документ.</li>'}</ol>
    <p class="muted small">Имитация: так сообщения бота выглядят для клиента. Кнопки нажимает клиент. Обычную переписку в группе бот не читает и не хранит.</p>
  </div>`;
}
function tgMsg(p, m) {
  let foot = '';
  if (m.answer) {
    const a = m.answer;
    foot = a.value === 'auto' ? '<div class="tg-answer">Без ответа — принято автоматически</div>'
      : `<div class="tg-answer">Клиент: ${esc(ANSWERS[a.value])}${a.reason ? `. Причина: ${esc(a.reason)}` : ''}</div>`;
  } else if (m.buttons.length) {
    if (ui.reasonFor === m.id) {
      foot = `<div class="tg-reason"><label for="reason_${m.id}">Причина (обязательно)</label><textarea id="reason_${m.id}" rows="2"></textarea><small class="err" id="reasonErr_${m.id}"></small>
        <div class="mini-actions"><button class="btn tiny" data-act="sendReason" data-msg="${m.id}">Отправить ответ</button><button class="btn tiny ghost" data-act="cancelReason">Отмена</button></div></div>`;
    } else {
      foot = `<div class="tg-buttons">${m.buttons.map(bt => `<button class="tg-btn${bt === 'no' || bt === 'reject' ? ' neg' : ''}" data-act="answer" data-msg="${m.id}" data-v="${bt}">${ANSWERS[bt]}</button>`).join('')}</div>`;
    }
  }
  return `<li class="tg-msg"><div class="tg-bubble"><span class="tg-from">Бот SolutionCRM</span><p>${esc(m.text)}</p><span class="tg-time">${fmt(m.date)}, ${esc(m.time)}</span></div>${foot}</li>`;
}

function promiseRow(x, compact) {
  const p = proj(x.projectId);
  const tom = addDays(today(), 1);
  const cls = x.status === 'done' ? 'ok' : x.due <= today() ? 'no' : x.due === tom ? 'ask' : 'neutral';
  const label = x.status === 'done' ? (x.doneAt <= x.due ? 'Выполнено в срок' : 'Выполнено с опозданием')
    : isOverdue(x) ? 'Просрочено' : x.due === today() ? 'Срок сегодня' : x.due === tom ? 'Срок завтра' : 'В работе';
  const actions = x.status === 'open'
    ? `<button class="btn tiny" data-act="promiseDone" data-id="${x.id}">Выполнено</button>
       <button class="btn tiny ghost" data-act="promiseMove" data-id="${x.id}">Перенести срок</button>
       ${!x.informed ? `<button class="btn tiny ghost" data-act="promiseTell" data-id="${x.id}">Сообщить клиенту</button>` : ''}`
    : '';
  return `<li class="promise ${cls}">
    <div class="promise-main"><b>${esc(x.text)}</b>
      <span class="muted small">${compact ? '' : esc(p ? p.client : 'проект удалён') + '. '}Обещал: ${esc(userName(x.ownerId))}. Срок ${fmt(x.due)}${x.moves.length ? ` (перенесён ${x.moves.length} ${plural(x.moves.length, 'раз', 'раза', 'раз')}, был ${fmt(x.moves[0].from)})` : ''}${x.status === 'done' ? `, выполнено ${fmt(x.doneAt)}` : ''}${x.confirmed ? ', клиент подтвердил' : ''}</span></div>
    <div class="promise-side">${pill(cls, label)}${compact ? '' : `<div class="mini-actions">${actions}<button class="btn tiny ghost" data-act="promiseEdit" data-id="${x.id}">Изменить</button><button class="btn tiny ghost danger-text" data-act="promiseDelete" data-id="${x.id}">Удалить</button></div>`}</div>
  </li>`;
}
function tabPromises(p) {
  const list = S.promises.filter(x => x.projectId === p.id).sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === 'open' ? -1 : 1));
  return `<div class="row-between"><p class="muted">Всё, что команда пообещала клиенту с датой.</p><button class="btn primary" data-act="promiseNew" data-project="${p.id}">Новое обещание</button></div>
    ${list.length ? `<ul class="promises">${list.map(x => promiseRow(x, false)).join('')}</ul>` : empty('Обещаний по проекту пока нет. Пообещали клиенту что-то со сроком — запишите сюда, чтобы не потерялось.')}`;
}
function viewPromises() {
  const vis = visibleProjects().map(p => p.id);
  let list = S.promises.filter(x => vis.includes(x.projectId));
  const m = promiseMetric(list);
  if (ui.owner) list = list.filter(x => x.ownerId === ui.owner);
  list.sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === 'open' ? -1 : 1));
  const target = S.settings.promiseTarget;
  const owners = [...new Set(S.promises.filter(x => vis.includes(x.projectId)).map(x => x.ownerId))];
  return `<section class="page-head row-between">
      <div><h1>Реестр обещаний</h1><p class="lead">Любое обещание клиенту со сроком. Срок завтра — жёлтым, сегодня или прошёл — красным.</p></div>
      <button class="btn primary" data-act="promiseNew">Новое обещание</button>
    </section>
    <section class="metric ${m.pct == null ? '' : m.pct >= target ? 'good' : 'bad'}">
      <div class="metric-num">${m.pct == null ? '—' : m.pct + '%'}</div>
      <div><b>Выполнено в срок</b><span>${m.inTime} из ${m.counted} (выполненные и просроченные). Цель — ${target}%.</span></div>
      <div class="metric-bar" aria-hidden="true"><span style="width:${m.pct || 0}%"></span><i style="left:${target}%"></i></div>
    </section>
    <div class="toggles"><label class="inline-field">Кто обещал <select data-change="owner"><option value="">Все</option>${owners.map(o => `<option value="${o}"${ui.owner === o ? ' selected' : ''}>${esc(userName(o))}</option>`).join('')}</select></label></div>
    ${list.length ? `<ul class="promises">${list.map(x => promiseRow(x, false)).join('')}</ul>` : empty('Обещаний пока нет. Нажмите «Новое обещание», когда пообещаете клиенту что-то со сроком.')}`;
}

function docRow(d) {
  const p = proj(d.projectId);
  let actions = '';
  if (p && actsAs(p, d.type === 'act' ? 'analyst' : 'am')) {
    if (d.status === 'draft' || d.status === 'rejected') actions += `<button class="btn tiny" data-act="docSend" data-id="${d.id}">${d.status === 'rejected' ? 'Направить снова' : 'Направить клиенту'}</button>`;
  }
  if (p && d.status === 'accepted' && actsAs(p, 'analyst')) actions += `<button class="btn tiny" data-act="docSign" data-id="${d.id}">Подписано юридически</button>`;
  return `<li class="doc"><div><b>${DOC_TYPES[d.type]} № ${esc(d.num)}</b><span class="muted small">${esc(p ? p.client : 'проект удалён')}. Создан ${fmt(d.createdAt)}${d.reason ? `. Причина отказа: ${esc(d.reason)}` : ''}</span></div>
    <div class="promise-side">${docPill(d)}${actions ? `<div class="mini-actions">${actions}</div>` : ''}</div></li>`;
}
function tabDocs(p) {
  const docs = S.documents.filter(d => d.projectId === p.id);
  const allAccepted = p.blocks.every(isAccepted);
  const act = actOf(p);
  const hasInvoice = docs.some(d => d.type === 'invoice');
  let top = '';
  if (!act && allAccepted && actsAs(p, 'analyst')) top = `<button class="btn primary" data-act="makeAct" data-id="${p.id}">Сформировать акт из принятых блоков</button>`;
  if (act && act.status === 'signed' && !hasInvoice && actsAs(p, 'am')) top = `<button class="btn primary" data-act="makeInvoice" data-id="${p.id}">Выставить счёт на поддержку</button>`;
  return `<div class="row-between"><p class="muted">Акт собирается из принятых блоков. «Подписано юридически» аналитик ставит вручную после подписания.</p>${top}</div>
    ${docs.length ? `<ul class="docs">${docs.map(docRow).join('')}</ul>` : empty(allAccepted ? 'Все блоки приняты — можно формировать акт.' : `Акт можно сформировать, когда клиент примет все 5 блоков. Сейчас принято: ${p.blocks.filter(isAccepted).length} из 5.`)}`;
}
function viewDocs() {
  const vis = visibleProjects().map(p => p.id);
  const docs = S.documents.filter(d => vis.includes(d.projectId));
  return `<section class="page-head"><h1>Документы</h1><p class="lead">Акты и счета по всем вашим проектам. Статусы: не направлено, направлено, принято или не принято клиентом, подписано юридически.</p></section>
    ${docs.length ? `<ul class="docs">${docs.map(docRow).join('')}</ul>` : empty('Документов пока нет. Акт появляется в карточке проекта, когда клиент примет все 5 блоков.')}`;
}

function tabMeetings(p) {
  const list = S.meetings.filter(m => m.projectId === p.id);
  const model = MODELS.find(x => x.id === S.settings.llm.protocol);
  return `<div class="row-between"><p class="muted">Запись встречи из Zoom распознаётся, модель делает черновик протокола и ТЗ, аналитик проверяет. Сейчас модель для протоколов: ${esc(model.name)}.</p>
      ${actsAs(p, 'analyst') ? `<button class="btn primary" data-act="addMeeting" data-id="${p.id}">Получить транскрипт (имитация)</button>` : ''}</div>
    ${list.length ? `<ul class="docs">${list.map(m => `<li class="doc"><div><b>${esc(m.title)}, ${fmt(m.date)}</b><span class="muted small">${esc(m.summary)}</span></div><div class="promise-side">${pill('neutral', 'Черновик: ' + (MODELS.find(x => x.id === m.model) || { name: m.model }).name)}</div></li>`).join('')}</ul>`
      : empty('Встреч пока нет. После встречи в Zoom транскрипт и резюме придут сюда и аналитику в личку.')}`;
}

function tabAfter(p) {
  if (!p.actDate) return empty('Касания начнутся после того, как акт будет подписан юридически. Тогда здесь появятся даты 7-го, 30-го, 45–60-го и 90-го дня.');
  return `<p class="muted">Акт подписан ${fmt(p.actDate)}. Даты считаются от него.</p>
    <ol class="touches">${TOUCHES.map(t => {
      const d = touchDate(p, t.day);
      const done = p.touchesDone[t.day];
      const state = done ? pill('ok', 'Сделано') : d < today() ? pill('no', 'Пропущено') : d === today() ? pill('ask', 'Сегодня') : pill('neutral', 'Впереди');
      return `<li class="touch${done ? ' done' : ''}"><span class="touch-day">День ${t.day}</span><div><b>${esc(t.title)}</b><span class="muted small">${fmt(d)}. ${ROLES[t.role]}: ${esc(userName(p.team[t.role]))}</span></div>
        <div class="promise-side">${state}${!done && actsAs(p, t.role) ? `<button class="btn tiny" data-act="touchDone" data-id="${p.id}" data-day="${t.day}">Отметить сделанным</button>` : ''}</div></li>`;
    }).join('')}</ol>`;
}

function tabHours(p) {
  const plan = pkgOf(p).planHours;
  const fact = factHours(p);
  const rows = S.hours.filter(h => h.projectId === p.id).sort((a, b) => b.week.localeCompare(a.week));
  return `${canMoney() ? `<div class="kpis"><div><span>План</span><b>${plan} ч</b></div><div><span>Факт</span><b>${numRu(fact)} ч</b></div><div class="${isOverrun(p) ? 'bad' : ''}"><span>Отклонение</span><b>${fact >= plan ? '+' : ''}${Math.round(overrunPct(p))}%</b></div></div>
    ${isOverrun(p) ? `<div class="callout no">Перерасход больше ${S.settings.overrunPct}% — «холостая работа». Стоит разобраться, что съедает часы.</div>` : ''}` : ''}
    ${rows.length ? `<ul class="docs">${rows.map(h => `<li class="doc"><div><b>Неделя ${esc(h.week.split('-W')[1])}, ${h.week.slice(0, 4)}</b><span class="muted small">${esc(userName(h.userId))}</span></div><div class="promise-side">${pill('neutral', RANGES.find(r => r.v === h.range).label)}</div></li>`).join('')}</ul>`
      : empty('Часов пока нет. Аналитик вносит их раз в неделю в разделе «Часы».')}`;
}

function tabJournal(p) {
  const list = S.journal.filter(j => j.projectId === p.id).slice().reverse();
  return `<p class="muted">Кто, когда и что отправил, какой ответ дал клиент. Записи нельзя изменить или удалить — это доказательство приёмки.</p>
    ${list.length ? `<ol class="journal">${list.map(j => `<li><time>${esc(fmt(j.at.slice(0, 10)) + j.at.slice(10))}</time><span><b>${esc(j.who)}</b> ${esc(j.text)}</span></li>`).join('')}</ol>` : empty('Записей пока нет. Они появятся при первой отправке блока или документа.')}`;
}

function viewHours() {
  const u = me();
  const base = addDays(today(), ui.weekShift * 7);
  const wk = weekKey(base);
  const mon = mondayOf(base);
  const mine = S.projects.filter(p => p.team.analyst === u.id && p.started);
  const ctrl = canMoney() ? visibleProjects() : [];
  return `<section class="page-head"><h1>Часы</h1><p class="lead">Раз в неделю аналитик отмечает по каждому клиенту, сколько примерно ушло времени. Точность до минут не нужна.</p></section>
    ${has('analyst') ? `<section class="panel">
      <div class="row-between wrap"><h2>Неделя ${fmt(mon)} — ${fmt(addDays(mon, 6))}</h2>
        <div class="mini-actions"><button class="btn tiny ghost" data-act="week" data-d="-1">Прошлая неделя</button><button class="btn tiny ghost" data-act="week" data-d="1"${ui.weekShift >= 0 ? ' disabled' : ''}>Следующая</button></div></div>
      ${mine.length ? `<ul class="hours">${mine.map(p => {
        const h = S.hours.find(x => x.projectId === p.id && x.userId === u.id && x.week === wk);
        return `<li><b>${esc(p.client)}</b><div class="seg" role="group" aria-label="Часы по ${esc(p.client)}">${RANGES.map(r => `<button class="seg-btn${h && h.range === r.v ? ' on' : ''}" aria-pressed="${!!(h && h.range === r.v)}" data-act="setHours" data-id="${p.id}" data-week="${wk}" data-v="${r.v}">${r.label}</button>`).join('')}</div></li>`;
      }).join('')}</ul>` : empty('У вас нет проектов в работе.')}
    </section>` : ''}
    ${canMoney() ? `<section class="panel"><h2>Контроль сделок: план против факта</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Проект</th><th>Пакет</th><th class="numc">План, ч</th><th class="numc">Факт, ч</th><th class="numc">Отклонение</th><th></th></tr></thead><tbody>
      ${ctrl.map(p => `<tr class="${isOverrun(p) ? 'row-bad' : ''}"><td><a href="#/project/${p.id}">${esc(p.client)}</a></td><td>${esc(pkgOf(p).name)}</td><td class="numc">${pkgOf(p).planHours}</td><td class="numc">${numRu(factHours(p))}</td><td class="numc">${factHours(p) >= pkgOf(p).planHours ? '+' : ''}${Math.round(overrunPct(p))}%</td><td>${isOverrun(p) ? pill('no', 'Холостая работа') : ''}</td></tr>`).join('')}
      </tbody></table></div><p class="muted small">«Больше 3 ч» считается как ${S.settings.moreHours} ч. Порог перерасхода — ${S.settings.overrunPct}%. Меняется в «Админке».</p></section>` : ''}
    ${!has('analyst') && !canMoney() ? empty('Этот раздел для аналитиков и руководителя.') : ''}`;
}

function health(p) {
  const m = promiseMetric(S.promises.filter(x => x.projectId === p.id));
  const returns = S.journal.filter(j => j.projectId === p.id && j.text.includes('«не ок»')).length;
  const sig = [
    { name: 'Обещания в срок', v: m.pct == null ? 'g' : m.pct < 60 ? 'r' : m.pct < 80 ? 'y' : 'g', note: m.pct == null ? 'нет данных' : m.pct + '%' },
    { name: 'Возвраты блоков', v: returns >= 2 ? 'r' : returns === 1 ? 'y' : 'g', note: String(returns) },
    { name: 'Часы', v: isOverrun(p) ? 'r' : overrunPct(p) > 0 ? 'y' : 'g', note: (overrunPct(p) > 0 ? '+' : '') + Math.round(overrunPct(p)) + '%' },
    { name: 'Параллельный подрядчик', v: p.contractor ? 'r' : 'g', note: p.contractor ? 'есть' : 'нет' },
  ];
  const worst = sig.some(s => s.v === 'r') ? 'r' : sig.some(s => s.v === 'y') ? 'y' : 'g';
  return { sig, worst };
}
function viewLead() {
  if (!canMoney()) return `<section class="page-head"><h1>Нет доступа</h1><p class="lead">Раздел видят только руководитель и админы.</p></section>`;
  const list = visibleProjects();
  const analysts = S.users.filter(u => u.roles.includes('analyst'));
  const LIGHT = { r: 'Красный', y: 'Жёлтый', g: 'Зелёный' };
  return `<section class="page-head"><h1>Руководителю</h1><p class="lead">Здоровье клиентов, загрузка аналитиков и деньги по сделкам. Этот раздел видят только руководитель и админы.</p></section>
    <section class="panel"><h2>Здоровье клиентов</h2><div class="table-wrap"><table class="table"><thead><tr><th>Клиент</th><th>Итог</th><th>Обещания в срок</th><th>Возвраты</th><th>Часы</th><th>Подрядчик</th></tr></thead><tbody>
    ${list.map(p => { const h = health(p); return `<tr><td><a href="#/project/${p.id}">${esc(p.client)}</a></td><td><span class="light ${h.worst}">${LIGHT[h.worst]}</span></td>${h.sig.map(s => `<td><span class="light ${s.v}">${esc(s.note)}</span></td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div><p class="muted small">Отметку «параллельный подрядчик» ставит менеджер в карточке проекта («Изменить»). Ещё один сигнал из ТЗ — «приходит с развитием или только с проблемами» — появится в настоящей системе.</p></section>
    <section class="panel"><h2>Загрузка аналитиков</h2><div class="table-wrap"><table class="table"><thead><tr><th>Аналитик</th><th class="numc">Проектов в работе</th><th class="numc">Осталось плановых часов</th><th class="numc">Ёмкость в месяц</th><th>Загрузка</th></tr></thead><tbody>
    ${analysts.map(a => {
      const ps = S.projects.filter(p => p.team.analyst === a.id && stageOf(p) < 5);
      const left = ps.reduce((s, p) => s + Math.max(pkgOf(p).planHours - factHours(p), 0), 0);
      const cap = Number(S.settings.capacity);
      const pct = cap ? Math.round((left / cap) * 100) : 0;
      return `<tr><td>${esc(a.name)}</td><td class="numc">${ps.length}</td><td class="numc">${numRu(left)}</td><td class="numc">${cap} ч</td><td><div class="load"><span style="width:${Math.min(pct, 100)}%" class="${pct > 100 ? 'over' : ''}"></span></div><small>${pct}%</small></td></tr>`;
    }).join('')}</tbody></table></div><p class="muted small">Ёмкость — около ${S.settings.capacity} продуктивных часов в месяц на аналитика. Меняется в «Админке».</p></section>
    <section class="panel"><h2>Маржа по сделкам</h2><div class="table-wrap"><table class="table"><thead><tr><th>Клиент</th><th class="numc">Цена</th><th class="numc">Маржа по плану</th><th class="numc">Маржа по факту</th></tr></thead><tbody>
    ${list.map(p => { const pk = pkgOf(p); const planM = pk.price - costOf(pk.planHours); const factM = pk.price - costOf(factHours(p)); return `<tr><td>${esc(p.client)}</td><td class="numc">${money(pk.price)}</td><td class="numc">${money(planM)}</td><td class="numc ${factM < planM ? 'neg' : ''}">${money(factM)}</td></tr>`; }).join('')}
    </tbody></table></div><p class="muted small">Себестоимость часа ${money(S.settings.rate)} плюс накладные ${S.settings.overhead}%. Цены пакетов условные.</p></section>`;
}

function viewAdmin() {
  if (!isAdmin()) return `<section class="page-head"><h1>Нет доступа</h1><p class="lead">Админку видят только админы.</p></section>`;
  const tabs = [['users', 'Пользователи'], ['packages', 'Пакеты'], ['params', 'Параметры'], ['bot', 'Тексты бота'], ['llm', 'Модели LLM'], ['calendar', 'Календарь'], ['history', 'История изменений']];
  const t = ui.adminTab;
  const body = { users: adminUsers, packages: adminPackages, params: adminParams, bot: adminBot, llm: adminLlm, calendar: adminCalendar, history: adminHistory }[t]();
  return `<section class="page-head"><h1>Админка</h1><p class="lead">Всё, что часто меняется, правится здесь без программиста. Каждое изменение настроек попадает в историю, и его можно откатить.</p></section>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === t}" class="tab${k === t ? ' on' : ''}" data-act="adminTab" data-tab="${k}">${l}</button>`).join('')}</div>
    <section class="tab-body">${body}</section>`;
}
function adminUsers() {
  const iAmMain = !!me().isMain;
  return `<div class="row-between"><p class="muted">Регистрации нет: сотрудников добавляет админ. Назначать и снимать админов может только главный админ.</p><button class="btn primary" data-act="userNew">Добавить сотрудника</button></div>
    <ul class="docs">${S.users.map(u => {
      const protectedMain = u.isMain;
      const touchAdmin = u.roles.includes('admin') && !iAmMain;
      return `<li class="doc"><div><b>${esc(u.name)}${u.isMain ? ' (главный админ)' : ''}</b><span class="muted small">Логин ${esc(u.login)}. ${esc(u.roles.map(r => ROLES[r]).join(', '))}. Telegram ${u.tg ? 'привязан' : 'не привязан'}</span></div>
        <div class="promise-side">${protectedMain && !iAmMain ? pill('neutral', 'Защищён: удалить или понизить нельзя') : ''}
          <div class="mini-actions">${protectedMain && !iAmMain || touchAdmin ? '' : `<button class="btn tiny ghost" data-act="userEdit" data-id="${u.id}">Изменить</button>`}
          ${protectedMain || touchAdmin || u.id === me().id ? '' : `<button class="btn tiny ghost danger-text" data-act="userDelete" data-id="${u.id}">Удалить</button>`}</div></div></li>`;
    }).join('')}</ul>`;
}
function adminPackages() {
  return `<p class="muted">Состав пакета — основа для сверки аккаунта и для акта. План часов нужен для контроля сделок. Цены условные.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Что</th>${S.packageOrder.map(id => `<th class="numc">${esc(S.packages[id].name)}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Цена, ₽</td>${S.packageOrder.map(id => `<td class="numc"><input class="num-in wide" type="number" min="0" value="${S.packages[id].price}" data-change="pkg" data-id="${id}" data-k="price" aria-label="Цена ${esc(S.packages[id].name)}"></td>`).join('')}</tr>
    <tr><td>План часов</td>${S.packageOrder.map(id => `<td class="numc"><input class="num-in" type="number" min="0" value="${S.packages[id].planHours}" data-change="pkg" data-id="${id}" data-k="planHours" aria-label="План часов ${esc(S.packages[id].name)}"></td>`).join('')}</tr>
    ${Object.keys(CHECK_LABELS).map(k => `<tr><td>${CHECK_LABELS[k]}</td>${S.packageOrder.map(id => `<td class="numc"><input class="num-in" type="number" min="0" value="${S.packages[id].items[k]}" data-change="pkgItem" data-id="${id}" data-k="${k}" aria-label="${CHECK_LABELS[k]} ${esc(S.packages[id].name)}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}
const PARAMS = [
  ['autoAcceptDays', 'Автоприёмка блока без ответа, рабочих дней'],
  ['overrunPct', 'Порог «холостой работы», % перерасхода часов'],
  ['promiseTarget', 'Цель по обещаниям в срок, %'],
  ['rate', 'Себестоимость часа аналитика, ₽'],
  ['overhead', 'Накладные расходы, %'],
  ['capacity', 'Продуктивных часов аналитика в месяц'],
  ['moreHours', 'Сколько часов считать за «больше 3 ч»'],
];
function adminParams() {
  return `<div class="form-grid">${PARAMS.map(([k, l]) => `<div class="field"><label for="par_${k}">${l}</label><input id="par_${k}" type="number" min="0" value="${S.settings[k]}" data-change="param" data-k="${k}"></div>`).join('')}</div>`;
}
const BOT_TEXTS = { blockSent: 'Блок отправлен клиенту', reminder: 'Напоминание о приёмке', promise: 'Подтверждение срока задачи', promiseDone: 'Задача выполнена', docSent: 'Документ направлен' };
function adminBot() {
  return `<p class="muted">Подстановки в фигурных скобках: {n} — номер блока, {title} — название, {date} — дата, {text} — суть задачи, {type} и {num} — документ.</p>
    <div class="form-grid one">${Object.keys(BOT_TEXTS).map(k => `<div class="field"><label for="bt_${k}">${BOT_TEXTS[k]}</label><textarea id="bt_${k}" rows="2" data-change="botText" data-k="${k}">${esc(S.settings.botTexts[k])}</textarea></div>`).join('')}</div>`;
}
function adminLlm() {
  const opts = sel => MODELS.map(m => `<option value="${m.id}"${sel === m.id ? ' selected' : ''}>${m.name}${m.key ? '' : ' — ключ не задан'}</option>`).join('');
  return `<p class="muted">Ключи хранятся только в файле параметров на сервере. Здесь видно лишь, задан ключ или нет. Перед отправкой в модель имена, телефоны и названия компаний заменяются метками.</p>
    <div class="form-grid">${Object.keys(LLM_TASKS).map(k => `<div class="field"><label for="llm_${k}">${LLM_TASKS[k]}</label><select id="llm_${k}" data-change="llm" data-k="${k}">${opts(S.settings.llm[k])}</select></div>`).join('')}
    <div class="field"><label for="llm_fallback">Запасная модель, если основная не ответила</label><select id="llm_fallback" data-change="llm" data-k="fallback">${opts(S.settings.llm.fallback)}</select></div></div>
    <ul class="keys">${MODELS.map(m => `<li>${esc(m.name)} ${m.key ? pill('ok', 'ключ задан') : pill('neutral', 'ключ не задан')}</li>`).join('')}</ul>`;
}
function adminCalendar() {
  return `<p class="muted">Праздничные нерабочие дни. Субботы и воскресенья учитываются сами. 2026 год — по утверждённому календарю, 2027 — предварительно: сверьте с официальным, когда его опубликуют. Одна дата в строке, формат ДД.ММ.ГГГГ.</p>
    <div class="field"><label for="hol">Праздничные дни (${S.settings.holidays.length})</label><textarea id="hol" rows="10" data-change="holidays">${esc(S.settings.holidays.map(fmt).join('\n'))}</textarea><small class="err" id="holErr"></small></div>`;
}
function adminHistory() {
  const list = S.history.slice().reverse();
  return `<p class="muted">Изменения настроек: кто, когда, что было и что стало. «Вернуть» ставит прежнее значение и тоже записывается в историю.</p>
    ${list.length ? `<ul class="docs">${list.map(h => `<li class="doc"><div><b>${esc(h.label)}</b><span class="muted small">${esc(fmt(h.at.slice(0, 10)) + h.at.slice(10))}, ${esc(h.who)}. Было: ${esc(showVal(h.from))}. Стало: ${esc(showVal(h.to))}</span></div><div class="promise-side"><button class="btn tiny ghost" data-act="rollback" data-id="${h.id}">Вернуть «${esc(showVal(h.from))}»</button></div></li>`).join('')}</ul>`
      : empty('Изменений пока не было. Поменяйте любой параметр, текст бота или модель — запись появится здесь.')}`;
}

function viewClient() {
  const days = S ? S.settings.autoAcceptDays : 3;
  const needs = [
    'Ответить на звонок менеджера и выбрать пакет',
    'Заполнить опросник и выдать доступы. Пароли — через менеджер паролей, не в чат',
    'Прийти на установочную встречу и принять ТЗ',
    'Проверять блоки и отвечать кнопкой в Telegram-группе',
    'Пройти обучение, принять последний блок и подписать акт',
  ];
  const what = [
    'Вы оставляете заявку, менеджер подбирает пакет. После оплаты сразу создаётся проект и Telegram-группа с ботом.',
    'Аккаунт-менеджер знакомится и согласует даты. Аналитик проводит встречу и готовит техническое задание — это блок 1.',
    'Настраиваем amoCRM блоками: структура, каналы и интеграции, база и автоматизации. Каждый блок перед отправкой сверяется с вашим пакетом.',
    'Вы получаете курс обучения и блок 5. Акт собирается из принятых блоков.',
    'Мы остаёмся на связи: спрашиваем, что мешает работать, созваниваемся по цифрам и делаем аудит.',
  ];
  return `<section class="client">
    <h1>Как мы работаем</h1>
    <p class="lead">Внедряем amoCRM за 5 этапов. На каждом шаге понятно, что делаем мы и что нужно от вас. Работу сдаём блоками: вы принимаете каждый отдельно.</p>
    <ol class="client-route">${STAGES.map((s, i) => `<li><span class="dot"></span><div><h2>${esc(s.title)}</h2><p>${esc(what[i])}</p><p class="need"><b>От вас:</b> ${esc(needs[i] || 'Ответить на пару вопросов и решить, продлеваем ли поддержку')}</p></div></li>`).join('')}</ol>
    <section class="panel"><h2>Как принять блок</h2>
      <p>Бот присылает блок целиком в вашу Telegram-группу с тремя кнопками:</p>
      <ul class="answers"><li>${pill('ok', 'Ок')} всё устраивает, идём дальше</li><li>${pill('ask', 'Ок, но есть вопрос')} принимаете, а вопрос мы разберём отдельно</li><li>${pill('no', 'Не ок')} обязательно напишите причину, мы исправим и пришлём снова</li></ul>
      <p>Если ответа нет ${days} рабочих дня, блок считается принятым. За день до этого бот напомнит.</p></section>
    <section class="panel"><h2>После подписания акта</h2>
      <ol class="client-days"><li><b>7-й день.</b> Спросим, что мешает работать в CRM.</li><li><b>30-й день.</b> Созвонимся и посмотрим на ваши цифры.</li><li><b>45–60-й день.</b> Сделаем аудит: что работает, где теряются заявки.</li><li><b>За 14 дней до окончания.</b> Напомним о продлении.</li><li><b>90-й день.</b> Продление поддержки.</li></ol></section>
  </section>`;
}

function viewData() {
  const n = S.projects.length;
  return `<section class="page-head"><h1>Данные</h1><p class="lead">Прототип хранит всё только в этом браузере. Если очистить браузер, данные пропадут — поэтому время от времени скачивайте копию.</p></section>
    <div class="grid-2">
      <section class="panel"><h2>Копия данных</h2><p>Сейчас в системе: ${n} ${plural(n, 'проект', 'проекта', 'проектов')}, ${S.promises.length} ${plural(S.promises.length, 'обещание', 'обещания', 'обещаний')}, ${S.users.length} ${plural(S.users.length, 'сотрудник', 'сотрудника', 'сотрудников')}.</p>
        <div class="stack"><button class="btn primary" data-act="download">Скачать копию данных</button><button class="btn ghost" data-act="pickFile">Загрузить копию</button></div></section>
      <section class="panel"><h2>Тестовая дата</h2><p>Чтобы проверить автоприёмку и касания, можно «перемотать» дату. Влияет только на прототип.</p>
        <div class="field"><label for="testDate">Сегодня в прототипе</label><input id="testDate" type="date" value="${today()}" data-change="testDate"></div>
        ${S.testDate ? '<button class="btn ghost" data-act="realDate">Вернуть настоящую дату</button>' : ''}</section>
    </div>
    <section class="panel danger-zone"><h2>Начать заново</h2><p>Обе кнопки заменяют текущие данные. Сначала скачайте копию, если она нужна.</p>
      <div class="stack"><button class="btn ghost" data-act="resetDemo">Заменить демо-данными</button><button class="btn ghost danger-text" data-act="wipe">Удалить все данные</button></div></section>`;
}

// ===== Боковое меню и верхняя панель =====
const ICONS = {
  day: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  projects: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  promises: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.5 1.5L8 4.5M3.5 12l1.5 1.5L8 10.5M3.5 18l1.5 1.5L8 16.5"/>',
  docs: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lead: '<path d="M5 20V11M11 20V5M17 20v-6M2 20h20"/>',
  admin: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5"/>',
  data: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
const NAV = [
  ['day', 'Мой день', () => true],
  ['projects', 'Проекты', () => true],
  ['promises', 'Обещания', () => true],
  ['docs', 'Документы', () => true],
  ['hours', 'Часы', () => has('analyst') || canMoney()],
  ['lead', 'Руководителю', () => canMoney()],
  ['admin', 'Админка', () => isAdmin()],
  ['client', 'Для клиента', () => true],
  ['data', 'Данные', () => true],
];
const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
function renderChrome(route) {
  const nav = $('#nav');
  const meta = $('#topMeta');
  const item = NAV.find(n => n[0] === (route === 'project' ? 'projects' : route));
  $('#topTitle').textContent = !S && route !== 'client' ? 'Путь клиента' : item ? item[1] : 'Мой день';
  if (!S) {
    nav.innerHTML = '';
    meta.innerHTML = route === 'client' ? '<a class="btn tiny ghost" href="#/">На главную</a>' : '';
    return;
  }
  nav.innerHTML = NAV.filter(n => n[2]()).map(([k, l]) => {
    const on = route === k || (route === 'project' && k === 'projects');
    return `<a href="#/${k}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${icon(k)}<span>${l}</span></a>`;
  }).join('');
  meta.innerHTML = `<span class="today${S.testDate ? ' test' : ''}">${S.testDate ? 'Тестовая дата ' : 'Сегодня '}${fmt(today())}</span>
    <label class="who"><span class="sr">Вы вошли как</span><select data-change="user" aria-label="Сменить пользователя (только в прототипе)">${S.users.map(u => `<option value="${u.id}"${u.id === me().id ? ' selected' : ''}>${esc(u.name)} — ${esc(u.roles.map(r => ROLES[r]).join(', '))}</option>`).join('')}</select></label>`;
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return [parts[0] || 'day', parts[1]];
}
function render() {
  const [route, arg] = parseHash();
  if (!S && route !== 'client') { renderChrome('welcome'); $('#main').innerHTML = viewWelcome(); return; }
  if (S && tick()) save();
  renderChrome(route);
  const views = { day: viewDay, projects: viewProjects, project: () => viewProject(arg), promises: viewPromises, docs: viewDocs, hours: viewHours, lead: viewLead, admin: viewAdmin, client: viewClient, data: viewData };
  $('#main').innerHTML = (views[route] || viewDay)();
}
function rerender(keepScroll = true) {
  const y = window.scrollY;
  render();
  if (keepScroll) window.scrollTo(0, y);
}

// ===== Действия =====
const userOptions = role => S.users.filter(u => u.roles.includes(role)).map(u => ({ value: u.id, label: u.name }));
function projectForm(p) {
  const pk = S.packageOrder.map(id => ({ value: id, label: S.packages[id].name }));
  const fields = [
    { name: 'client', label: 'Клиент (выдуманное название)', required: true, value: p ? p.client : '' },
    { name: 'industry', label: 'Отрасль', value: p ? p.industry : '' },
    { name: 'deal', label: 'Номер сделки в amoCRM', value: p ? p.deal : '' },
    { name: 'packageId', label: 'Пакет', type: 'select', options: pk, value: p ? p.packageId : 'base' },
    { name: 'sales', label: 'Менеджер по продажам', type: 'select', options: userOptions('sales').concat([{ value: '', label: 'Не назначен' }]), value: p ? p.team.sales : '' },
    { name: 'am', label: 'Аккаунт-менеджер', type: 'select', options: userOptions('am').concat([{ value: '', label: 'Не назначен' }]), value: p ? p.team.am : '' },
    { name: 'analyst', label: 'Аналитик', type: 'select', options: userOptions('analyst').concat([{ value: '', label: 'Не назначен' }]), value: p ? p.team.analyst : '' },
  ];
  if (p) fields.push({ name: 'contractor', label: 'У клиента есть параллельный подрядчик', type: 'checkbox', value: p.contractor });
  return fields;
}
const findMsg = id => S.bot.find(m => m.id === id);
const findPromise = id => S.promises.find(x => x.id === id);
const findDoc = id => S.documents.find(d => d.id === id);
const blockOf = (p, n) => p.blocks.find(b => b.n === Number(n));

const ACTIONS = {
  loadDemo() { S = demoState(); save(); location.hash = '#/day'; rerender(false); toast('Загружены 6 демо-клиентов. Сверху можно переключить пользователя и посмотреть систему его глазами.'); },
  startEmpty() { S = baseState(); save(); location.hash = '#/admin'; rerender(false); toast('Вы главный админ. Добавьте сотрудников, затем создайте проект.'); },
  pickFile() { $('#fileInput').value = ''; $('#fileInput').click(); },
  stage(d) { ui.stage = Number(d.n); rerender(); },
  tab(d) { ui.tab[d.id] = d.tab; ui.reasonFor = null; rerender(); },
  adminTab(d) { ui.adminTab = d.tab; rerender(); },
  week(d) { ui.weekShift = Math.min(0, ui.weekShift + Number(d.d)); rerender(); },

  newProject() {
    openForm({
      title: 'Сделка оплачена', text: 'В настоящей системе проект создаётся сам, когда сделка в amoCRM переходит в этап «Оплачено». Здесь — имитация.',
      fields: projectForm(null), submit: 'Создать проект',
      onSubmit(v) {
        const pk = S.packages[v.packageId];
        const id = 'p' + uid();
        const p = { id, client: v.client, industry: v.industry, deal: v.deal, packageId: v.packageId, createdAt: today(), started: false, tgLinked: false,
          tgCode: 'SC-' + Math.random().toString(36).slice(2, 7).toUpperCase(), team: { sales: v.sales, am: v.am, analyst: v.analyst },
          account: Object.fromEntries(Object.keys(CHECK_LABELS).map(k => [k, 0])), blocks: [], actDate: '', touchesDone: {}, contractor: false };
        p.blocks = BLOCK_TPL.map(t => ({ n: t.n, status: 'work', tasks: t.tasks.map(x => ({ id: uid(), text: x, done: false })), check: { ran: false, items: {} }, sentAt: '', acceptedAt: '', answer: '', reason: '', reminded: false }));
        S.projects.unshift(p);
        log(p, `Проект создан по оплаченной сделке${v.deal ? ' № ' + v.deal : ''}, пакет «${pk.name}»`, 'Система');
        save(); location.hash = '#/project/' + id; toast(`Проект «${v.client}» создан с 5 блоками по пакету «${pk.name}».`);
      },
    });
  },
  editProject(d) {
    const p = proj(d.id);
    openForm({
      title: 'Изменить проект', fields: projectForm(p), submit: 'Сохранить изменения',
      onSubmit(v) {
        const pkgChanged = v.packageId !== p.packageId;
        Object.assign(p, { client: v.client, industry: v.industry, deal: v.deal, packageId: v.packageId, contractor: v.contractor });
        p.team = { sales: v.sales, am: v.am, analyst: v.analyst };
        if (pkgChanged) log(p, `Пакет изменён на «${S.packages[v.packageId].name}»`);
        save(); rerender(); toast('Изменения сохранены.');
      },
    });
  },
  deleteProject(d) {
    const p = proj(d.id);
    confirmBox('Удалить проект?', `Проект «${p.client}» исчезнет вместе с обещаниями, документами, часами и сообщениями бота. Журнал приёмки останется — его удалить нельзя. Отменить удаление нельзя.`, 'Удалить проект', () => {
      log(p, 'Проект удалён');
      S.projects = S.projects.filter(x => x.id !== p.id);
      ['promises', 'documents', 'hours', 'bot', 'meetings'].forEach(k => { S[k] = S[k].filter(x => x.projectId !== p.id); });
      save(); location.hash = '#/projects'; toast(`Проект «${p.client}» удалён.`);
    });
  },
  startProject(d) {
    const p = proj(d.id);
    p.started = true;
    log(p, 'Клиента поприветствовали, даты согласованы. Открыт блок 1');
    save(); rerender(); toast('Проект стартовал: аналитик видит блок 1 у себя в «Моём дне».');
  },
  linkTg(d) {
    const p = proj(d.id);
    p.tgLinked = true;
    botSay(p, 'info', 'Группа привязана к проекту. Здесь я буду присылать блоки на приёмку, документы и напоминания.');
    log(p, 'Telegram-группа привязана к проекту по коду');
    save(); rerender(); toast('Группа привязана.');
  },
  runCheck(d) {
    const p = proj(d.id), b = blockOf(p, d.n);
    b.check = { ran: true, items: {} };
    tplOf(b).checks.forEach(k => {
      const need = Number(pkgOf(p).items[k]), have = Number(p.account[k]);
      b.check.items[k] = { need, have, state: have >= need ? 'ok' : 'fail', comment: '' };
    });
    const fails = tplOf(b).checks.filter(k => b.check.items[k].state === 'fail');
    log(p, `Сверка блока ${b.n}: ${fails.length ? 'расхождения — ' + fails.map(k => CHECK_LABELS[k].toLowerCase()).join(', ') : 'всё по пакету'}`, 'Система');
    save(); rerender();
    toast(fails.length ? `Не хватает: ${fails.map(k => CHECK_LABELS[k].toLowerCase()).join(', ')}. Решите по каждому пункту.` : 'Сверка пройдена: всё сделано по пакету или больше.');
  },
  confirmCheck(d) {
    const p = proj(d.id), b = blockOf(p, d.n), it = b.check.items[d.k];
    openForm({
      title: `${CHECK_LABELS[d.k]}: подтвердить «ок»`, text: `По пакету ${it.need}, в аккаунте ${it.have}. Объясните, почему это ок — запись попадёт в журнал.`,
      fields: [{ name: 'comment', label: 'Почему это ок', type: 'textarea', required: true, requiredText: 'Без комментария подтвердить нельзя.' }],
      submit: 'Подтвердить',
      onSubmit(v) {
        it.state = 'confirmed'; it.comment = v.comment;
        log(p, `Сверка блока ${b.n}: «${CHECK_LABELS[d.k].toLowerCase()}» ${it.have} из ${it.need} подтверждено аналитиком. Комментарий: ${v.comment}`);
        save(); rerender(); toast('Пункт принят по решению аналитика.');
      },
    });
  },
  recheck(d) {
    const p = proj(d.id), b = blockOf(p, d.n), it = b.check.items[d.k];
    it.have = Number(p.account[d.k]); it.need = Number(pkgOf(p).items[d.k]);
    it.state = it.have >= it.need ? 'ok' : 'fail';
    log(p, `Перепроверка блока ${b.n}, «${CHECK_LABELS[d.k].toLowerCase()}»: ${it.state === 'ok' ? 'теперь по пакету' : `всё ещё ${it.have} из ${it.need}`}`, 'Система');
    save(); rerender();
    toast(it.state === 'ok' ? 'Перепроверено: теперь всё по пакету.' : `Всё ещё не хватает: ${it.have} из ${it.need}. Задача остаётся у аналитика.`);
  },
  sendBlock(d) {
    const p = proj(d.id), b = blockOf(p, d.n);
    if (!canSend(b)) { toast('Блок пока нельзя отправить: отметьте все задачи и пройдите сверку.'); return; }
    b.status = 'sent'; b.sentAt = today(); b.reminded = false; b.reason = '';
    botSay(p, 'block', fill(S.settings.botTexts.blockSent, { n: b.n, title: tplOf(b).title }), { n: b.n }, ['ok', 'ask', 'no']);
    log(p, `Блок ${b.n} «${tplOf(b).title}» отправлен клиенту целиком`);
    ui.tab[p.id] = 'bot';
    save(); rerender(); toast(`Блок ${b.n} отправлен. Автоприёмка ${fmt(deadlineOf(b))}, если клиент не ответит.`);
  },
  answer(d) {
    const m = findMsg(d.msg);
    if (!m || m.answer) return;
    if (d.v === 'no' || d.v === 'reject') { ui.reasonFor = m.id; rerender(); const ta = $('#reason_' + m.id); if (ta) ta.focus(); return; }
    applyAnswer(m, d.v, '');
  },
  sendReason(d) {
    const m = findMsg(d.msg);
    const ta = $('#reason_' + m.id);
    const reason = ta.value.trim();
    if (!reason) { $('#reasonErr_' + m.id).textContent = 'Напишите причину — без неё ответ «не ок» не принимается.'; ta.focus(); return; }
    ui.reasonFor = null;
    applyAnswer(m, m.buttons.includes('no') ? 'no' : 'reject', reason);
  },
  cancelReason() { ui.reasonFor = null; rerender(); },

  promiseNew(d) { promiseForm(null, d.project); },
  promiseEdit(d) { promiseForm(findPromise(d.id)); },
  promiseDelete(d) {
    const x = findPromise(d.id);
    confirmBox('Удалить обещание?', `«${x.text}» пропадёт из реестра и из метрики. Отменить нельзя.`, 'Удалить', () => {
      S.promises = S.promises.filter(y => y.id !== x.id);
      const p = proj(x.projectId); if (p) log(p, `Обещание удалено: «${x.text}»`);
      save(); rerender(); toast('Обещание удалено.');
    });
  },
  promiseDone(d) {
    const x = findPromise(d.id), p = proj(x.projectId);
    x.status = 'done'; x.doneAt = today();
    if (p) { botSay(p, 'promise', fill(S.settings.botTexts.promiseDone, { text: x.text }), { promiseId: x.id }, ['confirm']); log(p, `Обещание выполнено${x.doneAt <= x.due ? ' в срок' : ' с опозданием'}: «${x.text}». Клиента попросили подтвердить`); }
    save(); rerender(); toast('Отмечено выполненным. Бот попросил клиента подтвердить.');
  },
  promiseMove(d) {
    const x = findPromise(d.id);
    openForm({
      title: 'Перенести срок', text: `«${x.text}». Сейчас срок ${fmt(x.due)}. Перенос возможен только если клиенту уже сообщили.`,
      fields: [
        { name: 'due', label: 'Новый срок', type: 'date', required: true, value: addDays(x.due, 2) },
        { name: 'informed', label: 'Клиенту сообщили о переносе', type: 'checkbox', required: true, requiredText: 'Сначала сообщите клиенту — без этого срок не переносится.' },
      ],
      submit: 'Перенести',
      validate: v => (v.due <= x.due ? { due: 'Новый срок должен быть позже текущего.' } : null),
      onSubmit(v) {
        x.moves.push({ from: x.due, to: v.due, at: today() });
        const old = x.due; x.due = v.due;
        const p = proj(x.projectId); if (p) log(p, `Срок обещания «${x.text}» перенесён с ${fmt(old)} на ${fmt(v.due)}, клиенту сообщили`);
        save(); rerender(); toast(`Срок перенесён на ${fmt(v.due)}. Старая дата сохранена в журнале.`);
      },
    });
  },
  promiseTell(d) {
    const x = findPromise(d.id), p = proj(x.projectId);
    x.informed = true;
    if (p) { botSay(p, 'info', fill(S.settings.botTexts.promise, { text: x.text, date: fmt(x.due) })); log(p, `Клиенту сообщён срок: «${x.text}» до ${fmt(x.due)}`); }
    save(); rerender(); toast('Бот написал клиенту срок в группу.');
  },

  makeAct(d) {
    const p = proj(d.id);
    S.seq.act += 1;
    const doc = { id: uid(), projectId: p.id, type: 'act', num: 'А-' + pad(S.seq.act).padStart(3, '0'), status: 'draft', createdAt: today(), reason: '' };
    S.documents.push(doc);
    log(p, `Сформирован акт № ${doc.num} из 5 принятых блоков`);
    save(); rerender(); toast(`Акт № ${doc.num} сформирован. Теперь направьте его клиенту.`);
  },
  makeInvoice(d) {
    const p = proj(d.id);
    S.seq.invoice += 1;
    const doc = { id: uid(), projectId: p.id, type: 'invoice', num: 'С-' + pad(S.seq.invoice).padStart(3, '0'), status: 'draft', createdAt: today(), reason: '' };
    S.documents.push(doc);
    log(p, `Выставлен счёт на поддержку № ${doc.num}`);
    save(); rerender(); toast(`Счёт № ${doc.num} создан.`);
  },
  docSend(d) {
    const doc = findDoc(d.id), p = proj(doc.projectId);
    doc.status = 'sent'; doc.reason = '';
    botSay(p, 'doc', fill(S.settings.botTexts.docSent, { type: DOC_TYPES[doc.type], num: doc.num }), { docId: doc.id }, ['accept', 'reject']);
    log(p, `${DOC_TYPES[doc.type]} № ${doc.num} направлен клиенту`);
    save(); rerender(); toast('Документ направлен клиенту в Telegram-группу.');
  },
  docSign(d) {
    const doc = findDoc(d.id), p = proj(doc.projectId);
    doc.status = 'signed';
    if (doc.type === 'act' && !p.actDate) p.actDate = today();
    log(p, `${DOC_TYPES[doc.type]} № ${doc.num} отмечен подписанным юридически`);
    save(); rerender(); toast(doc.type === 'act' ? 'Акт подписан. Проект перешёл в «После акта», касания посчитаны от сегодняшней даты.' : 'Отмечено.');
  },
  addMeeting(d) {
    const p = proj(d.id);
    const model = S.settings.llm.protocol;
    S.meetings.push({ id: uid(), projectId: p.id, date: today(), title: 'Рабочая встреча', model, summary: 'Черновик протокола: обсудили следующий блок, клиент просит отчёт по менеджерам и напоминания о звонках.' });
    log(p, `Получен транскрипт встречи, черновик протокола сделала модель ${MODELS.find(m => m.id === model).name}`, 'Система');
    save(); rerender(); toast('Транскрипт получен, черновик протокола готов. Аналитику пришло сообщение в личку.');
  },
  touchDone(d) {
    const p = proj(d.id);
    p.touchesDone[d.day] = true;
    const t = TOUCHES.find(x => x.day === Number(d.day));
    log(p, `День ${t.day}: «${t.title}» — сделано`);
    save(); rerender(); toast('Касание отмечено.');
  },
  setHours(d) {
    const u = me();
    const ex = S.hours.find(h => h.projectId === d.id && h.userId === u.id && h.week === d.week);
    if (ex) ex.range = d.v; else S.hours.push({ id: uid(), projectId: d.id, userId: u.id, week: d.week, range: d.v });
    save(); rerender(); toast(`Часы сохранены: ${RANGES.find(r => r.v === d.v).label}.`);
  },

  userNew() { userForm(null); },
  userEdit(d) { userForm(S.users.find(u => u.id === d.id)); },
  userDelete(d) {
    const u = S.users.find(x => x.id === d.id);
    if (u.isMain) { toast('Главного админа удалить нельзя.'); return; }
    if (u.roles.includes('admin') && !me().isMain) { toast('Удалить админа может только главный админ.'); return; }
    confirmBox('Удалить сотрудника?', `${u.name} больше не сможет войти. Его проекты останутся, но ответственного нужно будет назначить заново.`, 'Удалить', () => {
      S.users = S.users.filter(x => x.id !== u.id);
      S.projects.forEach(p => Object.keys(p.team).forEach(r => { if (p.team[r] === u.id) p.team[r] = ''; }));
      save(); rerender(); toast(`${u.name} удалён(а) из системы.`);
    });
  },
  rollback(d) {
    const h = S.history.find(x => x.id === d.id);
    setPath(h.path, h.from, 'Откат: ' + h.label);
    rerender();
  },

  download() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `put-klienta-kopiya-${realToday()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Копия скачана в папку загрузок.');
  },
  realDate() { S.testDate = ''; save(); rerender(); toast('Вернули настоящую дату.'); },
  resetDemo() {
    confirmBox('Заменить данные демо-клиентами?', 'Текущие проекты, обещания и настройки заменятся демо-данными. Отменить нельзя — сначала скачайте копию, если она нужна.', 'Заменить', () => {
      S = demoState(); save(); location.hash = '#/day'; rerender(false); toast('Загружены демо-данные.');
    });
  },
  wipe() {
    confirmBox('Удалить все данные?', 'Из этого браузера пропадут все проекты, сотрудники и настройки. Отменить нельзя — сначала скачайте копию, если она нужна.', 'Удалить всё', () => {
      try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ }
      S = null; location.hash = '#/'; rerender(false); toast('Все данные удалены.');
    });
  },
};

function applyAnswer(m, value, reason) {
  const p = proj(m.projectId);
  m.answer = { value, reason };
  if (m.kind === 'block') {
    const b = blockOf(p, m.ref.n);
    if (value === 'no') {
      b.status = 'returned'; b.reason = reason; b.check = { ran: false, items: {} }; b.answer = 'no';
      log(p, `Ответ по блоку ${b.n}: «не ок». Причина: ${reason}`, 'Клиент');
      toast(`Блок ${b.n} вернулся аналитику на правки.`);
    } else {
      b.status = 'accepted'; b.acceptedAt = today(); b.answer = value;
      log(p, `Ответ по блоку ${b.n}: «${ANSWERS[value].toLowerCase()}»`, 'Клиент');
      if (value === 'ask') {
        S.promises.push({ id: uid(), projectId: p.id, text: `Разобрать вопрос клиента по блоку ${b.n}`, ownerId: p.team.analyst, due: addWorkDays(today(), 2), status: 'open', doneAt: '', moves: [], informed: false, confirmed: false });
        toast(`Блок ${b.n} принят. Вопрос клиента стал задачей аналитику со сроком ${fmt(addWorkDays(today(), 2))}.`);
      } else toast(`Блок ${b.n} принят клиентом.`);
    }
  } else if (m.kind === 'doc') {
    const doc = findDoc(m.ref.docId);
    if (doc) {
      doc.status = value === 'accept' ? 'accepted' : 'rejected'; doc.reason = reason;
      log(p, `${DOC_TYPES[doc.type]} № ${doc.num}: ${value === 'accept' ? 'принят клиентом' : 'не принят. Причина: ' + reason}`, 'Клиент');
      toast(value === 'accept' ? 'Клиент принял документ.' : 'Клиент не принял документ — он вернулся на исправление.');
    }
  } else if (m.kind === 'promise') {
    const x = findPromise(m.ref.promiseId);
    if (x) { x.confirmed = true; log(p, `Клиент подтвердил выполнение: «${x.text}»`, 'Клиент'); }
    toast('Клиент подтвердил выполнение.');
  }
  save(); rerender();
}

function promiseForm(x, projectId) {
  const vis = visibleProjects();
  if (!vis.length) { toast('Сначала нужен хотя бы один проект.'); return; }
  const people = S.users.filter(u => u.roles.some(r => ['analyst', 'am', 'sales'].includes(r)));
  openForm({
    title: x ? 'Изменить обещание' : 'Новое обещание',
    text: x ? '' : 'Что пообещали клиенту и к какому сроку. Чтобы бот написал срок клиенту, нажмите потом «Сообщить клиенту».',
    fields: [
      { name: 'projectId', label: 'Клиент', type: 'select', options: vis.map(p => ({ value: p.id, label: p.client })), value: x ? x.projectId : projectId || vis[0].id },
      { name: 'text', label: 'Что пообещали', required: true, value: x ? x.text : '' },
      { name: 'ownerId', label: 'Кто обещал', type: 'select', options: people.map(u => ({ value: u.id, label: u.name })), value: x ? x.ownerId : me().id },
      { name: 'due', label: 'Срок', type: 'date', required: true, value: x ? x.due : addWorkDays(today(), 2) },
    ],
    submit: x ? 'Сохранить изменения' : 'Добавить обещание',
    onSubmit(v) {
      const p = proj(v.projectId);
      if (x) {
        if (v.due !== x.due) { x.moves.push({ from: x.due, to: v.due, at: today() }); }
        Object.assign(x, { projectId: v.projectId, text: v.text, ownerId: v.ownerId, due: v.due });
        log(p, `Обещание изменено: «${v.text}», срок ${fmt(v.due)}`);
        toast('Обещание сохранено.');
      } else {
        S.promises.push({ id: uid(), projectId: v.projectId, text: v.text, ownerId: v.ownerId, due: v.due, status: 'open', doneAt: '', moves: [], informed: false, confirmed: false });
        log(p, `Новое обещание: «${v.text}» до ${fmt(v.due)}`);
        toast('Обещание добавлено в реестр.');
      }
      save(); rerender();
    },
  });
}

function userForm(u) {
  const iAmMain = !!me().isMain;
  const roleOpts = Object.keys(ROLES).map(r => ({ value: r, label: ROLES[r], disabled: r === 'admin' && !iAmMain }));
  openForm({
    title: u ? 'Изменить сотрудника' : 'Новый сотрудник',
    text: u ? '' : 'Пароль сотрудник задаст сам при первом входе по ссылке-приглашению. В прототипе входа нет.',
    fields: [
      { name: 'name', label: 'Имя и фамилия', required: true, value: u ? u.name : '' },
      { name: 'login', label: 'Логин', required: true, value: u ? u.login : '' },
      { name: 'roles', label: 'Роли (можно несколько)', type: 'checks', required: true, requiredText: 'Выберите хотя бы одну роль.', options: roleOpts, value: u ? u.roles : [], hint: iAmMain ? '' : 'Роль «Админ» назначает только главный админ.' },
    ],
    submit: u ? 'Сохранить изменения' : 'Добавить сотрудника',
    validate(v) {
      const dup = S.users.find(x => x.login.toLowerCase() === v.login.toLowerCase() && (!u || x.id !== u.id));
      if (dup) return { login: 'Такой логин уже есть.' };
      if (u && u.isMain && !v.roles.includes('admin')) return { roles: 'У главного админа нельзя снять роль «Админ».' };
      return null;
    },
    onSubmit(v) {
      let roles = v.roles;
      if (!iAmMain) roles = roles.filter(r => r !== 'admin').concat(u && u.roles.includes('admin') ? ['admin'] : []);
      if (u) { Object.assign(u, { name: v.name, login: v.login, roles }); toast('Сотрудник сохранён.'); }
      else { S.users.push({ id: 'u' + uid(), name: v.name, login: v.login, roles, tg: false }); toast(`${v.name} добавлен(а). Ссылка-приглашение ушла бы ему в Telegram.`); }
      save(); rerender();
    },
  });
}

const CHANGES = {
  user(el) { S.currentUserId = el.value; save(); ui.reasonFor = null; rerender(false); toast(`Теперь вы смотрите глазами: ${me().name}.`); },
  onlyMine(el) { ui.onlyMine = el.checked; rerender(); },
  onlyProblems(el) { ui.onlyProblems = el.checked; rerender(); },
  owner(el) { ui.owner = el.value; rerender(); },
  task(el) {
    const p = proj(el.dataset.id), b = blockOf(p, el.dataset.n), t = b.tasks.find(x => x.id === el.dataset.task);
    t.done = el.checked; save(); rerender();
  },
  account(el) {
    const p = proj(el.dataset.id);
    const v = Math.max(0, Number(el.value) || 0);
    p.account[el.dataset.k] = v; save();
  },
  pkg(el) {
    const v = Math.max(0, Number(el.value) || 0);
    const pk = S.packages[el.dataset.id];
    setPath(['packages', el.dataset.id, el.dataset.k], v, `Пакет «${pk.name}»: ${el.dataset.k === 'price' ? 'цена' : 'план часов'}`);
  },
  pkgItem(el) {
    const v = Math.max(0, Number(el.value) || 0);
    const pk = S.packages[el.dataset.id];
    setPath(['packages', el.dataset.id, 'items', el.dataset.k], v, `Пакет «${pk.name}»: ${CHECK_LABELS[el.dataset.k].toLowerCase()}`);
  },
  param(el) {
    const v = Math.max(0, Number(el.value) || 0);
    setPath(['settings', el.dataset.k], v, PARAMS.find(p => p[0] === el.dataset.k)[1]);
  },
  botText(el) {
    const v = el.value.trim();
    if (!v) { toast('Текст не может быть пустым.'); el.value = S.settings.botTexts[el.dataset.k]; return; }
    setPath(['settings', 'botTexts', el.dataset.k], v, 'Текст бота: ' + BOT_TEXTS[el.dataset.k].toLowerCase());
  },
  llm(el) {
    setPath(['settings', 'llm', el.dataset.k], el.value, 'Модель: ' + (LLM_TASKS[el.dataset.k] || 'запасная').toLowerCase());
  },
  holidays(el) {
    const lines = el.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const bad = lines.filter(l => !parseUserDate(l));
    if (bad.length) { $('#holErr').textContent = `Не понял даты: ${bad.join(', ')}. Нужен формат ДД.ММ.ГГГГ.`; return; }
    const list = [...new Set(lines.map(parseUserDate))].sort();
    if (setPath(['settings', 'holidays'], list, 'Производственный календарь')) rerender();
  },
  testDate(el) {
    if (!el.value) return;
    S.testDate = el.value === realToday() ? '' : el.value;
    save(); rerender(); toast(`Дата в прототипе: ${fmt(today())}.`);
  },
};

// ===== Подписки на события =====
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el);
});
$('#fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (err) { toast('Это не файл копии: не удалось прочитать JSON.'); return; }
    if (!data || data.version !== VERSION || !Array.isArray(data.projects) || !Array.isArray(data.users)) { toast('Файл не похож на копию данных «Пути клиента».'); return; }
    const apply = () => { S = data; save(); location.hash = '#/day'; rerender(false); toast(`Копия загружена: ${data.projects.length} ${plural(data.projects.length, 'проект', 'проекта', 'проектов')}.`); };
    if (S) confirmBox('Заменить данные копией?', `Текущие данные заменятся копией из файла «${file.name}» (${data.projects.length} ${plural(data.projects.length, 'проект', 'проекта', 'проектов')}). Отменить нельзя.`, 'Заменить', apply);
    else apply();
  };
  reader.readAsText(file);
});
$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') e.target.close(); });
window.addEventListener('hashchange', () => { ui.reasonFor = null; render(); window.scrollTo(0, 0); });

S = load();
render();

// Работа без интернета: регистрируем service worker (только когда открыто по http/https, не из файла)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* без офлайна приложение всё равно работает */ });
  });
}
