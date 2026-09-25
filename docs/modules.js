/**
 * modules.js — طبقة البيانات والتخزين (Option B)
 * في الربط الفعلي تُستبدل القراءات باستعلامات Supabase (modules, permissions, profiles, settings).
 */

/* ── مجموعات الوحدات (مطابقة لجدول module_groups في seed.sql) ── */
const MODULE_GROUPS = {
  operations:     { name: 'الخزينة والعمليات', icon: 'fa-vault' },
  administration: { name: 'النظام والإدارة',  icon: 'fa-gear'  },
};

/* ── جدول modules — 9 وحدات (مطابق لـ seed.sql v3.0) ── */
const MODULES = [
  /* داخل مجموعة operations (الخزينة والعمليات) — 6 وحدات */
  { key: 'dashboard',            name: 'لوحة التحكم',           icon: 'fa-gauge',                 order: 1, status: 'under_construction', group: 'operations',     plan: 'ملخص الرصيد، الإيراد والصرف الشهري، ومؤشرات الالتزام.' },
  { key: 'collection',           name: 'التحصيل / الإيرادات',   icon: 'fa-hand-holding-dollar',   order: 2, status: 'under_construction', group: 'operations',     plan: 'تحصيل الاشتراكات والتبرعات مع إيصالات فورية.' },
  { key: 'expenses',             name: 'الصرف / المصروفات',     icon: 'fa-money-bill-transfer',   order: 3, status: 'under_construction', group: 'operations',     plan: 'طلبات الصرف، الموافقات، وربطها ببنود الميزانية.' },
  { key: 'vouchers',             name: 'سندات القبض والصرف',    icon: 'fa-file-invoice',          order: 4, status: 'under_construction', group: 'operations',     plan: 'سندات مرقّمة تلقائيًا قابلة للطباعة والتدقيق.' },
  { key: 'treasury_ledger',      name: 'دفتر الخزينة',          icon: 'fa-book',                  order: 5, status: 'under_construction', group: 'operations',     plan: 'حركة يومية مرتبة بالرصيد الجاري لكل عملية.' },
  { key: 'treasury_reports',     name: 'تقارير الخزينة',        icon: 'fa-chart-pie',             order: 6, status: 'under_construction', group: 'operations',     plan: 'تقارير شهرية وسنوية جاهزة لمجلس الإدارة والمراجع.' },

  /* داخل مجموعة administration (النظام والإدارة) — 3 وحدات */
  { key: 'membership_affairs',   name: 'شؤون العضوية',          icon: 'fa-id-card',               order: 7, status: 'under_construction', group: 'administration', plan: 'إدارة حالات العضوية، التجديدات، والإعفاءات مع سجل كامل للتحديثات.' },
  { key: 'settings_maintenance', name: 'الإعدادات والصيانة',    icon: 'fa-gear',                  order: 8, status: 'active',             group: 'administration', plan: '' },
  { key: 'users',                name: 'المستخدمون والصلاحيات', icon: 'fa-user-shield',           order: 9, status: 'active',             group: 'administration', plan: '' },
];

/* ── التبويبات الفرعية (Module Tabs) — 9 تبويبات ── */
const MODULE_TABS = {
  membership_affairs: [
    { key: 'members',          name: 'الأعضاء',         order: 1, status: 'under_construction' },
    { key: 'applications',     name: 'طلبات الانتساب',  order: 2, status: 'under_construction' },
    { key: 'subscriptions',    name: 'الاشتراكات',       order: 3, status: 'under_construction' },
    { key: 'membership_types', name: 'أنواع العضوية',   order: 4, status: 'under_construction' },
  ],
  settings_maintenance: [
    { key: 'association_profile', name: 'بيانات المنشأة',   order: 1, status: 'active' },
    { key: 'backup',              name: 'النسخ الاحتياطي',  order: 2, status: 'under_construction' },
    { key: 'activation',          name: 'التفعيل',           order: 3, status: 'under_construction' },
    { key: 'admin_settings',      name: 'الضبط الإداري',    order: 4, status: 'under_construction' },
    { key: 'app_settings',        name: 'ضبط التطبيق',      order: 5, status: 'under_construction' },
  ],
};

/* ── أيقونات الشريط العلوي (Topbar Icons) — 3 أيقونات ── */
const TOPBAR_ICONS = [
  { key: 'reports_hub', name: 'مركز التقارير العام', icon: 'fa-chart-line', url: null, show_badge: true, order: 1 },
  { key: 'notifications', name: 'الإشعارات',           icon: 'fa-bell',       url: null,           show_badge: true, order: 2 },
  { key: 'messages',      name: 'الرسائل',             icon: 'fa-envelope',   url: null,           show_badge: true, order: 3 },
];

/* ── الأدوار ── */
const ROLES = [
  { key: 'chairman',        label: 'رئيس مجلس الإدارة', hint: 'اطلاع كامل + إدارة النظام' },
  { key: 'finance_manager', label: 'المدير المالي',     hint: 'إدارة العمليات المالية والإعدادات' },
  { key: 'cashier',         label: 'أمين الصندوق',      hint: 'التحصيل والصرف والسندات' },
  { key: 'auditor',         label: 'المراجع',           hint: 'اطلاع رقابي دون الإعدادات' },
];
const ROLE_LABELS = { chairman: 'رئيس مجلس الإدارة', finance_manager: 'المدير المالي', cashier: 'أمين الصندوق', auditor: 'المراجع' };
const ACTIONS = [['view', 'عرض'], ['add', 'إضافة'], ['edit', 'تعديل'], ['delete', 'حذف']];

/* ── مصفوفة الصلاحيات الافتراضية (مطابقة تمامًا لـ seed.sql v3.0 — 50 صلاحية) ── */
function defaultMatrix() {
  return {
    /* chairman (24 صلاحية): view على كل الـ9، add/edit/delete على 3، add/edit على 3 */
    chairman: {
      dashboard:            ['view'],
      collection:           ['view', 'add', 'edit'],
      expenses:             ['view', 'add', 'edit'],
      vouchers:             ['view', 'add', 'edit'],
      treasury_ledger:      ['view'],
      treasury_reports:     ['view'],
      membership_affairs:   ['view', 'add', 'edit', 'delete'],
      settings_maintenance: ['view', 'add', 'edit', 'delete'],
      users:                ['view', 'add', 'edit', 'delete'],
    },
    /* finance_manager (18 صلاحية): view على الـ9، add/edit على 4، edit على 1 */
    finance_manager: {
      dashboard:            ['view'],
      collection:           ['view', 'add', 'edit'],
      expenses:             ['view', 'add', 'edit'],
      vouchers:             ['view', 'add', 'edit'],
      treasury_ledger:      ['view'],
      treasury_reports:     ['view'],
      membership_affairs:   ['view', 'add', 'edit'],
      settings_maintenance: ['view', 'edit'],
      users:                ['view'],
    },
    /* cashier (10 صلاحيات): view على 7 وحدات، add على 3 وحدات */
    cashier: {
      dashboard:            ['view'],
      collection:           ['view', 'add'],
      expenses:             ['view', 'add'],
      vouchers:             ['view', 'add'],
      treasury_ledger:      ['view'],
      treasury_reports:     ['view'],
      membership_affairs:   ['view'],
      settings_maintenance: [],
      users:                [],
    },
    /* auditor (7 صلاحيات): view على 7 وحدات فقط */
    auditor: {
      dashboard:            ['view'],
      collection:           ['view'],
      expenses:             ['view'],
      vouchers:             ['view'],
      treasury_ledger:      ['view'],
      treasury_reports:     ['view'],
      membership_affairs:   ['view'],
      settings_maintenance: [],
      users:                [],
    },
  };
}

/* ── المستخدمون الأوليون (متسقون مع README الرئيسي — رمز الدخول التجريبي: 123456) ── */
const DEFAULT_USERS = [
  { id: 'u-1', full_name: 'سعد الحربي',     username: 'saad',   email: 'saad@baraka.org',   role: 'chairman',        status: 'active',    last_login: '2026-02-14 09:02', created_at: '2025-09-01' },
  { id: 'u-2', full_name: 'أحمد العلي',     username: 'ahmad',  email: 'ahmad@baraka.org',  role: 'finance_manager', status: 'active',    last_login: '2026-02-13 13:40', created_at: '2025-09-01' },
  { id: 'u-3', full_name: 'فاطمة الزهراء',  username: 'fatima', email: 'fatima@baraka.org', role: 'cashier',         status: 'active',    last_login: '2026-02-12 08:15', created_at: '2025-10-11' },
  { id: 'u-4', full_name: 'خالد المطيري',   username: 'khalid', email: 'khalid@baraka.org', role: 'auditor',         status: 'active',    last_login: '2026-01-28 11:30', created_at: '2025-11-02' },
  { id: 'u-5', full_name: 'منى السالم',     username: 'mona',   email: 'mona@baraka.org',   role: 'cashier',         status: 'suspended', last_login: '2025-12-19 10:05', created_at: '2025-10-20' },
];
const DEMO_PASSWORD = '123456';

/* ── الإعدادات الافتراضية (جدول settings — صف واحد) ── */
const DEFAULT_SETTINGS = {
  association_name: 'جمعية البركة الأهلية',
  logo_url: '',
  address: 'الرياض — حي العليا، شارع الملك فهد',
  phone: '+966 50 123 4567',
  email: 'info@baraka.org',
  currency: 'ريال سعودي',
  fiscal_year: '2026',
  allow_email_login: true,
  username_case_sensitive: false,
  updated_at: '',
};

/* ── التخزين المحلي (يُستبدل بـ Supabase عند الربط) ── */
const B_STORE = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value, sessionOnly = false) {
    try {
      const raw = JSON.stringify(value);
      if (sessionOnly) sessionStorage.setItem(key, raw);
      else localStorage.setItem(key, raw);
    } catch { /* تجاهل */ }
  },
  del(key) { localStorage.removeItem(key); sessionStorage.removeItem(key); },
};

function loadMatrix() {
  const stored = B_STORE.get('baraka_b.matrix', null);
  const def = defaultMatrix();
  if (!stored) {
    saveMatrix(def);
    return def;
  }

  /* ترحيل آمن وتطهير مفاتيح الإصدار السابق (members, reports_hub) */
  let modified = false;
  const migrated = {};
  const currentKeys = MODULES.map(m => m.key);

  Object.keys(def).forEach((role) => {
    migrated[role] = {};
    const roleStored = stored[role] || {};

    // حذف أي مفتاح قديم ليس ضمن الوحدات الـ 9 الحالية
    Object.keys(roleStored).forEach((k) => {
      if (!currentKeys.includes(k)) modified = true;
    });

    // إسناد المفاتيح الحالية مع استبقاء مصفوفات الصلاحيات الصحيحة أو أخذ الافتراضي
    currentKeys.forEach((k) => {
      if (Array.isArray(roleStored[k])) {
        migrated[role][k] = roleStored[k];
      } else {
        migrated[role][k] = def[role][k] || [];
        modified = true;
      }
    });
  });

  if (modified) {
    saveMatrix(migrated);
  }
  return migrated;
}

function loadUsers()    { return B_STORE.get('baraka_b.users', DEFAULT_USERS); }
function loadSettings() { return B_STORE.get('baraka_b.settings', DEFAULT_SETTINGS); }

function saveUsers(list)       { B_STORE.set('baraka_b.users', list); }
function saveMatrix(m)         { B_STORE.set('baraka_b.matrix', m); }
function saveSettings(s)       { B_STORE.set('baraka_b.settings', s); }

/* ══════════════════════════════════════════════════════════════
 * طبقة المزامنة مع Supabase (المراحل 1-3)
 * الاستراتيجية: localStorage يبقى مصدر القراءة الفوري (cache)،
 * وSupabase هو مصدر الحقيقة عند توفر الاتصال.
 * - fetch*: تقرأ من Supabase وتحدّث الـ cache المحلي (تعود إلى المحلي عند الفشل).
 * - push*:  تحفظ محليًا ثم ترسل إلى Supabase (لا تفشل الواجهة إن تعذّر الإرسال).
 * ══════════════════════════════════════════════════════════════ */
function sbClient() {
  return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
}

/* ── المرحلة 1: الإعدادات (جدول settings — صف واحد) ── */
async function fetchSettings() {
  const sb = sbClient();
  if (!sb) return loadSettings();
  try {
    const { data, error } = await sb.from('settings').select('*').order('id', { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return loadSettings();
    const s = {
      ...DEFAULT_SETTINGS,
      ...data,
      logo_url: data.logo_url || '',
      fiscal_year: data.fiscal_year != null ? String(data.fiscal_year) : DEFAULT_SETTINGS.fiscal_year,
      updated_at: data.updated_at || '',
    };
    delete s.id;
    saveSettings(s);
    return s;
  } catch (err) {
    console.warn('[Baraka] fetchSettings failed — using local cache:', err?.message || err);
    return loadSettings();
  }
}

async function pushSettings(s) {
  saveSettings(s);
  const sb = sbClient();
  if (!sb) return { ok: true, local: true };
  try {
    const row = {
      association_name: s.association_name,
      logo_url: s.logo_url || null,
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      currency: s.currency || 'ريال سعودي',
      fiscal_year: parseInt(s.fiscal_year, 10) || null,
      allow_email_login: !!s.allow_email_login,
      username_case_sensitive: !!s.username_case_sensitive,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: selErr } = await sb.from('settings').select('id').order('id', { ascending: true }).limit(1).maybeSingle();
    if (selErr) throw selErr;
    const q = existing?.id
      ? sb.from('settings').update(row).eq('id', existing.id)
      : sb.from('settings').insert(row);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[Baraka] pushSettings failed — saved locally only:', err?.message || err);
    return { ok: false, error: err };
  }
}

/* ── المرحلة 2: المستخدمون (جدول profiles) ── */
async function fetchUsers() {
  const sb = sbClient();
  if (!sb) return loadUsers();
  try {
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) return loadUsers();
    const users = data.map(p => ({
      id: p.id,
      full_name: p.full_name || '',
      username: p.username || '',
      email: p.email || '',
      role: p.role || 'cashier',
      status: p.status || 'active',
      last_login: p.last_login ? String(p.last_login).slice(0, 16).replace('T', ' ') : null,
      created_at: p.created_at ? String(p.created_at).slice(0, 10) : '',
    }));
    saveUsers(users);
    return users;
  } catch (err) {
    console.warn('[Baraka] fetchUsers failed — using local cache:', err?.message || err);
    return loadUsers();
  }
}

async function pushUsers(list) {
  saveUsers(list);
  const sb = sbClient();
  if (!sb) return { ok: true, local: true };
  try {
    /* profiles.id مرتبط بـ auth.users — نرسل فقط الصفوف ذات معرّف UUID صالح.
       المستخدمون المحليون (u-xxx) يحتاجون دعوة عبر Supabase Auth أولًا. */
    const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
    const rows = list.filter(u => isUuid(u.id)).map(u => ({
      id: u.id,
      full_name: u.full_name,
      username: u.username,
      email: u.email || '',
      role: u.role,
      status: u.status,
    }));
    if (!rows.length) return { ok: true, skipped: true };
    const { error } = await sb.from('profiles').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[Baraka] pushUsers failed — saved locally only:', err?.message || err);
    return { ok: false, error: err };
  }
}

/* ── المرحلة 3: مصفوفة الصلاحيات (جدول permissions) ── */
async function fetchMatrix() {
  const sb = sbClient();
  if (!sb) return loadMatrix();
  try {
    const { data, error } = await sb.from('permissions').select('role, module_key, action');
    if (error) throw error;
    if (!data || !data.length) return loadMatrix();
    const currentKeys = MODULES.map(m => m.key);
    const m = {};
    Object.keys(defaultMatrix()).forEach((role) => {
      m[role] = {};
      currentKeys.forEach((k) => { m[role][k] = []; });
    });
    data.forEach((r) => {
      if (!m[r.role]) { m[r.role] = {}; currentKeys.forEach((k) => { m[r.role][k] = []; }); }
      if (!currentKeys.includes(r.module_key)) return;
      if (!m[r.role][r.module_key].includes(r.action)) m[r.role][r.module_key].push(r.action);
    });
    saveMatrix(m);
    return m;
  } catch (err) {
    console.warn('[Baraka] fetchMatrix failed — using local cache:', err?.message || err);
    return loadMatrix();
  }
}

async function pushMatrix(m) {
  saveMatrix(m);
  const sb = sbClient();
  if (!sb) return { ok: true, local: true };
  try {
    const rows = [];
    Object.keys(m).forEach((role) => {
      Object.keys(m[role] || {}).forEach((module_key) => {
        (m[role][module_key] || []).forEach((action) => rows.push({ role, module_key, action }));
      });
    });
    /* استبدال كامل: حذف ثم إدراج */
    const { error: delErr } = await sb.from('permissions').delete().gte('id', 0);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await sb.from('permissions').insert(rows);
      if (insErr) throw insErr;
    }
    return { ok: true };
  } catch (err) {
    console.warn('[Baraka] pushMatrix failed — saved locally only:', err?.message || err);
    return { ok: false, error: err };
  }
}

/* ── الجلسة الحالية ── */
function currentUser() {
  const s = B_STORE.get('baraka_b.session', null);
  if (!s) return null;
  return loadUsers().find(u => u.id === s.userId && u.status === 'active') || null;
}

/* ── الصلاحيات ── */
function can(role, moduleKey, action) {
  return (loadMatrix()[role]?.[moduleKey] || []).includes(action);
}
function visibleModules(role) {
  return MODULES.slice().sort((a, b) => a.order - b.order).filter(m => can(role, m.key, 'view'));
}

/* ── دوال مساعدة جديدة ── */
function getModuleTabs(moduleKey) {
  return MODULE_TABS[moduleKey] || [];
}

function getTopbarIcons() {
  return [...TOPBAR_ICONS].sort((a, b) => a.order - b.order);
}

/* ── أدوات تاريخ ── */
function hijriToday() {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch { return ''; }
}
function gregorianToday() {
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}
function nowStamp() {
  return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).replace('،', '');
}

/* ── تصدير في بيئة Node (للاختبارات) مع الحفاظ على التوافق مع المتصفح ── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MODULES,
    MODULE_GROUPS,
    MODULE_TABS,
    TOPBAR_ICONS,
    defaultMatrix,
    loadMatrix,
    saveMatrix,
    getModuleTabs,
    getTopbarIcons,
  };
}
