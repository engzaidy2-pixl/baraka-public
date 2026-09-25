/**
 * auth.js — المصادقة وتسجيل الدخول
 *
 * المسار الأساسي (Supabase Auth):
 * - إن احتوى المُدخل على @ → يُعامل كبريد ويُمرَّر لـ auth.signInWithPassword مباشرة.
 * - وإلا → يُستدعى RPC get_email_by_username(uname) لجلب البريد المرتبط باسم المستخدم،
 *   مع احتياطي محلي (username → email من الكاش) إن تعذّر استدعاء الدالة.
 * ثم يُجلب profile من جدول profiles للتحقق من حالة الحساب وتحديث last_login.
 *
 * المسار الاحتياطي (وضع العرض المحلي): loginLocal() — يُستخدم فقط إذا كان supabaseClient غير متاح.
 */

const AUTH_MESSAGES = {
  empty:      'يرجى إدخال اسم المستخدم ورمز الدخول',
  invalid:    'اسم المستخدم أو رمز الدخول غير صحيح',
  noProfile:  'لم يتم العثور على الملف الشخصي',
  suspended:  'الحساب موقوف. تواصل مع المدير.',
  network:    'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.',
  unexpected: 'حدث خطأ غير متوقع',
};

/* ── عميل Supabase (null في وضع العرض المحلي) ── */
function authClient() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) return supabaseClient;
  if (typeof sbClient === 'function') return sbClient();
  return null;
}

/* ── إخفاء عناصر التجربة (رمز 123456) عند تشغيل Supabase Auth.
   لوحة الدخول السريع تبقى ظاهرة في الوضعين — تُبنى ديناميكيًا أدناه
   (كل زر = دور، ويعرض أول مستخدم نشط فيه من قاعدة البيانات) ── */
function applyAuthMode() {
  const live = !!authClient();
  ['demo-hint'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', live);
  });
}

/* ── حفظ الجلسة محليًا (يقرأها currentUser في modules.js) ── */
function saveSession(userId, remember = true) {
  B_STORE.del('baraka_b.session');
  B_STORE.set('baraka_b.session', { userId, remember }, !remember);
}

/* ── دمج الملف الشخصي في الكاش المحلي حتى يعمل currentUser قبل مزامنة fetchUsers ── */
function cacheProfile(profile) {
  try {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === profile.id || (profile.username && u.username === profile.username));
    const prev = idx >= 0 ? users[idx] : {};
    const row = {
      id: profile.id,
      full_name: profile.full_name || prev.full_name || '',
      username: profile.username || prev.username || '',
      email: profile.email || prev.email || '',
      role: profile.role || prev.role || 'cashier',
      status: profile.status || prev.status || 'active',
      last_login: nowStamp(),
      created_at: profile.created_at ? String(profile.created_at).slice(0, 10) : (prev.created_at || ''),
    };
    if (idx >= 0) users[idx] = row;
    else users.push(row);
    saveUsers(users);
  } catch (e) {
    console.warn('[Baraka] cacheProfile failed:', e?.message || e);
  }
}

/* ── توحيد شكل نتيجة RPC (نص / صف / مصفوفة صفوف) إلى بريد نصي ── */
function normalizeRpcEmail(result) {
  const row = Array.isArray(result) ? result[0] : result;
  if (!row) return '';
  if (typeof row === 'string') return row.trim();
  if (typeof row === 'object') {
    const value = row.email ?? row.get_email_by_username ?? Object.values(row)[0];
    return typeof value === 'string' ? value.trim() : '';
  }
  return '';
}

/* ── اسم المستخدم → البريد: RPC أولًا، ثم احتياطي من الكاش المحلي ── */
async function resolveEmail(sb, username) {
  const { data, error } = await sb.rpc('get_email_by_username', { uname: username });

  if (!error) {
    /* الدالة تعمل: نتيجتها نهائية (فارغة تعني عدم وجود مستخدم مطابق) */
    return normalizeRpcEmail(data);
  }

  console.warn('[Baraka] get_email_by_username RPC failed — falling back to local cache:', error.message || error);

  const settings = loadSettings();
  const cmp = (v) => (settings.username_case_sensitive ? String(v) : String(v).toLowerCase());
  const known = loadUsers().find((u) => u.username && cmp(u.username) === cmp(username));
  return known?.email || '';
}

/* ── تمييز أخطاء الاتصال عن أخطاء بيانات الدخول (واجهة AuthRetryableFetchError) ── */
function isNetworkError(error) {
  if (!error) return false;
  const status = error.status ?? error.statusCode;
  if (status === 0) return true;
  return error.name === 'AuthRetryableFetchError' ||
    /fetch|network|load failed|timeout/i.test(String(error.message || ''));
}

async function safeSignOut(sb) {
  try { await sb.auth.signOut(); }
  catch (e) { console.warn('[Baraka] signOut failed:', e?.message || e); }
}

/* ══════════════════════════════════════════════════════════════
 * loginLocal — دخول محلي من localStorage (وضع العرض فقط)
 * يُستخدم إذا كان supabaseClient غير متاح.
 * ══════════════════════════════════════════════════════════════ */
function loginLocal(identifier, password, remember = true) {
  const settings = loadSettings();
  const input = String(identifier || '').trim();
  const isEmail = input.includes('@');
  const cmp = (v) => (settings.username_case_sensitive ? String(v) : String(v).toLowerCase());
  const users = loadUsers();
  const found = users.find((u) =>
    isEmail ? cmp(u.email) === cmp(input) : cmp(u.username) === cmp(input)
  );

  if (!found || password !== DEMO_PASSWORD || found.status === 'suspended') {
    return { ok: false, message: AUTH_MESSAGES.invalid };
  }

  /* نجاح: تحديث last_login ثم حفظ الجلسة */
  const updated = users.map((u) => (u.id === found.id ? { ...u, last_login: nowStamp() } : u));
  saveUsers(updated);
  saveSession(found.id, remember);
  return { ok: true, user: { ...found, last_login: nowStamp() } };
}

/* ══════════════════════════════════════════════════════════════
 * loginAsync — الدخول عبر Supabase Auth
 * 1) تحديد البريد (RPC إن كان المُدخل اسم مستخدم).
 * 2) signInWithPassword.
 * 3) جلب profile والتحقق من الحالة، ثم تحديث last_login وحفظ الجلسة.
 * ══════════════════════════════════════════════════════════════ */
async function loginAsync(identifier, password, remember = true) {
  try {
    const input = String(identifier || '').trim();

    /* 0. تحقق أولي */
    if (!input || !password) {
      return { ok: false, message: AUTH_MESSAGES.empty };
    }

    /* 1. إذا لم يكن supabaseClient متاحًا، استخدم localStorage */
    const sb = authClient();
    if (!sb) {
      console.warn('[Baraka] Supabase not configured — using local login');
      return loginLocal(input, password, remember);
    }

    /* 2. تحديد البريد الإلكتروني */
    let email = input;
    if (!email.includes('@')) {
      /* اسم مستخدم → استخدم RPC */
      email = await resolveEmail(sb, email);
      if (!email) {
        return { ok: false, message: AUTH_MESSAGES.invalid };
      }
    }

    /* 3. تسجيل الدخول (اختيار مخزن الجلسة قبل الكتابة) */
    if (typeof setAuthPersistence === 'function') setAuthPersistence(remember);

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (authError || !authData?.user) {
      if (isNetworkError(authError)) {
        console.warn('[Baraka] signInWithPassword network error:', authError?.message || authError);
        return { ok: false, message: AUTH_MESSAGES.network };
      }
      return { ok: false, message: AUTH_MESSAGES.invalid };
    }

    /* 4. جلب profile من Supabase */
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.warn('[Baraka] profile lookup failed:', profileError?.message || profileError);
      await safeSignOut(sb);
      return { ok: false, message: AUTH_MESSAGES.noProfile };
    }

    /* 5. التحقق من حالة الحساب */
    if (profile.status === 'suspended') {
      await safeSignOut(sb);
      return { ok: false, message: AUTH_MESSAGES.suspended };
    }

    /* 6. تحديث last_login (لا يُفشل الدخول عند تعذّره) */
    const { error: updateError } = await sb
      .from('profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', authData.user.id);
    if (updateError) {
      console.warn('[Baraka] last_login update failed:', updateError.message || updateError);
    }

    /* 7. حفظ الجلسة محليًا (للتوافق مع الكود الحالي) + تجهيز الكاش للواجهة */
    cacheProfile(profile);
    saveSession(profile.id, remember);

    return { ok: true, user: profile };
  } catch (e) {
    console.error('[Baraka] loginAsync error:', e);
    return { ok: false, message: AUTH_MESSAGES.unexpected };
  }
}

/* ══════════════════════════════════════════════════════════════
 * الدخول السريع الديناميكي — أول مستخدم نشط لكل دور
 * كل زر يمثل دورًا ويعرض أول مستخدم نشط فيه (بترتيب created_at تصاعديًا):
 * - عند تشغيل Supabase: RPC get_quick_login_users() — دالة SECURITY DEFINER
 *   تعمل قبل الجلسة (anon) لأن RLS يمنع قراءة profiles مباشرة قبل الدخول.
 * - في وضع العرض المحلي (أو عند فشل RPC): تُحسب نفس القاعدة من الحسابات المحلية.
 * بهذا تتحدّث الأزرار تلقائيًا عند إضافة/تغيير/إيقاف المستخدمين.
 * ══════════════════════════════════════════════════════════════ */

/* ترتيب عرض الأزرار (مطابق لترتيب ROLES في modules.js) */
const QUICK_LOGIN_ROLES = ['chairman', 'finance_manager', 'cashier', 'auditor'];

/* تهريب نص قادم من قاعدة البيانات قبل حقنه في HTML */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* أول مستخدم نشط لكل دور من قائمة مستخدمين — بنفس منطق الـ RPC:
   status = 'active' + username غير فارغ + الأقدموية بـ created_at ASC */
function firstActiveUserPerRole(users) {
  const byRole = {};
  (Array.isArray(users) ? users : [])
    .filter((u) => u && u.status === 'active' && u.username)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .forEach((u) => {
      if (QUICK_LOGIN_ROLES.includes(u.role) && !byRole[u.role]) byRole[u.role] = u;
    });
  return byRole;
}

/* ترتيب صفوف النتيجة بترتيب الأدوار المعتمد (الـ RPC يرتب الأدوار أبجديًا) */
function quickLoginOrder(row) {
  const i = QUICK_LOGIN_ROLES.indexOf(row.role);
  return i === -1 ? QUICK_LOGIN_ROLES.length : i;
}

/* جلب مستخدمي الدخول السريع: RPC أولًا، ثم احتياطيًا من الحسابات المحلية عند الفشل.
   ملاحظة: نجاح الـ RPC بنتيجة فارغة يُحترم كما هو (لا يوجد نشطون) — لا احتياطي عندها. */
async function fetchQuickLoginUsers() {
  const sb = authClient();
  if (sb) {
    try {
      const { data, error } = await sb.rpc('get_quick_login_users');
      if (!error && Array.isArray(data)) {
        return data
          .filter((r) => r && r.username)
          .map((r) => ({ role: r.role, username: r.username, full_name: r.full_name || '' }))
          .sort((a, b) => quickLoginOrder(a) - quickLoginOrder(b));
      }
      if (error) {
        console.warn('[Baraka] get_quick_login_users RPC failed — falling back to local users:', error.message || error);
      }
    } catch (e) {
      console.warn('[Baraka] get_quick_login_users threw — falling back to local users:', e?.message || e);
    }
  }
  const byRole = firstActiveUserPerRole(loadUsers());
  return QUICK_LOGIN_ROLES
    .filter((role) => byRole[role])
    .map((role) => ({ role, username: byRole[role].username, full_name: byRole[role].full_name || '' }));
}

/* قالب زر الدخول السريع: اسم الدور + أول مستخدم نشط فيه (تلميح الدور في title) */
function quickLoginButtonHtml(row) {
  const meta = (typeof ROLES !== 'undefined' && Array.isArray(ROLES))
    ? ROLES.find((r) => r.key === row.role)
    : null;
  const roleLabel = meta?.label || row.role;
  const userName = row.full_name || row.username;
  const title = meta?.hint ? ` title="${escapeHtml(meta.hint)} — ${escapeHtml('@' + row.username)}"` : '';
  return `
    <button type="button" data-quick-user="${escapeHtml(row.username)}"${title} class="rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md">
      <span class="block text-[13px] font-extrabold text-navy-900">${escapeHtml(roleLabel)}</span>
      <span class="block text-[11px] font-semibold text-navy-400">${escapeHtml(userName)}</span>
    </button>`;
}

/* بناء الأزرار داخل الحاوية (أو رسالة عند لا مستخدمين نشطين) */
function renderQuickLoginButtons(rows) {
  const grid = document.getElementById('quick-login-grid');
  if (!grid) return;

  if (!rows.length) {
    grid.innerHTML = '<p class="col-span-2 rounded-xl border border-navy-100 bg-white/60 px-3 py-3 text-center text-[11px] font-bold text-navy-400">لا توجد حسابات نشطة متاحة للدخول السريع</p>';
    return;
  }
  grid.innerHTML = rows.map(quickLoginButtonHtml).join('');
}

/* جلب البيانات ثم بناء الأزرار */
async function renderQuickLogin() {
  const rows = await fetchQuickLoginUsers();
  renderQuickLoginButtons(rows);
}

/* تعبئة نموذج الدخول من زر الدخول السريع — تعبئة فقط، لا تسجّل الدخول */
function fillQuickLogin(username) {
  const idEl = document.getElementById('login-id');
  const pwEl = document.getElementById('login-password');
  if (!idEl || !pwEl || !username) return;

  /* املأ الحقول فقط */
  idEl.value = username;
  pwEl.value = 'Baraka@2026!';
  hideLoginError();

  /* تأثير بصري لطيف */
  idEl.classList.add('ring-2', 'ring-gold-400');
  pwEl.classList.add('ring-2', 'ring-gold-400');
  setTimeout(() => {
    idEl.classList.remove('ring-2', 'ring-gold-400');
    pwEl.classList.remove('ring-2', 'ring-gold-400');
  }, 800);

  /* ركّز على زر "دخول" الرسمي */
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');
  if (submitBtn) submitBtn.focus();
}

/* ══════════════════════════════════════════════════════════════
 * initLogin — ربط نموذج الدخول
 * ══════════════════════════════════════════════════════════════ */
function initLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  applyAuthMode();

  /* إظهار/إخفاء رمز الدخول */
  const eyeBtn = document.getElementById('eye-btn');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', () => {
      const pw = document.getElementById('login-password');
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eyeBtn.innerHTML = icon(show ? 'eye-off' : 'eye', 20);
      eyeBtn.setAttribute('aria-pressed', String(show));
    });
  }

/* دخول سريع ديناميكي: تفويض الأحداث على الحاوية — يبقى العمل سليمًا
   بعد إعادة بناء الأزرار (fetchQuickLoginUsers + renderQuickLogin) */
  const quickGrid = document.getElementById('quick-login-grid');
  if (quickGrid) {
    quickGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick-user]');
      if (!btn) return;
      fillQuickLogin(btn.getAttribute('data-quick-user'));
    });
    renderQuickLogin(); /* بناء الأزرار: أول مستخدم نشط لكل دور */
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEl = document.getElementById('login-id');
    const pwEl = document.getElementById('login-password');
    const remember = document.getElementById('remember').checked;
    const identity = idEl.value.trim();
    const pw = pwEl.value;
    hideLoginError();

    if (!identity || !pw) {
      showLoginError(AUTH_MESSAGES.empty);
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="b-spinner"></span> جارٍ التحقق…';

    const res = await loginAsync(identity, pw, remember);

    if (!res.ok) {
      btn.disabled = false;
      btn.innerHTML = 'دخول';
      showLoginError(res.message || AUTH_MESSAGES.invalid);
      return;
    }

    /* نجاح: التوجيه إلى dashboard.html */
   window.location.href = appPath('dashboard.html');
  });
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.remove('shake');
  void el.offsetWidth; /* إعادة تشغيل الحركة */
  el.classList.add('shake');
}
function hideLoginError() {
  const el = document.getElementById('login-error');
  if (el) el.classList.add('hidden');
}
