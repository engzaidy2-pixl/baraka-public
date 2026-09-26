/**
 * membership.js — منطق وحدة شؤون العضوية
 * الإصدار: 1.0
 * 
 * يعتمد على:
 * - ../../supabase.js (client)
 * - ../../modules.js (B_STORE, loadSettings, ROLE_LABELS)
 * - ../../ui.js (toast, toggleSidebar, icon)
 * - ../../auth.js (currentUser, logout)
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════
     الحالة العامة
     ═══════════════════════════════════════════════ */
  const STATE = {
    user: null,
    settings: null,
    activeTab: 'dashboard',
    dashboardLoading: false,
    dashboardLoadedAt: 0,
  };

  /* ═══════════════════════════════════════════════
     خريطة التبويبات (للعناوين)
     ═══════════════════════════════════════════════ */
  const TAB_TITLES = {
    'dashboard':           'نظرة عامة',
    'members':             'الأعضاء',
    'employers':           'جهات العمل',
    'deduction-entities':  'جهات الخصم',
    'subscriptions':       'الاشتراكات',
    'deductions':          'دفعات الخصم',
    'reports':             'التقارير',
  };

  /** مدة صلاحية بيانات لوحة التحكم قبل إعادة الجلب (60 ثانية) */
  const DASHBOARD_TTL = 60 * 1000;

  /* ═══════════════════════════════════════════════
     تهيئة الوحدة
     ═══════════════════════════════════════════════ */
  async function init() {
    try {
      /* 1. التحقق من الجلسة */
      STATE.user = currentUser();
      if (!STATE.user) {
        window.location.replace('../../index.html');
        return;
      }

      /* 2. تحميل الإعدادات */
      if (typeof fetchSettings === 'function') {
        try { await fetchSettings(); } catch (e) { /* تجاهل */ }
      }
      STATE.settings = loadSettings();

      /* 3. بناء الواجهة */
      populateBrand();
      populateUser();
      populateDates();
      bindTabs();
      bindQuickActions();
      bindLogout();

      /* لوحة التحكم هي الافتراضية — مع احترام رابط تبويب مباشر (#members مثلًا) */
      const initialKey = window.location.hash.replace('#', '');
      showTab(TAB_TITLES[initialKey] ? initialKey : 'dashboard');

      /* 4. إخفاء شاشة التحميل */
      if (typeof window.hideAppLoading === 'function') {
        window.hideAppLoading();
      } else {
        const loader = document.getElementById('app-loading');
        if (loader) loader.style.display = 'none';
      }

      console.info('[Baraka Membership] Initialized');
    } catch (e) {
      console.error('[Baraka Membership] Init error:', e);
      if (typeof toast === 'function') toast('حدث خطأ أثناء التهيئة', 'error');
    }
  }

  /* ═══════════════════════════════════════════════
     تعبئة الهوية (اسم الجمعية + الشعار)
     ═══════════════════════════════════════════════ */
  function populateBrand() {
    const s = STATE.settings || { association_name: 'جمعية البركة الأهلية' };
    const names = ['sidebar-assoc-name', 'assoc-name-top'];
    names.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = s.association_name;
    });

    /* الشعار إذا وُجد */
    if (s.logo_url) {
      const brand = document.getElementById('sidebar-brand');
      if (brand) {
        brand.outerHTML = `<img id="sidebar-brand" src="${s.logo_url}" alt="شعار" class="h-11 w-11 rounded-xl object-cover border border-black/10">`;
      }
    }
  }

  /* ═══════════════════════════════════════════════
     تعبئة بيانات المستخدم
     ═══════════════════════════════════════════════ */
  function populateUser() {
    const u = STATE.user;
    if (!u) return;

    const nameEls = ['sidebar-user-name', 'user-name'];
    nameEls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = u.full_name || '—';
    });

    /* بانر الترحيب في لوحة التحكم — الاسم الأول لمسة ألطف */
    const dashNameEl = document.getElementById('dashboard-username');
    if (dashNameEl) {
      dashNameEl.textContent = (u.full_name || '').trim().split(/\s+/)[0] || '—';
    }

    const roleLabel = (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[u.role])
      ? ROLE_LABELS[u.role]
      : u.role;

    const roleEls = ['sidebar-user-role', 'user-role'];
    roleEls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = roleLabel;
    });

    const initial = (u.full_name || '?').trim().charAt(0);
    const avatarEls = ['user-avatar', 'topbar-avatar'];
    avatarEls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = initial;
    });
  }

  /* ═══════════════════════════════════════════════
     تعبئة التواريخ (هجري + ميلادي)
     ═══════════════════════════════════════════════ */
  function populateDates() {
    try {
      const now = new Date();
      const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }).format(now);
      const greg = new Intl.DateTimeFormat('ar-EG', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }).format(now);

      const hEl = document.getElementById('date-hijri');
      const gEl = document.getElementById('date-gregorian');
      if (hEl) hEl.textContent = hijri;
      if (gEl) gEl.textContent = greg;
    } catch (e) {
      console.warn('[Baraka Membership] Date error:', e);
    }
  }

  /* ═══════════════════════════════════════════════
     ربط التبويبات (Tabs)
     ═══════════════════════════════════════════════ */
  function bindTabs() {
    const buttons = document.querySelectorAll('[data-tab]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabKey = btn.dataset.tab;
        if (tabKey) showTab(tabKey);
      });
    });
  }

  /* ═══════════════════════════════════════════════
     عرض تبويب معين
     ═══════════════════════════════════════════════ */
  function showTab(key) {
    STATE.activeTab = key;

    /* 1. تحديث العنوان */
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = TAB_TITLES[key] || 'شؤون العضوية';

    /* 2. تفعيل الزر */
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === key);
    });

    /* 3. إظهار اللوحة */
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `tab-${key}`);
    });

    /* 4. إغلاق القائمة على الهاتف */
    if (window.innerWidth < 1024 && typeof toggleSidebar === 'function') {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('translate-x-0')) {
        toggleSidebar();
      }
    }

    /* 5. تحديث URL hash (للرجوع) */
    try { history.replaceState(null, '', `#${key}`); } catch (e) { /* تجاهل */ }

    /* 6. تحميل بيانات لوحة التحكم عند عرضها */
    if (key === 'dashboard') {
      const stale = !STATE.dashboardLoadedAt || (Date.now() - STATE.dashboardLoadedAt) > DASHBOARD_TTL;
      if (stale && !STATE.dashboardLoading) {
        loadDashboardData().catch((e) => console.error('[Baraka Membership] Dashboard load error:', e));
      }
    }

    /* 7. تحميل بيانات الأعضاء */
    if (key === 'members') {
      loadMembers().catch((e) => console.error('[Baraka Membership] Members load error:', e));
    }
    
    /* 7.1 تحميل الاشتراكات */
    if (key === 'subscriptions') {
      loadSubscriptions().catch((e) => console.error('[Baraka Membership] Subscriptions load error:', e));
    }

    /* 8. تحميل جهات العمل وجهات الخصم */
    if (key === 'employers') {
      loadEmployers().catch((e) => console.error('[Baraka Membership] Employers load error:', e));
    }
    if (key === 'deduction-entities') {
      loadDeductionEntities().catch((e) => console.error('[Baraka Membership] Deduction entities load error:', e));
    }

    /* 9. تحميل دفعات الخصم */
    if (key === 'deductions') {
      loadBatches().catch((e) => console.error('[Baraka Membership] Batches load error:', e));
    }
  }

  /* ═══════════════════════════════════════════════
     ربط الإجراءات السريعة في لوحة التحكم
     ═══════════════════════════════════════════════ */
  function bindQuickActions() {
    const QUICK_ACTIONS = {
      'add-member':        { tab: 'members',       msg: 'انتقلت إلى الأعضاء — نموذج الإضافة قيد الإنشاء' },
      'view-members':      { tab: 'members',       msg: null },
      'add-subscription':  { tab: 'subscriptions', msg: 'انتقلت إلى الاشتراكات — التسجيل قيد الإنشاء' },
      'new-batch':         { tab: 'deductions',    msg: 'انتقلت إلى دفعات الخصم — التوليد قيد الإنشاء' },
      'view-reports':      { tab: 'reports',       msg: null },
    };

    document.querySelectorAll('#tab-dashboard [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = QUICK_ACTIONS[btn.dataset.action];
        if (!action) return;
        if (action.tab) showTab(action.tab);
        if (action.msg && typeof toast === 'function') toast(action.msg, 'info');
      });
    });
  }

// ⬇⬇⬇ يتبع في الدفعة 2 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 1 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     لوحة التحكم — تحميل البيانات من Supabase
     ═══════════════════════════════════════════════ */
  async function loadDashboardData() {
    const sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;

    if (!sb) {
      renderDashboardError('وضع العرض التجريبي — لا يوجد اتصال بقاعدة البيانات.');
      return;
    }

    STATE.dashboardLoading = true;
    renderDashboardAlerts(null);  /* حالة التحميل */
    renderDashboardRecent(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      /* جلب متوازٍ — كل استعلام مستقل ولا يُسقط الباقي عند فشله */
      const results = await Promise.allSettled([
        sb.from('members').select('id', { count: 'exact', head: true }),
        sb.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('subscriptions').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'partial'])
          .eq('period_year', year).eq('period_month', month),
        sb.from('subscriptions').select('paid_amount')
          .in('status', ['paid', 'partial'])
          .eq('period_year', year).eq('period_month', month),
        sb.from('members').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
        sb.from('deduction_batches').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
        sb.from('members').select('full_name, member_number, created_at')
          .order('created_at', { ascending: false }).limit(5),
        sb.from('deduction_batches').select('batch_number, total_amount, created_at')
          .order('created_at', { ascending: false }).limit(5),
      ]);

      const val = (i, fallback = null) => (
        results[i].status === 'fulfilled' && !results[i].value.error
          ? results[i].value
          : fallback
      );

      /* ─ الإحصائيات ─ */
      const totalMembers  = val(0)?.count ?? 0;
      const activeMembers = val(1)?.count ?? 0;
      const pendingSubs   = val(2)?.count ?? 0;
      const collectedRows = val(3)?.data ?? [];
      const collected     = collectedRows.reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0);

      setText('stat-total-members',   fmtNum(totalMembers));
      setText('stat-active-members',  fmtNum(activeMembers));
      setText('stat-pending-subs',    fmtNum(pendingSubs));
      setText('stat-collected-month', fmtMoney(collected));

      /* ─ التنبيهات ─ */
      const suspended    = val(4)?.count ?? 0;
      const draftBatches = val(5)?.count ?? 0;
      const alerts = [];
      if (pendingSubs > 0) {
        alerts.push({ icon: '⏳', kind: 'warning', text: `${fmtNum(pendingSubs)} اشتراكًا مستحقًا للشهر الحالي لم يُسدَّد بعد.` });
      }
      if (suspended > 0) {
        alerts.push({ icon: '⚠️', kind: 'danger', text: `يوجد ${fmtNum(suspended)} من الأعضاء موقوفون وبحاجة إلى مراجعة ملفاتهم.` });
      }
      if (draftBatches > 0) {
        alerts.push({ icon: '📋', kind: 'info', text: `${fmtNum(draftBatches)} من دفعات الخصم قيد الإعداد بانتظار الإرسال لجهات الخصم.` });
      }
      if (totalMembers === 0) {
        alerts.push({ icon: '🚀', kind: 'info', text: 'لا يوجد أعضاء بعد — ابدأ بإضافة أول عضو أو استيراد القائمة من Excel.' });
      }
      renderDashboardAlerts(alerts);

      /* ─ آخر الأنشطة ─ */
      const activities = [];
      (val(6)?.data ?? []).forEach((m) => {
        activities.push({
          icon: '👤',
          title: `عضو جديد: ${m.full_name || 'بدون اسم'}`,
          meta: m.member_number ? `رقم العضوية: ${m.member_number}` : 'عضوية جديدة',
          time: m.created_at,
        });
      });
      (val(7)?.data ?? []).forEach((b) => {
        activities.push({
          icon: '📦',
          title: `دفعة خصم ${b.batch_number || ''}`.trim(),
          meta: `الإجمالي: ${fmtMoney(b.total_amount)}`,
          time: b.created_at,
        });
      });
      activities.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
      activities.slice(0, 6).forEach((a) => { a.timeLabel = relTimeAr(a.time); });
      renderDashboardRecent(activities.slice(0, 6));

      STATE.dashboardLoadedAt = Date.now();
    } catch (e) {
      console.error('[Baraka Membership] Dashboard error:', e);
      renderDashboardError('تعذَّر تحميل بيانات اللوحة — تحقَّق من الاتصال ثم أعد المحاولة.');
    } finally {
      STATE.dashboardLoading = false;
    }
  }

  /* ═══════════════════════════════════════════════
     لوحة التحكم — عرض التنبيهات (null = جارٍ التحميل)
     ═══════════════════════════════════════════════ */
  function renderDashboardAlerts(alerts) {
    const host = document.getElementById('dashboard-alerts');
    if (!host) return;

    if (alerts === null) {
      host.innerHTML = skeletonRows(3).join('');
      return;
    }

    if (!alerts.length) {
      host.innerHTML = `
        <div class="alert-item alert-item-ok">
          <span class="alert-item-icon">🎉</span>
          <span>لا توجد تنبيهات حاليًا — كل شيء على ما يرام.</span>
        </div>`;
      return;
    }

    host.innerHTML = alerts.map((a) => `
      <div class="alert-item alert-item-${esc(a.kind)}">
        <span class="alert-item-icon">${esc(a.icon)}</span>
        <span>${esc(a.text)}</span>
      </div>`).join('');
  }

  /* ═══════════════════════════════════════════════
     لوحة التحكم — عرض آخر الأنشطة (null = جارٍ التحميل)
     ═══════════════════════════════════════════════ */
  function renderDashboardRecent(items) {
    const host = document.getElementById('dashboard-recent');
    if (!host) return;

    if (items === null) {
      host.innerHTML = skeletonRows(4).join('');
      return;
    }

    if (!items.length) {
      host.innerHTML = `<div class="dashboard-empty">📭 لا توجد أنشطة مسجَّلة بعد — تظهر هنا أحدث العمليات فور حدوثها.</div>`;
      return;
    }

    host.innerHTML = items.map((it) => `
      <div class="activity-item">
        <span class="activity-icon">${esc(it.icon)}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-extrabold text-navy-900">${esc(it.title)}</p>
          <p class="text-[11px] font-bold text-navy-400">${esc(it.meta)}</p>
        </div>
        <time class="activity-time">${esc(it.timeLabel || '')}</time>
      </div>`).join('');
  }

  /* ═══════════════════════════════════════════════
     لوحة التحكم — حالة الخطأ
     ═══════════════════════════════════════════════ */
  function renderDashboardError(message) {
    renderDashboardAlerts([{ icon: '⚠️', kind: 'danger', text: message }]);
    renderDashboardRecent([]);
    STATE.dashboardLoadedAt = Date.now();
  }

  /* ═══════════════════════════════════════════════
     لوحة التحكم — أدوات مساعدة
     ═══════════════════════════════════════════════ */
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /** تهريب HTML لمنع XSS */
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** تنسيق الأرقام بالعربية */
  function fmtNum(n) {
    return new Intl.NumberFormat('ar-SA').format(Number(n) || 0);
  }

  /** تنسيق المبالغ بالعملة المختارة من الإعدادات */
  function getCurrentCurrencyCode() {
    try {
      const s = (typeof STATE !== 'undefined' && STATE.settings) ? STATE.settings : (typeof loadSettings === 'function' ? loadSettings() : null);
      const code = s ? s.currency : 'EGP';
      if (typeof normalizeCurrencyCode === 'function') return normalizeCurrencyCode(code);
      return code || 'EGP';
    } catch (e) {
      return 'EGP';
    }
  }

  function getCurrentCurrency() {
    try {
      const code = getCurrentCurrencyCode();
      if (typeof getCurrency === 'function') return getCurrency(code);
      if (typeof CURRENCIES !== 'undefined') return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
      return { code: 'EGP', symbol: 'ج.م', name_ar: 'جنيه مصري', decimals: 2, flag: '🇪🇬' };
    } catch (e) {
      return { code: 'EGP', symbol: 'ج.م', name_ar: 'جنيه مصري', decimals: 2, flag: '🇪🇬' };
    }
  }

  function fmtMoney(n) {
    const cur = getCurrentCurrency();
    const formatted = new Intl.NumberFormat('ar-EG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: cur.decimals || 2,
    }).format(Number(n) || 0);
    return `${formatted} ${cur.symbol}`;
  }

  function fmtMoneyWithCode(n, code) {
    try {
      if (typeof formatMoneyWithCurrency === 'function') {
        return formatMoneyWithCurrency(n, code || getCurrentCurrencyCode());
      }
    } catch (e) {}
    return fmtMoney(n);
  }

  /** الزمن النسبي بالعربية */
  function relTimeAr(isoDate) {
    if (!isoDate) return '';
    const then = new Date(isoDate);
    if (Number.isNaN(then.getTime())) return '';
    const diffSec = Math.max(0, (Date.now() - then.getTime()) / 1000);
    if (diffSec < 60) return 'الآن';
    const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
    if (diffSec < 3600)  return rtf.format(-Math.round(diffSec / 60), 'minute');
    if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour');
    return rtf.format(-Math.round(diffSec / 86400), 'day');
  }

  /** صفوف هيكلية متحركة */
  function skeletonRows(count) {
    const widths = ['92%', '78%', '64%', '85%'];
    return Array.from({ length: count }, (_, i) =>
      `<div class="dashboard-skeleton" style="width: ${widths[i % widths.length]}"></div>`
    );
  }

  /* ═══════════════════════════════════════════════
     ربط زر تسجيل الخروج
     ═══════════════════════════════════════════════ */
  function bindLogout() {
    document.querySelectorAll('[data-logout], button[onclick="logout()"]').forEach((btn) => {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', async () => {
        if (typeof logoutAsync === 'function') {
          await logoutAsync();
        } else if (typeof logout === 'function') {
          logout();
        } else {
          window.location.href = '../../index.html';
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════
     الاستماع لتغيّر الـ hash
     ═══════════════════════════════════════════════ */
  window.addEventListener('hashchange', () => {
    const key = window.location.hash.replace('#', '');
    if (key && TAB_TITLES[key] && key !== STATE.activeTab) {
      showTab(key);
    }
  });

// ⬇⬇⬇ يتبع في الدفعة 3 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 2 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     تبويب الأعضاء — الحالة
     ═══════════════════════════════════════════════ */
  STATE.members = {
    list: [],
    page: 1,
    perPage: 20,
    total: 0,
    filters: { q: '', membership_type_id: '', status: '', employer_id: '', service_status: '' },
    loading: false,
    optionsLoaded: false,
    types: [],
    employers: [],
    /* الحزمة ب: ذاكرة جهات الخصم للـ Cascading */
    deductionEntities: [],
    requestId: 0,
    searchTimer: null,
  };

  const MEMBERS_SELECT = [
    'id', 'member_number', 'full_name', 'phone', 'national_id', 'employee_number',
    'status', 'service_status', 'collection_method',
    'membership_date', 'membership_type_id', 'employer_id', 'deduction_entity_id',
    'membership_types:membership_type_id ( id, name )',
    'employers:employer_id ( id, name, scope )',
    /* is_self مطلوب لعرض «تلقائي» في الجدول والتصدير (شرط القبول 5) */
    'deduction_entities:deduction_entity_id ( id, name, is_self )',
  ].join(', ');

  const MEMBER_STATUS = {
    active:    { label: 'نشط',   cls: 'member-badge-active' },
    suspended: { label: 'موقوف', cls: 'member-badge-suspended' },
    hidden:    { label: 'مخفي',  cls: 'member-badge-hidden' },
  };

  const MEMBER_SERVICE_STATUS = {
    active:   'على رأس العمل',
    retired:  'متقاعد',
    external: 'خارج نطاق جهات العمل',
    other:    'أخرى',
  };

  const MEMBER_COLLECTION_METHOD = {
    salary_deduction: 'خصم راتب',
    cash:             'نقدي',
    bank_transfer:    'تحويل بنكي',
  };

  const EMPLOYER_SCOPE = {
    internal: 'داخلية',
    external: 'خارجية',
  };

  const SERVICE_TO_SCOPE = {
    active:   'internal',
    external: 'external',
    retired:  null,
    other:    null,
  };

  const MEMBER_FILTER_LABELS = {
    q:                   'بحث',
    membership_type_id:  'نوع العضوية',
    status:              'الحالة',
    employer_id:         'جهة العمل',
    service_status:      'الحالة بالخدمة',
  };

  let MEMBER_EDIT = { id: null, readOnly: false };

  /* ─ أدوات مساعدة ─ */
  function membersSb() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  }

  function joinName(value) {
    if (!value) return '';
    if (Array.isArray(value)) return value[0]?.name || '';
    return value.name || '';
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = (value === null || value === undefined) ? '' : value;
  }

  function memberStatusOf(status) {
    return MEMBER_STATUS[status] || { label: status || '—', cls: 'member-badge-hidden' };
  }

  function sanitizeSearch(value) {
    return String(value || '')
      .replace(/[,()%*.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  function hasMemberFilters() {
    const f = STATE.members.filters;
    return Boolean(f.q || f.membership_type_id || f.status || f.employer_id || f.service_status);
  }

  /* ═══════════════════════════════════════════════
     loadMembers()
     ═══════════════════════════════════════════════ */
  async function loadMembers() {
    const sb = membersSb();
    const m = STATE.members;

    if (!sb) {
      m.loading = false;
      m.list = [];
      m.total = 0;
      renderMembersTable();
      renderMembersMeta();
      renderMembersPagination();
      showMembersEmpty('لا يوجد اتصال بقاعدة البيانات — تعذَّر تحميل الأعضاء.');
      return;
    }

    if (!m.optionsLoaded) {
      await loadMembersOptions();
      renderMembersActiveFilters();
    }

    const requestId = ++m.requestId;
    m.loading = true;
    renderMembersTable();
    renderMembersMeta();
    renderMembersPagination();

    try {
      const { list, total } = await fetchMembersPage();
      if (requestId !== m.requestId) return;

      m.loading = false;
      m.list = list;
      m.total = total;

      const pages = Math.max(1, Math.ceil(total / m.perPage));
      if (m.page > pages) {
        m.page = pages;
        return loadMembers();
      }

      renderMembersTable();
      renderMembersMeta();
      renderMembersPagination();
      renderMembersActiveFilters();
    } catch (e) {
      if (requestId !== m.requestId) return;
      console.error('[Baraka Membership] loadMembers error:', e);
      m.loading = false;
      m.list = [];
      m.total = 0;
      renderMembersTable();
      renderMembersMeta();
      renderMembersPagination();
      showMembersEmpty('تعذَّر تحميل الأعضاء — تحقَّق من الاتصال ثم أعد المحاولة.');
      if (typeof toast === 'function') toast('تعذَّر تحميل قائمة الأعضاء', 'error');
    }
  }

  async function fetchMembersPage(opts) {
    const options = opts || {};
    const m = STATE.members;
    const sb = membersSb();
    const limit = options.all ? 10000 : m.perPage;
    const from = options.all ? 0 : (m.page - 1) * m.perPage;

    let query = sb
      .from('members')
      .select(MEMBERS_SELECT, { count: 'exact' })
      .order('id', { ascending: false })
      .range(from, from + limit - 1);

    query = applyMemberFilters(query);

    const { data, error, count } = await query;
    if (error) throw error;

    return { list: data || [], total: typeof count === 'number' ? count : (data ? data.length : 0) };
  }

  function applyMemberFilters(query) {
    const f = STATE.members.filters;

    if (f.membership_type_id) query = query.eq('membership_type_id', f.membership_type_id);
    if (f.status)             query = query.eq('status', f.status);
    if (f.employer_id)        query = query.eq('employer_id', f.employer_id);
    if (f.service_status)     query = query.eq('service_status', f.service_status);

    const term = sanitizeSearch(f.q);
    if (term) {
      query = query.or([
        'full_name.ilike.%' + term + '%',
        'phone.ilike.%' + term + '%',
        'national_id.ilike.%' + term + '%',
        'employee_number.ilike.%' + term + '%',
        'member_number.ilike.%' + term + '%',
      ].join(','));
    }

    return query;
  }

  /* ═══════════════════════════════════════════════
     renderMembersTable()
     ═══════════════════════════════════════════════ */
  function renderMembersTable() {
    const tbody = document.getElementById('members-tbody');
    if (!tbody) return;

    const wrap  = document.getElementById('members-table-wrapper');
    const empty = document.getElementById('members-empty');
    const m = STATE.members;

    if (m.loading) {
      if (empty) empty.hidden = true;
      if (wrap)  wrap.hidden = false;
      const widths = [70, 90, 60, 55, 70, 65, 50, 60];
      tbody.innerHTML = Array.from({ length: 6 }, () =>
        '<tr>' + widths
          .map((w) => '<td><div class="members-skeleton" style="width:' + w + '%"></div></td>')
          .join('') + '</tr>'
      ).join('');
      return;
    }

    if (!m.list.length) {
      tbody.innerHTML = '';
      if (wrap) wrap.hidden = true;
      showMembersEmpty(hasMemberFilters()
        ? 'لا توجد نتائج مطابقة للبحث أو الفلاتر الحالية — جرّب تعديلها أو مسحها.'
        : 'لم يُسجَّل أي عضو بعد — ابدأ بإضافة عضو جديد أو استيراد القائمة من ملف Excel.');
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap)  wrap.hidden = false;
    tbody.innerHTML = m.list.map(memberRowHtml).join('');
  }

  function memberRowHtml(mem) {
    const status   = memberStatusOf(mem.status);
    const type     = joinName(mem.membership_types);
    const employer = joinName(mem.employers);
    const deduction = mem.deduction_entities || null;
    const id       = Number(mem.id);

    const sub = [
      mem.employee_number ? 'رقم وظيفي: ' + mem.employee_number : '',
      mem.national_id     ? 'هوية: ' + mem.national_id : '',
    ].filter(Boolean).join('  •  ');

    return ''
      + '<tr data-member-row="' + id + '">'
      +   '<td data-label="رقم العضوية"><span class="member-number">' + esc(mem.member_number || '—') + '</span></td>'
      +   '<td data-label="الاسم">'
      +     '<span class="member-name">' + esc(mem.full_name || '—') + '</span>'
      +     (sub ? '<span class="member-sub">' + esc(sub) + '</span>' : '')
      +   '</td>'
      +   '<td data-label="الجوال" class="member-phone">'
      +     (mem.phone ? esc(mem.phone) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="نوع العضوية">'
      +     (type ? '<span class="member-type">' + esc(type) + '</span>' : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="جهة العمل">'
      +     (employer ? esc(employer) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="جهة الخصم">'
      +     (deduction
              ? (deduction.is_self
                  ? '<span class="member-badge-service">تلقائي</span>'
                  : esc(deduction.name || '—'))
              : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="الحالة">'
      +     '<span class="member-badge ' + status.cls + '">' + esc(status.label) + '</span>'
      +     (mem.service_status
              ? '<span class="member-badge-service">' + esc(MEMBER_SERVICE_STATUS[mem.service_status] || mem.service_status) + '</span>'
              : '')
      +     (mem.collection_method && mem.collection_method !== 'cash'
              ? '<span class="member-badge-service">' + esc(MEMBER_COLLECTION_METHOD[mem.collection_method] || mem.collection_method) + '</span>'
              : '')
      +   '</td>'
      +   '<td data-label="إجراءات">'
      +     '<div class="member-actions">'
      +       '<button type="button" class="member-action" data-member-action="view"   data-member-id="' + id + '" title="عرض">👁</button>'
      +       '<button type="button" class="member-action" data-sub-action="pay"      data-sub-id="' + id + '" title="تسجيل دفعة">💵</button>'
      +       '<button type="button" class="member-action" data-member-action="edit"   data-member-id="' + id + '" title="تعديل">✏️</button>'
      +       '<button type="button" class="member-action" data-member-action="delete" data-member-id="' + id + '" title="حذف">🗑</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  }

  function showMembersEmpty(message) {
    const empty = document.getElementById('members-empty');
    const text  = document.getElementById('members-empty-text');
    if (text && message) text.textContent = message;
    if (empty) empty.hidden = false;
  }

  /* ═══════════════════════════════════════════════
     renderMembersPagination()
     ═══════════════════════════════════════════════ */
  function renderMembersPagination() {
    const host = document.getElementById('members-pagination');
    if (!host) return;

    const m = STATE.members;
    if (m.loading || !m.total) { host.innerHTML = ''; return; }

    const pages = Math.max(1, Math.ceil(m.total / m.perPage));
    const cur   = Math.min(m.page, pages);
    const from  = (cur - 1) * m.perPage + 1;
    const to    = Math.min(cur * m.perPage, m.total);

    const parts = [];
    parts.push('<span class="pagination-info">' + esc(fmtNum(from) + '–' + fmtNum(to) + ' من ' + fmtNum(m.total)) + '</span>');
    parts.push(pageBtn('‹', cur - 1, { disabled: cur <= 1, title: 'الصفحة السابقة' }));

    membersPageWindow(cur, pages).forEach((n) => {
      if (n === '…') parts.push('<span class="pagination-gap">…</span>');
      else parts.push(pageBtn(fmtNum(n), n, { active: n === cur, title: 'صفحة ' + n }));
    });

    parts.push(pageBtn('›', cur + 1, { disabled: cur >= pages, title: 'الصفحة التالية' }));
    host.innerHTML = parts.join('');
  }

  function pageBtn(label, page, opts) {
    const o = opts || {};
    const cls = 'pagination-btn' + (o.active ? ' active' : '');
    return '<button type="button" class="' + cls + '" data-page="' + page + '"'
      + (o.disabled ? ' disabled' : '')
      + ' title="' + esc(o.title || '') + '" aria-label="' + esc(o.title || label) + '">'
      + label + '</button>';
  }

  function membersPageWindow(cur, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

    const out = [1];
    let start = Math.max(2, cur - 1);
    let end   = Math.min(pages - 1, cur + 1);

    if (cur <= 3)          { start = 2;         end = 4; }
    if (cur >= pages - 2)  { start = pages - 3; end = pages - 1; }

    if (start > 2)        out.push('…');
    for (let i = start; i <= end; i++) out.push(i);
    if (end < pages - 1)  out.push('…');

    out.push(pages);
    return out;
  }

  function goToMembersPage(page) {
    const m = STATE.members;
    const pages = Math.max(1, Math.ceil(m.total / m.perPage));
    const next = Math.min(Math.max(1, Number(page) || 1), pages);
    if (next === m.page) return;
    m.page = next;
    loadMembers();
    const wrap = document.getElementById('members-table-wrapper');
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onMembersPaginationClick(e) {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    goToMembersPage(btn.dataset.page);
  }

  /* ═══════════════════════════════════════════════
     renderMembersMeta() + الفلاتر النشطة
     ═══════════════════════════════════════════════ */
  function renderMembersMeta() {
    const el = document.getElementById('members-count');
    if (!el) return;

    const m = STATE.members;
    if (m.loading) { el.textContent = 'جارٍ تحميل الأعضاء…'; return; }
    if (!m.total)  { el.textContent = hasMemberFilters() ? 'لا توجد نتائج مطابقة' : 'لا يوجد أعضاء'; return; }

    const pages = Math.max(1, Math.ceil(m.total / m.perPage));
    const from  = (m.page - 1) * m.perPage + 1;
    const to    = Math.min(m.page * m.perPage, m.total);

    el.innerHTML = 'عرض <b>' + esc(fmtNum(from) + '–' + fmtNum(to)) + '</b> من <b>' + esc(fmtNum(m.total))
      + '</b> عضوًا · صفحة ' + esc(fmtNum(m.page)) + ' من ' + esc(fmtNum(pages));
  }

  function renderMembersActiveFilters() {
    const host = document.getElementById('members-active-filters');
    if (!host) return;

    const f = STATE.members.filters;
    const chips = [];

    Object.keys(f).forEach((key) => {
      const value = f[key];
      if (!value) return;
      let label = value;

      if (key === 'membership_type_id') {
        label = (STATE.members.types.find((t) => String(t.id) === String(value)) || {}).name || value;
      } else if (key === 'employer_id') {
        label = (STATE.members.employers.find((x) => String(x.id) === String(value)) || {}).name || value;
      } else if (key === 'status') {
        label = memberStatusOf(value).label;
      } else if (key === 'service_status') {
        label = MEMBER_SERVICE_STATUS[value] || value;
      }

      chips.push('<span class="members-chip">' + esc(MEMBER_FILTER_LABELS[key] || key) + ': ' + esc(label) + '</span>');
    });

    host.innerHTML = chips.join('');
  }

// ⬇⬇⬇ يتبع في الدفعة 4 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 3 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     bindMembersFilters()
     ═══════════════════════════════════════════════ */
  function bindMembersFilters() {
    const section = document.getElementById('tab-members');
    if (!section) return;

    const search = document.getElementById('members-search');
    const clear  = document.getElementById('members-search-clear');

    if (search) {
      search.addEventListener('input', () => {
        if (clear) clear.hidden = !search.value;
        searchMembers(search.value);
      });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchMembers(search.value, true);
        }
        if (e.key === 'Escape') {
          search.value = '';
          if (clear) clear.hidden = true;
          searchMembers('', true);
        }
      });
    }

    if (clear) {
      clear.addEventListener('click', () => {
        if (search) { search.value = ''; search.focus(); }
        clear.hidden = true;
        searchMembers('', true);
      });
    }

    section.querySelectorAll('[data-member-filter]').forEach((el) => {
      el.addEventListener('change', () => setMemberFilter(el.dataset.memberFilter, el.value));
    });

    const resetBtn = document.getElementById('btn-reset-member-filters');
    if (resetBtn) resetBtn.addEventListener('click', resetMembersFilters);

    const addBtn = document.getElementById('btn-add-member');
    if (addBtn) addBtn.addEventListener('click', () => openMemberModal(null));

    const importBtn = document.getElementById('btn-import-members');
    const fileInput = document.getElementById('members-import-file');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) importMembersExcel(file);
        fileInput.value = '';
      });
    }

    const exportBtn = document.getElementById('btn-export-members');
    if (exportBtn) exportBtn.addEventListener('click', exportMembersExcel);

    const tbody = document.getElementById('members-tbody');
    if (tbody) tbody.addEventListener('click', onMembersTableClick);

    const pager = document.getElementById('members-pagination');
    if (pager) pager.addEventListener('click', onMembersPaginationClick);

    const modal = document.getElementById('member-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        // إلغاء الإغلاق عند backdrop - فقط X أو إلغاء
        if (e.target.closest('[data-close-member-modal]')) closeMemberModal();
      });
    }
    const saveBtn = document.getElementById('btn-save-member');
    if (saveBtn) saveBtn.addEventListener('click', saveMemberForm);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeMemberModal();
    });

    section.addEventListener('click', (e) => {
      if (e.target.closest('[data-member-action="add"]')) openMemberModal(null);
    });

    bindMemberStatusListener();
    bindMemberEmployerCascade(); /* الحزمة ب: cascading جهة الخصم */
    bindQuickEmployerModal();
    bindQuickEmployerTrigger();
  }

  /* ═══════════════════════════════════════════════
     searchMembers() — بحث فوري
     ═══════════════════════════════════════════════ */
  function searchMembers(value, immediate) {
    const term = String(value || '').trim();

    const run = () => {
      STATE.members.filters.q = term;
      STATE.members.page = 1;
      loadMembers();
    };

    clearTimeout(STATE.members.searchTimer);
    if (immediate === true) run();
    else STATE.members.searchTimer = setTimeout(run, 300);
  }

  function setMemberFilter(key, value) {
    STATE.members.filters[key] = (value === null || value === undefined) ? '' : String(value);
    STATE.members.page = 1;
    loadMembers();
  }

  function resetMembersFilters() {
    const m = STATE.members;
    m.filters = { q: '', membership_type_id: '', status: '', employer_id: '', service_status: '' };
    m.page = 1;

    const search = document.getElementById('members-search');
    if (search) search.value = '';
    const clear = document.getElementById('members-search-clear');
    if (clear) clear.hidden = true;

    document.querySelectorAll('#tab-members [data-member-filter]').forEach((el) => { el.value = ''; });

    renderMembersActiveFilters();
    loadMembers();
  }

  /* ═══════════════════════════════════════════════
     loadMembersOptions()
     ═══════════════════════════════════════════════ */
  async function loadMembersOptions() {
    const sb = membersSb();
    if (!sb) return;

    try {
      const [typesRes, employersRes, entitiesRes] = await Promise.all([
        sb.from('membership_types').select('id, name').eq('status', 'active').order('sort_order', { ascending: true }),
        sb.from('employers').select('id, name, scope, has_deduction_entities').eq('status', 'active').order('name', { ascending: true }),
        /* الحزمة ب: جهات الخصم للـ Cascading */
        sb.from('deduction_entities').select('id, name, employer_id, is_self, status').order('name', { ascending: true }),
      ]);

      if (!typesRes.error) STATE.members.types = typesRes.data || [];
      /* R13: الحاوية «جهات حكومية» لا تظهر في قوائم جهة عمل الأعضاء */
      if (!employersRes.error) {
        STATE.members.employers = (employersRes.data || []).filter((e) => !isContainerEmployer(e));
      }
      if (!entitiesRes.error) STATE.members.deductionEntities = entitiesRes.data || [];
      STATE.members.optionsLoaded = true;

      fillMembersSelect('filter-membership-type', STATE.members.types, 'كل الأنواع');
      fillMembersSelect('filter-employer',        STATE.members.employers, 'كل الجهات');
    } catch (e) {
      console.warn('[Baraka Membership] loadMembersOptions error:', e);
    }
  }

  /* R13: الحاوية تُعرف بنفس منطق ensure_container_employer() في قاعدة البيانات */
  const CONTAINER_EMPLOYER_NAME = 'جهات حكومية';
  function isContainerEmployer(e) {
    return !!e && e.name === CONTAINER_EMPLOYER_NAME;
  }

  /** الحزمة ب: إلغاء ذاكرة جهات الخصم المؤقتة — مماثلة لـ invalidateMembersOptions */
  function invalidateDeductionEntitiesOptions() {
    if (STATE.members) {
      STATE.members.deductionEntities = [];
      STATE.members.optionsLoaded = false;
    }
    /* الحزمة ج: إلغاء كاش قائمة جهات الخصم في نافذة الدفعات أيضًا —
       حتى تنعكس إضافة/حذف الجهات فورًا في batch-entity select */
    if (STATE.deductionBatches) {
      STATE.deductionBatches.entitiesOptions = [];
      STATE.deductionBatches.entitiesOptionsLoaded = false;
    }
  }

  function fillMembersSelect(id, items, emptyLabel) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">' + esc(emptyLabel || 'الكل') + '</option>'
      + (items || []).map((it) => '<option value="' + esc(it.id) + '">' + esc(it.name) + '</option>').join('');
    if (current) el.value = current;
  }

  /* ═══════════════════════════════════════════════
     النموذج الثلاثي — دوال مساعدة
     ═══════════════════════════════════════════════ */
  function employerScopeForStatus(status) {
    return SERVICE_TO_SCOPE[status] || null;
  }

  function fillMemberEmployerSelect(scope) {
    const el = document.getElementById('member-employer');
    if (!el) return;
    const current = el.value;
    const all = STATE.members.employers || [];
    let filtered = all;
    if (scope) {
      filtered = all.filter((e) => (e.scope || 'internal') === scope);
    }
    el.innerHTML = '<option value="">— بدون —</option>'
      + filtered.map((it) => '<option value="' + esc(it.id) + '">' + esc(it.name) + '</option>').join('');
    if (current) {
      const existsInFiltered = filtered.some((x) => String(x.id) === String(current));
      if (!existsInFiltered) {
        const original = all.find((x) => String(x.id) === String(current));
        if (original) {
          const opt = document.createElement('option');
          opt.value = String(original.id);
          opt.textContent = (original.name || '') + ' (' + (EMPLOYER_SCOPE[original.scope || 'internal'] || original.scope || '—') + ')';
          el.appendChild(opt);
        }
      }
      el.value = current;
    }
  }

  /* ═══════════════════════════════════════════════════
     الحزمة ب — Cascading: قائمة جهة الخصم التابعة لجهة العمل
     employer_id = X AND is_self = false AND status = 'active'
     ═══════════════════════════════════════════════════ */
  function fillMemberDeductionEntitySelect(employerId, presetEntityId) {
    const select   = document.getElementById('member-deduction-entity');
    const hint     = document.getElementById('member-deduction-hint');
    const required = document.getElementById('member-deduction-required');
    if (!select) return;

    const eid = employerId ? Number(employerId) : null;
    const employer = eid
      ? (STATE.members.employers || []).find((e) => Number(e.id) === eid)
      : null;

    /* الفروع التابعة: غير ذاتية ونشطة فقط */
    const branches = eid
      ? (STATE.members.deductionEntities || []).filter((d) =>
          Number(d.employer_id) === eid && !d.is_self && d.status === 'active')
      : [];

    const hasBranches = !!(employer && employer.has_deduction_entities);
    const showSelect  = !!(hasBranches && branches.length);

    /* إعادة ضبط القيمة مع كل تغيير (شرط القبول 4) */
    select.value = '';
    select.classList.toggle('hidden', !showSelect);
    select.hidden = !showSelect;
    select.required = showSelect;
    if (required) required.hidden = !showSelect;

    if (!eid) {
      if (hint) hint.textContent = 'اختر جهة العمل أولاً';
      return;
    }

    if (!showSelect) {
      if (hint) {
        hint.textContent = hasBranches
          ? 'تلقائي من جهة العمل (لا توجد فروع نشطة)'
          : 'تلقائي من جهة العمل';
      }
      return;
    }

    /* لها فروع: القائمة إلزامية والتلميح يختفي */
    if (hint) hint.textContent = '';

    let optionsHtml = '<option value="">-- اختر جهة الخصم --</option>';

    /* عضو محفوظ على الصف الذاتي لجهة عمل لها فروع ← خيار «تلقائي» صريح */
    const preset = presetEntityId
      ? (STATE.members.deductionEntities || []).find((d) => Number(d.id) === Number(presetEntityId))
      : null;
    if (preset && preset.is_self && Number(preset.employer_id) === eid) {
      optionsHtml += '<option value="' + esc(preset.id) + '">تلقائي (صف ذاتي)</option>';
    }

    optionsHtml += branches.map((d) =>
      '<option value="' + esc(d.id) + '">' + esc(d.name || '—') + '</option>'
    ).join('');

    select.innerHTML = optionsHtml;
    if (presetEntityId) {
      select.value = String(presetEntityId);
      if (select.value !== String(presetEntityId)) select.value = '';
    }
  }

  function applyCollectionDefault(status) {
    const collEl = document.getElementById('member-collection-method');
    if (!collEl) return;
    if (MEMBER_EDIT && MEMBER_EDIT.id) return;
    if (status === 'active') {
      collEl.value = 'salary_deduction';
    } else if (status === 'external') {
      collEl.value = 'cash';
    } else {
      collEl.value = 'cash';
    }
  }

  function toggleEmployerField() {
    const statusEl = document.getElementById('member-service-status');
    const field = document.getElementById('member-employer-field');
    const hint = document.getElementById('member-employer-hint');
    const required = document.getElementById('member-employer-required');
    const employerSelect = document.getElementById('member-employer');
    if (!statusEl) return;
    const status = statusEl.value;
    const scope = employerScopeForStatus(status);
    fillMemberEmployerSelect(scope);
    if (!field) return;
    if (status === 'active' || status === 'external') {
      field.style.display = '';
      if (employerSelect) employerSelect.required = true;
      if (required) required.hidden = false;
      if (hint) {
        if (status === 'active') hint.textContent = 'مطلوب اختيار جهة داخلية (معتمدة للخصم)';
        else hint.textContent = 'مطلوب اختيار جهة خارجية (بدون خصم)';
      }
    } else {
      if (required) required.hidden = true;
      if (employerSelect) employerSelect.required = false;
      if (hint) {
        hint.textContent = status === 'retired' ? 'المتقاعدون بلا جهة عمل' : 'اختيار جهة العمل اختياري';
      }
      field.style.display = '';
      if (!scope) {
        fillMemberEmployerSelect(null);
      }
    }
    /* الحزمة ب: Cascading — إعادة ضبط/تعبئة جهة الخصم بعد ملء جهة العمل */
    fillMemberDeductionEntitySelect(employerSelect ? employerSelect.value : '');
    applyCollectionDefault(status);
  }

  function bindMemberStatusListener() {
    const statusEl = document.getElementById('member-service-status');
    if (!statusEl || statusEl.dataset.tripleBound === '1') return;
    statusEl.dataset.tripleBound = '1';
    statusEl.addEventListener('change', () => {
      toggleEmployerField();
    });
  }

  /* الحزمة ب: تغيير جهة العمل ← إعادة ضبط حقل جهة الخصم تلقائيًا */
  function bindMemberEmployerCascade() {
    const el = document.getElementById('member-employer');
    if (!el || el.dataset.deductionCascadeBound === '1') return;
    el.dataset.deductionCascadeBound = '1';
    el.addEventListener('change', () => {
      fillMemberDeductionEntitySelect(el.value);
    });
  }

  function openQuickEmployerModal() {
    const modal = document.getElementById('quick-employer-modal');
    if (!modal) return;
    const statusEl = document.getElementById('member-service-status');
    const currentStatus = statusEl ? statusEl.value : 'active';
    const scope = employerScopeForStatus(currentStatus) || 'internal';
    setVal('quick-employer-name', '');
    setVal('quick-employer-scope', scope);
    setVal('quick-employer-code', '');
    const errEl = document.getElementById('quick-employer-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    modal.classList.remove('hidden');
    const first = document.getElementById('quick-employer-name');
    if (first) first.focus();
  }

  function closeQuickEmployerModal() {
    const modal = document.getElementById('quick-employer-modal');
    if (!modal) return;
    modal.classList.add('hidden');
  }

  async function saveQuickEmployer() {
    const sb = membersSb();
    if (!sb) { if (typeof toast === 'function') toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }
    const nameEl = document.getElementById('quick-employer-name');
    const scopeEl = document.getElementById('quick-employer-scope');
    const codeEl = document.getElementById('quick-employer-code');
    const errEl = document.getElementById('quick-employer-error');
    const name = nameEl ? nameEl.value.trim() : '';
    const scope = scopeEl ? scopeEl.value : 'internal';
    const code = codeEl ? codeEl.value.trim() : '';
    if (!name) {
      if (errEl) { errEl.textContent = 'اسم الجهة حقل مطلوب.'; errEl.hidden = false; }
      if (typeof toast === 'function') toast('اسم الجهة حقل مطلوب', 'error');
      return;
    }
    const btn = document.getElementById('btn-save-quick-employer');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
    try {
      const payload = { name: name, scope: scope, status: 'active' };
      if (code) payload.code = code;
      const { data, error } = await sb.from('employers').insert(payload).select('id, name, scope').single();
      if (error) throw error;
      if (data) {
        STATE.members.employers.push(data);
        STATE.members.employers.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
      } else {
        STATE.members.optionsLoaded = false;
        await loadMembersOptions();
      }
      const statusEl = document.getElementById('member-service-status');
      const curScope = statusEl ? employerScopeForStatus(statusEl.value) : null;
      fillMemberEmployerSelect(curScope);
      if (data && data.id) {
        setVal('member-employer', data.id);
        /* الحزمة ب: جهة العمل الجديدة بلا فروع ← تلميح «تلقائي من جهة العمل» */
        fillMemberDeductionEntitySelect(data.id);
      }
      closeQuickEmployerModal();
      if (typeof toast === 'function') toast('تمت إضافة جهة العمل بنجاح', 'success');
      invalidateMembersOptions();
    } catch (e) {
      console.error('[Baraka Membership] saveQuickEmployer error:', e);
      const msg = (e && e.code === '23505') ? 'اسم الجهة أو الرمز مستخدم مسبقًا.' : 'تعذَّر حفظ جهة العمل — تحقَّق من المدخلات.';
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      if (typeof toast === 'function') toast(msg, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
  }

  function bindQuickEmployerModal() {
    const modal = document.getElementById('quick-employer-modal');
    if (!modal) {
      console.warn('[Baraka] quick-employer-modal not found');
      return;
    }
    if (modal.dataset.tripleBound === '1') return;
    modal.dataset.tripleBound = '1';
    console.log('[Baraka] bindQuickEmployerModal called');
    modal.addEventListener('click', (e) => {
      // الخيار A: الإغلاق فقط عند زر X أو إلغاء، لا عند backdrop
      if (e.target.closest('[data-close-quick-employer-modal]')) closeQuickEmployerModal();
    });
    const saveBtn = document.getElementById('btn-save-quick-employer');
    if (saveBtn) saveBtn.addEventListener('click', saveQuickEmployer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeQuickEmployerModal();
    });
  }

  function bindQuickEmployerTrigger() {
    console.log('[Baraka] bindQuickEmployerTrigger called');
    const btn = document.getElementById('btn-quick-add-employer');
    if (!btn) {
      console.warn('[Baraka] btn-quick-add-employer not found in DOM');
      return;
    }
    if (btn.dataset.tripleTriggerBound === '1') {
      console.log('[Baraka] bindQuickEmployerTrigger already bound, skipping');
      return;
    }
    btn.dataset.tripleTriggerBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('[Baraka] + جهة clicked, opening quick modal');
      openQuickEmployerModal();
    });
    console.log('[Baraka] bindQuickEmployerTrigger bound successfully');
  }

  /* ═══════════════════════════════════════════════
     إجراءات الجدول
     ═══════════════════════════════════════════════ */
  function onMembersTableClick(e) {
    const btn = e.target.closest('[data-member-action]');
    if (!btn) return;

    const action = btn.dataset.memberAction;
    if (action === 'add') return;

    const id = Number(btn.dataset.memberId);
    const member = STATE.members.list.find((m) => Number(m.id) === id);

    if (action === 'view')   openMemberModal(member || { id }, { readOnly: true });
    if (action === 'edit')   openMemberModal(member || { id });
    if (action === 'delete') deleteMember(member || { id });
  }

  async function deleteMember(member) {
    if (!member) return;
    const name = member.full_name || 'هذا العضو';
    if (!window.confirm('سيتم حذف ' + name + ' نهائيًا من سجل الأعضاء.\nهل أنت متأكد من المتابعة؟')) return;

    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const { error } = await sb.from('members').delete().eq('id', member.id);
      if (error) throw error;
      toast('تم حذف العضو بنجاح', 'success');
      loadMembers();
    } catch (e) {
      console.error('[Baraka Membership] deleteMember error:', e);
      toast('تعذَّر حذف العضو — قد يكون مرتبطًا بسجلات أخرى', 'error');
    }
  }

  /* ═══════════════════════════════════════════════
     نافذة إضافة / تعديل عضو
     ═══════════════════════════════════════════════ */
  async function openMemberModal(member, opts) {
    const modal = document.getElementById('member-modal');
    if (!modal) return;

    const data = member || null;
    MEMBER_EDIT = { id: data ? Number(data.id) : null, readOnly: !!(opts && opts.readOnly) };

    if (!STATE.members.optionsLoaded) await loadMembersOptions();

    fillMembersSelect('member-type', STATE.members.types, '— بدون —');

    setVal('member-id',              data ? data.id : '');
    setVal('member-full-name',       data ? data.full_name || '' : '');
    setVal('member-national-id',     data ? data.national_id || '' : '');
    setVal('member-phone',           data ? data.phone || '' : '');
    setVal('member-number-input',    data ? data.member_number || '' : '');
    setVal('member-employee-number', data ? data.employee_number || '' : '');
    setVal('member-type',            data && data.membership_type_id ? data.membership_type_id : '');
    setVal('member-service-status',  data ? data.service_status || 'active' : 'active');
    setVal('member-collection-method', data ? data.collection_method || 'cash' : 'cash');
    setVal('member-status',          data ? data.status || 'active' : 'active');
    setVal('member-date',            data && data.membership_date ? String(data.membership_date).slice(0, 10) : '');

    toggleEmployerField();
    setVal('member-employer', data && data.employer_id ? data.employer_id : '');
    /* الحزمة ب: Cascading — تعبئة جهة الخصم حسب جهة العمل + استعادة القيمة المحفوظة */
    fillMemberDeductionEntitySelect(
      data && data.employer_id ? data.employer_id : '',
      data && data.deduction_entity_id ? data.deduction_entity_id : null
    );
    // تأكيد الربط عند كل فتح للنافذة
    try { bindQuickEmployerTrigger(); } catch (e) {}
    try { bindQuickEmployerModal(); } catch (e) {}
    try { bindMemberStatusListener(); } catch (e) {}
    try { bindMemberEmployerCascade(); } catch (e) {}

    document.getElementById('member-modal-title').textContent = MEMBER_EDIT.readOnly
      ? 'بيانات العضو'
      : (MEMBER_EDIT.id ? 'تعديل العضو' : 'إضافة عضو');

    document.querySelectorAll('#member-form input, #member-form select').forEach((el) => { el.disabled = MEMBER_EDIT.readOnly; });
    const saveBtn = document.getElementById('btn-save-member');
    if (saveBtn) saveBtn.hidden = MEMBER_EDIT.readOnly;

    const errEl = document.getElementById('member-form-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    modal.classList.remove('hidden');
    const first = document.getElementById('member-full-name');
    if (first && !MEMBER_EDIT.readOnly) first.focus();
  }

  function closeMemberModal() {
    const modal = document.getElementById('member-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    MEMBER_EDIT = { id: null, readOnly: false };
  }

  async function saveMemberForm() {
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    const name = (document.getElementById('member-full-name').value || '').trim();
    const errEl = document.getElementById('member-form-error');

    const fail = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      toast(msg, 'error');
    };

    if (!name) { fail('الاسم الكامل حقل مطلوب.'); return; }

    const val = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    };

    const serviceStatus = val('member-service-status') || 'active';
    const employerIdRaw = val('member-employer');
    const employerId = employerIdRaw ? Number(employerIdRaw) : null;
    const collectionMethod = val('member-collection-method') || 'cash';

    if ((serviceStatus === 'active' || serviceStatus === 'external') && !employerId) {
      fail(serviceStatus === 'active' ? 'يجب اختيار جهة عمل داخلية للعضو على رأس العمل.' : 'يجب اختيار جهة عمل خارجية للعضو خارج النطاق.');
      return;
    }

    if (employerId) {
      const employer = (STATE.members.employers || []).find((e) => Number(e.id) === Number(employerId));
      const expectedScope = employerScopeForStatus(serviceStatus);
      if (expectedScope && employer && (employer.scope || 'internal') !== expectedScope) {
        fail(expectedScope === 'internal' ? 'جهة العمل المختارة ليست داخلية — اختر جهة داخلية معتمدة للخصم.' : 'جهة العمل المختارة ليست خارجية — اختر جهة خارجية.');
        return;
      }
    }

    const payload = {
      full_name:          name,
      national_id:        val('member-national-id') || null,
      phone:              val('member-phone') || null,
      employee_number:    val('member-employee-number') || null,
      membership_type_id: val('member-type') ? Number(val('member-type')) : null,
      employer_id:        (serviceStatus === 'retired' || serviceStatus === 'other') ? null : employerId,
      service_status:     serviceStatus,
      collection_method:  collectionMethod,
      status:             val('member-status') || 'active',
      membership_date:    val('member-date') || null,
    };

    /* ── الحزمة ب: جهة الخصم ── */
    const deductionSelect   = document.getElementById('member-deduction-entity');
    const deductionVisible  = !!(deductionSelect && !deductionSelect.classList.contains('hidden'));
    const deductionEntityRaw = val('member-deduction-entity');

    /* جهة عمل لها فروع ← اختيار جهة الخصم إلزامي */
    if (deductionVisible && !deductionEntityRaw) {
      fail('يجب اختيار جهة الخصم التابعة لجهة العمل.');
      return;
    }

    /* لا تُرسل deduction_entity_id إذا كان الحقل مخفياً — يملأ المشغّل
       (members_link_deduction_entity_trigger) الصف الذاتي تلقائيًا (R3) */
    if (deductionVisible && deductionEntityRaw && payload.employer_id) {
      payload.deduction_entity_id = Number(deductionEntityRaw);
    }

    const memberNumber = val('member-number-input');
    if (memberNumber) payload.member_number = memberNumber;

    const btn = document.getElementById('btn-save-member');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

    try {
      const query = MEMBER_EDIT.id
        ? sb.from('members').update(payload).eq('id', MEMBER_EDIT.id)
        : sb.from('members').insert(payload);

      const { error } = await query;
      if (error) throw error;

      const isEdit = !!MEMBER_EDIT.id;
      closeMemberModal();
      toast(isEdit ? 'تم حفظ بيانات العضو' : 'تمت إضافة العضو بنجاح', 'success');
      loadMembers();
    } catch (e) {
      console.error('[Baraka Membership] saveMemberForm error:', e);
      const msg = (e && e.code === '23505')
        ? 'الرقم القومي أو رقم العضوية مستخدم مسبقًا.'
        : (e && e.code === '23514')
          /* الحزمة ب: تكامل مرجعي من members_link_deduction_entity_trigger */
          ? 'جهة الخصم المختارة غير متوافقة مع جهة العمل'
          : 'تعذَّر حفظ بيانات العضو — تحقَّق من المدخلات.';
      fail(msg);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
  }

  /* ═══════════════════════════════════════════════
     تصدير Excel
     ═══════════════════════════════════════════════ */
  async function exportMembersExcel() {
    if (typeof XLSX === 'undefined') {
      toast('مكتبة Excel غير محمّلة — أعد تحميل الصفحة', 'error');
      return;
    }
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const { list } = await fetchMembersPage({ all: true });
      if (!list.length) { toast('لا توجد بيانات مطابقة للتصدير', 'info'); return; }

      const rows = list.map((m, i) => ({
        'م':                 i + 1,
        'رقم العضوية':       m.member_number || '',
        'الاسم':             m.full_name || '',
        'الرقم القومي':      m.national_id || '',
        'الجوال':            m.phone || '',
        'الرقم الوظيفي':     m.employee_number || '',
        'نوع العضوية':       joinName(m.membership_types),
        'جهة العمل':         joinName(m.employers),
        'جهة الخصم':         m.deduction_entities
          ? (m.deduction_entities.is_self ? 'تلقائي' : (m.deduction_entities.name || ''))
          : '',
        'الحالة بالخدمة':    MEMBER_SERVICE_STATUS[m.service_status] || '',
        'حالة العضوية':      memberStatusOf(m.status).label,
        'تاريخ العضوية':     m.membership_date || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      ];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الأعضاء');
      XLSX.writeFile(wb, 'الأعضاء-' + new Date().toISOString().slice(0, 10) + '.xlsx', { bookType: 'xlsx' });

      toast('تم تصدير ' + fmtNum(rows.length) + ' عضوًا إلى ملف Excel', 'success');
    } catch (e) {
      console.error('[Baraka Membership] exportMembersExcel error:', e);
      toast('تعذَّر تصدير البيانات', 'error');
    }
  }

  /* ═══════════════════════════════════════════════
     استيراد Excel
     ═══════════════════════════════════════════════ */
  const MEMBER_IMPORT_ALIASES = {
    full_name:        ['الاسم', 'الاسم الكامل', 'اسم العضو', 'العضو', 'name', 'fullname', 'full_name'],
    national_id:      ['الرقم القومي', 'رقم الهوية', 'الهوية', 'الرقم الوطني', 'nationalid', 'national_id'],
    phone:            ['الجوال', 'الهاتف', 'رقم الجوال', 'الموبايل', 'phone', 'mobile'],
    employee_number:  ['الرقم الوظيفي', 'رقم الموظف', 'employeenumber', 'employee_number'],
    member_number:    ['رقم العضوية', 'رقم العضو', 'membernumber', 'member_number'],
    membership_type:  ['نوع العضوية', 'الفئة', 'فئة العضوية', 'membershiptype'],
    employer:         ['جهة العمل', 'العمل', 'الجهة', 'employer'],
    deduction_entity: ['جهة الخصم', 'الخصم', 'deductionentity', 'deduction_entity'],
    service_status:   ['الحالة بالخدمة', 'الحالة الوظيفية', 'servicestatus'],
    status:           ['الحالة', 'حالة العضوية', 'status'],
    membership_date:  ['تاريخ العضوية', 'تاريخ الانتساب', 'membershipdate'],
  };

  function normalizeHeader(value) {
    return String(value || '')
      .replace(/[\u064B-\u0652\u0670]/g, '')
      .replace(/[\u0622\u0623\u0625\u0627]/g, 'ا')
      .replace(/[\u0649\u064A]/g, 'ي')
      .replace(/[\u0629]/g, 'ه')
      .replace(/[^0-9a-zA-Z\u0600-\u06FF]/g, '')
      .toLowerCase();
  }

  async function importMembersExcel(file) {
    if (typeof XLSX === 'undefined') {
      toast('مكتبة Excel غير محمّلة — أعد تحميل الصفحة', 'error');
      return;
    }
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) { toast('الملف لا يحتوي على أي ورقة عمل', 'error'); return; }

      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      if (!rawRows.length) { toast('الملف فارغ — لا توجد صفوف للاستيراد', 'error'); return; }

      const headers = Object.keys(rawRows[0]);
      const map = {};
      headers.forEach((h) => {
        const key = normalizeHeader(h);
        Object.keys(MEMBER_IMPORT_ALIASES).forEach((field) => {
          if (map[field]) return;
          const hit = MEMBER_IMPORT_ALIASES[field].some((alias) => normalizeHeader(alias) === key);
          if (hit) map[field] = h;
        });
      });

      if (!map.full_name) {
        toast('تعذَّر العثور على عمود الاسم في الملف', 'error');
        return;
      }

      if (!STATE.members.optionsLoaded) await loadMembersOptions();
      const typeByName = {};
      STATE.members.types.forEach((t) => { typeByName[normalizeHeader(t.name)] = t.id; });
      const employerByName = {};
      STATE.members.employers.forEach((x) => { employerByName[normalizeHeader(x.name)] = x.id; });
      /* الحزمة ب: بحث جهة الخصم بالاسم */
      const entityByName = {};
      (STATE.members.deductionEntities || []).forEach((d) => { entityByName[normalizeHeader(d.name)] = d.id; });

      const seenNational = {};
      const payloads = [];
      let skipped = 0;
      let unknownEmployers = 0;

      rawRows.forEach((row) => {
        const get = (field) => (map[field] ? String(row[map[field]] ?? '').trim() : '');
        const fullName = get('full_name');
        if (!fullName) { skipped++; return; }

        const nationalId = get('national_id');
        if (nationalId) {
          if (seenNational[nationalId]) { skipped++; return; }
          seenNational[nationalId] = true;
        }

        const typeName = normalizeHeader(get('membership_type'));
        const employerName = normalizeHeader(get('employer'));
        let employerId = employerName ? (employerByName[employerName] || null) : null;
        if (employerName && !employerId) unknownEmployers++;

        /* الحزمة ب: جهة الخصم بالاسم — تُقبل إن تبع جهة العمل،
           وإلا يرفضها مشغّل التكامل (23514) عند الإدراج */
        const entityNameRaw = normalizeHeader(get('deduction_entity'));
        const deductionEntityId = entityNameRaw ? (entityByName[entityNameRaw] || null) : null;

        const rawStatus = normalizeHeader(get('status'));
        const status = rawStatus.indexOf('موقوف') !== -1 ? 'suspended'
          : rawStatus.indexOf('مخفي') !== -1 ? 'hidden'
          : 'active';

        const rawService = normalizeHeader(get('service_status'));
        const serviceStatus = rawService.indexOf('متقاعد') !== -1 ? 'retired'
          : rawService.indexOf('اخر') !== -1 || rawService === 'other' ? 'other'
          : 'active';

        payloads.push({
          full_name:          fullName,
          national_id:        nationalId || null,
          phone:              get('phone') || null,
          employee_number:    get('employee_number') || null,
          member_number:      get('member_number') || null,
          membership_type_id: typeName ? (typeByName[typeName] || null) : null,
          employer_id:        employerId,
          /* الحزمة ب */
          deduction_entity_id: deductionEntityId,
          service_status:     serviceStatus,
          status:             status,
          membership_date:    get('membership_date') || null,
        });
      });

      if (!payloads.length) {
        toast('لم يُعثر على صفوف صالحة للاستيراد', 'error');
        return;
      }

      let inserted = 0;
      let failed = 0;
      const CHUNK = 250;

      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const { error } = await sb.from('members').insert(chunk);

        if (error) {
          for (const row of chunk) {
            const one = await sb.from('members').insert(row);
            if (one.error) failed++; else inserted++;
          }
        } else {
          inserted += chunk.length;
        }
      }

      let summary = 'تم استيراد ' + fmtNum(inserted) + ' عضوًا';
      if (failed)        summary += ' · تعذَّر ' + fmtNum(failed) + ' (مكرَّر أو بيانات ناقصة)';
      if (skipped)       summary += ' · تخطّي ' + fmtNum(skipped) + ' صف';
      if (unknownEmployers) summary += ' · ' + fmtNum(unknownEmployers) + ' بجهة عمل غير مسجَّلة';

      toast(summary, failed ? 'info' : 'success');
      loadMembers();
    } catch (e) {
      console.error('[Baraka Membership] importMembersExcel error:', e);
      toast('تعذَّر قراءة الملف — تأكد أنه بصيغة Excel أو CSV', 'error');
    }
  }

// ⬇⬇⬇ يتبع في الدفعة 5 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 4 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     تبويبا جهات العمل وجهات الخصم — الحالة
     ═══════════════════════════════════════════════ */
  STATE.employers = {
    list: [],
    filters: { q: '', status: '', scope: '' },
    loading: false,
    loaded: false,
    editId: null,
    requestId: 0,
    searchTimer: null,
  };

  STATE.deductionEntities = {
    list: [],
    filters: { q: '', status: '' },
    loading: false,
    loaded: false,
    editId: null,
    requestId: 0,
    searchTimer: null,
  };

  const DIR_STATUS = {
    active:   { label: 'نشط',     cls: 'member-badge-active' },
    inactive: { label: 'غير نشط', cls: 'member-badge-hidden' },
  };

  function dirStatusOf(status) {
    return DIR_STATUS[status] || { label: status || '—', cls: 'member-badge-hidden' };
  }

  /* ذاكرة مؤقتة لقائمة جهات العمل — تُستخدم في حقل «جهة العمل المالكة»
     بنافذة جهة الخصم، وتُلغى مع أي تغيير على جهات العمل */
  let entityEmployerOptionsCache = null;

  function invalidateMembersOptions() {
    if (STATE.members) STATE.members.optionsLoaded = false;
    entityEmployerOptionsCache = null;
  }

  /** تعبئة قائمة «جهة العمل المالكة» في نافذة جهة الخصم (مشروطة بوجود الحقل) */
  async function fillEmployerSelect(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    if (!entityEmployerOptionsCache) {
      const sb = membersSb();
      if (!sb) return;
      const { data, error } = await sb
        .from('employers')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      entityEmployerOptionsCache = data || [];
    }

    const current = (selectedId === null || selectedId === undefined) ? '' : String(selectedId);
    sel.innerHTML = '<option value="">— اختر جهة العمل المالكة —</option>'
      + entityEmployerOptionsCache.map((e) =>
          '<option value="' + esc(e.id) + '">' + esc(e.name || '—') + '</option>'
        ).join('');
    sel.value = current;
    /* إن كانت الجهة المالكة غير موجودة في القائمة أعد الحالة لل placeholder */
    if (current && sel.value !== current) sel.value = '';
  }

  function loadEmployers()          { return EmployersTab.load(); }
  function loadDeductionEntities()  { return EntitiesTab.load(); }

  /* ═══════════════════════════════════════════════
     مصنع موحَّد لإدارة تبويب "جهة"
     ═══════════════════════════════════════════════ */
  function createDirectoryTab(config) {
    const st = config.state;
    const $ = (id) => document.getElementById(id);

    const val = (id) => {
      const el = $(id);
      return el ? String(el.value || '').trim() : '';
    };

    /* ── Checkboxes: تُدار عبر .checked وليس value (مشروطة بـ config) ── */
    const isChecked = (id) => {
      const el = $(id);
      return Boolean(el && el.checked);
    };

    const setChecked = (id, on) => {
      const el = $(id);
      if (el) el.checked = Boolean(on);
    };

    const fieldBindings = [
      { id: config.ids.nameInput,  key: 'name' },
      { id: config.inputs.code,    key: 'code' },
      { id: config.inputs.address, key: 'address' },
      { id: config.inputs.phone,   key: 'phone' },
      { id: config.inputs.contact, key: 'contact_person' },
      { id: config.inputs.email,   key: 'email' },
      { id: config.inputs.scope,   key: 'scope' },
      /* الحزمة أ: Checkbox — يُفعَّل فقط عند تعريفه في config.inputs */
      { id: config.inputs.hasDeductionEntities, key: 'has_deduction_entities', type: 'checkbox' },
    ].filter((f) => f.id);

    function hasFilters() {
      const hasScope = config.hasScope && st.filters.scope;
      return Boolean(st.filters.q || st.filters.status || hasScope);
    }

    async function load() {
      const sb = membersSb();

      if (!sb) {
        st.loading = false;
        st.list = [];
        renderAll();
        showEmpty('لا يوجد اتصال بقاعدة البيانات — تعذَّر تحميل البيانات.');
        return;
      }

      if (st.loading) return;
      const requestId = ++st.requestId;
      st.loading = true;
      renderAll();

      try {
        const { data, error } = await sb
          .from(config.table)
          .select(config.select || '*')
          .order('name', { ascending: true })
          .limit(1000);

        if (requestId !== st.requestId) return;
        if (error) throw error;

        st.loading = false;
        st.loaded = true;
        st.list = data || [];
        renderAll();
      } catch (e) {
        if (requestId !== st.requestId) return;
        console.error('[Baraka Membership] ' + config.logTag + ' load error:', e);
        st.loading = false;
        st.list = [];
        renderAll();
        showEmpty('تعذَّر تحميل البيانات — تحقَّق من الاتصال ثم أعد المحاولة.');
        if (typeof toast === 'function') toast(config.labels.loadError, 'error');
      }
    }

    function filteredList() {
      const term = normalizeHeader(st.filters.q);

      return st.list.filter((row) => {
        if (st.filters.status && row.status !== st.filters.status) return false;
        if (config.hasScope && st.filters.scope && (row.scope || 'internal') !== st.filters.scope) return false;
        if (!term) return true;
        const hay = normalizeHeader([
          row.name, row.code, row.contact_person, row.phone, row.email, row.address,
        ].join(' '));
        return hay.indexOf(term) !== -1;
      });
    }

    function renderAll() {
      renderTable();
      renderMeta();
      renderActiveFilters();
    }

    function renderTable() {
      const tbody = $(config.ids.tbody);
      if (!tbody) return;

      const wrap  = $(config.ids.wrapper);
      const empty = $(config.ids.empty);

      if (st.loading) {
        if (empty) empty.hidden = true;
        if (wrap)  wrap.hidden = false;
        const widths = [80, 50, 60, 55, 45, 55];
        tbody.innerHTML = Array.from({ length: 4 }, () =>
          '<tr>' + Array.from({ length: config.cols || 6 }, (_, i) =>
            '<td><div class="members-skeleton" style="width:' + widths[i % widths.length] + '%"></div></td>'
          ).join('') + '</tr>'
        ).join('');
        return;
      }

      const rows = filteredList();

      if (!rows.length) {
        tbody.innerHTML = '';
        if (wrap) wrap.hidden = true;
        showEmpty(hasFilters()
          ? 'لا توجد نتائج مطابقة للبحث أو الفلاتر الحالية — جرّب تعديلها أو مسحها.'
          : config.labels.emptyDefault);
        return;
      }

      if (empty) empty.hidden = true;
      if (wrap)  wrap.hidden = false;
      tbody.innerHTML = rows.map(config.rowHtml).join('');
    }

    function showEmpty(message) {
      const empty = $(config.ids.empty);
      const text  = $(config.ids.emptyText);
      if (text && message) text.textContent = message;
      if (empty) empty.hidden = false;
    }

    function renderMeta() {
      const el = $(config.ids.count);
      if (!el) return;

      if (st.loading)      { el.textContent = 'جارٍ التحميل…'; return; }
      if (!st.list.length) { el.textContent = config.labels.metaNone; return; }

      const rows = filteredList();
      el.innerHTML = 'عرض <b>' + esc(fmtNum(rows.length)) + '</b> من <b>' + esc(fmtNum(st.list.length))
        + '</b> ' + config.labels.metaUnit
        + (hasFilters() ? ' (بعد التصفية)' : '');
    }

    function renderActiveFilters() {
      const host = $(config.ids.activeFilters);
      if (!host) return;

      const chips = [];
      if (st.filters.q)      chips.push('<span class="members-chip">بحث: ' + esc(st.filters.q) + '</span>');
      if (st.filters.status) chips.push('<span class="members-chip">الحالة: ' + esc(dirStatusOf(st.filters.status).label) + '</span>');
      if (config.hasScope && st.filters.scope) {
        const scopeLabel = (typeof EMPLOYER_SCOPE !== 'undefined' && EMPLOYER_SCOPE[st.filters.scope]) ? EMPLOYER_SCOPE[st.filters.scope] : st.filters.scope;
        chips.push('<span class="members-chip">النطاق: ' + esc(scopeLabel) + '</span>');
      }
      host.innerHTML = chips.join('');
    }

    function search(value, immediate) {
      const term = String(value || '').trim();

      const run = () => {
        st.filters.q = term;
        renderAll();
      };

      clearTimeout(st.searchTimer);
      if (immediate === true) run();
      else st.searchTimer = setTimeout(run, 300);
    }

    function setFilter(key, value) {
      st.filters[key] = (value === null || value === undefined) ? '' : String(value);
      renderAll();
    }

    function resetFilters() {
      st.filters = config.hasScope ? { q: '', status: '', scope: '' } : { q: '', status: '' };

      const searchInput = $(config.ids.search);
      if (searchInput) searchInput.value = '';
      const clear = $(config.ids.searchClear);
      if (clear) clear.hidden = true;
      const filterEl = $(config.ids.statusFilter);
      if (filterEl) filterEl.value = '';
      if (config.hasScope && config.ids.scopeFilter) {
        const scopeEl = $(config.ids.scopeFilter);
        if (scopeEl) scopeEl.value = '';
      }

      renderAll();
    }

    async function openModal(id) {
      const modal = $(config.ids.modal);
      if (!modal) return;

      const data = (id === null || id === undefined)
        ? null
        : st.list.find((r) => Number(r.id) === Number(id)) || null;

      st.editId = data ? Number(data.id) : null;

      setVal(config.ids.idInput, data ? data.id : '');
      fieldBindings.forEach((f) => {
        if (f.type === 'checkbox') setChecked(f.id, data ? Boolean(data[f.key]) : false);
        else setVal(f.id, data ? (data[f.key] || '') : '');
      });
      setVal(config.ids.statusSelect, data ? data.status || 'active' : 'active');
      if (config.hasScope && config.inputs.scope) {
        setVal(config.inputs.scope, data ? (data.scope || 'internal') : 'internal');
      }

      /* الحزمة أ: الأزرار المقصورة على وضع التعديل (مشروطة بـ config) */
      if (Array.isArray(config.editOnlyBtns)) {
        config.editOnlyBtns.forEach((btnId) => {
          const btnEl = $(btnId);
          if (btnEl) btnEl.hidden = !st.editId;
        });
      }

      /* الحزمة أ: تعبئة «جهة العمل المالكة» (نافذة جهة الخصم — مشروطة بـ config) */
      if (config.employerSelect) {
        try {
          await fillEmployerSelect(config.employerSelect, data ? data.employer_id : null);
        } catch (e) {
          console.error('[Baraka Membership] ' + config.logTag + ' fillEmployerSelect error:', e);
          if (typeof toast === 'function') toast('تعذَّر تحميل قائمة جهات العمل', 'error');
        }
      }

      const titleEl = $(config.ids.modalTitle);
      if (titleEl) titleEl.textContent = st.editId ? config.labels.editTitle : config.labels.addTitle;

      const errEl = $(config.ids.formError);
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

      modal.classList.remove('hidden');
      const first = $(config.ids.nameInput);
      if (first) first.focus();
    }

    function closeModal() {
      const modal = $(config.ids.modal);
      if (!modal) return;
      modal.classList.add('hidden');
      st.editId = null;
    }

    async function save() {
      const sb = membersSb();
      if (!sb) { if (typeof toast === 'function') toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

      const name = val(config.ids.nameInput);
      const errEl = $(config.ids.formError);
      const fail = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        if (typeof toast === 'function') toast(msg, 'error');
      };

      if (!name) { fail(config.labels.nameRequired); return; }

      const email = config.inputs.email ? val(config.inputs.email) : '';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail('صيغة البريد الإلكتروني غير صحيحة.');
        return;
      }

      const payload = {
        name:           name,
        code:           val(config.inputs.code) || null,
        address:        val(config.inputs.address),
        phone:          val(config.inputs.phone),
        contact_person: val(config.inputs.contact),
        status:         val(config.ids.statusSelect) || 'active',
      };
      if (config.inputs.email) payload.email = email;
      if (config.hasScope && config.inputs.scope) {
        payload.scope = val(config.inputs.scope) || 'internal';
      }

      /* الحزمة أ: Checkboxes (مشروطة بـ config) — تُقرأ من .checked لا من value */
      fieldBindings.forEach((f) => {
        if (f.type === 'checkbox') payload[f.key] = isChecked(f.id);
      });

      /* الحزمة أ: جهة العمل المالكة (نافذة جهة الخصم فقط) — مطلوبة
         لمنع إنشاء جهات خصم يتيمة تذهب للحاوية صامتاً */
      if (config.employerSelect) {
        const ownerId = val(config.employerSelect);
        if (!ownerId) {
          fail(config.labels.employerRequired || 'اختر جهة العمل المالكة للجهة الخصم.');
          return;
        }
        payload.employer_id = Number(ownerId);
      }

      const btn = $(config.ids.saveBtn);
      if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

      try {
        const query = st.editId
          ? sb.from(config.table).update(payload).eq('id', st.editId)
          : sb.from(config.table).insert(payload);

        const { error } = await query;
        if (error) throw error;

        const isEdit = !!st.editId;
        closeModal();
        if (typeof toast === 'function') toast(isEdit ? config.labels.savedEdit : config.labels.savedAdd, 'success');
        invalidateMembersOptions();
        /* الحزمة ج: حفظ جهة خصم → إلغاء كاش قوائم جهات الخصم (نافذة الدفعات + النموذج الثلاثي) */
        if (config.table === 'deduction_entities') invalidateDeductionEntitiesOptions();
        load();
      } catch (e) {
        console.error('[Baraka Membership] ' + config.logTag + ' save error:', e);
        const msg = (e && e.code === '23505')
          ? config.labels.duplicate
          : config.labels.saveError;
        fail(msg);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
      }
    }

    async function remove(id) {
      const record = st.list.find((r) => Number(r.id) === Number(id));
      if (!record) return;

      const name = record.name || config.labels.one;
      /* الحزمة ج: حذف «فرع» جهة خصم (تابع، غير ذاتي) — رسالة تشرح أثر
         المشغّل reassign: نقل الأعضاء تلقائيًا إلى الصف الذاتي للجهة */
      const isBranchEntity = config.table === 'deduction_entities' && !record.is_self;
      const confirmMsg = isBranchEntity
        ? ('سيتم حذف «' + name + '» نهائيًا.\n'
           + 'سيتم نقل الأعضاء المرتبطين بهذا الفرع تلقائيًا إلى جهة الخصم الرئيسية (الصف الذاتي) لجهة العمل.\n'
           + 'هل أنت متأكد من المتابعة؟')
        : ('سيتم حذف «' + name + '» نهائيًا.\nهل أنت متأكد من المتابعة؟');
      if (!window.confirm(confirmMsg)) return;

      const sb = membersSb();
      if (!sb) { if (typeof toast === 'function') toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

      try {
        const { error } = await sb.from(config.table).delete().eq('id', record.id);
        if (error) throw error;

        if (typeof toast === 'function') toast(config.labels.deleted, 'success');
        invalidateMembersOptions();
        /* الحزمة ج: حذف جهة خصم → إلغاء كاش قوائم جهات الخصم */
        if (config.table === 'deduction_entities') invalidateDeductionEntitiesOptions();
        load();
      } catch (e) {
        console.error('[Baraka Membership] ' + config.logTag + ' delete error:', e);
        const msg = (e && (e.code === '23503' || e.code === '23505'))
          ? config.labels.deleteBlocked
          : config.labels.deleteError;
        if (typeof toast === 'function') toast(msg, 'error');
      }
    }

    function onTableClick(e) {
      const btn = e.target.closest('[' + config.actionAttr + ']');
      if (!btn) return;

      const action = btn.getAttribute(config.actionAttr);
      if (action === 'add') { openModal(null); return; }

      const id = Number(btn.getAttribute(config.idAttr));
      if (action === 'edit')   openModal(id);
      if (action === 'delete') remove(id);
    }

    function bind() {
      const section = $(config.sectionId);
      if (!section || section.dataset.dirBound === '1') return;
      section.dataset.dirBound = '1';

      const searchInput = $(config.ids.search);
      const clear = $(config.ids.searchClear);

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          if (clear) clear.hidden = !searchInput.value;
          search(searchInput.value);
        });
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            search(searchInput.value, true);
          }
          if (e.key === 'Escape') {
            searchInput.value = '';
            if (clear) clear.hidden = true;
            search('', true);
          }
        });
      }

      if (clear) {
        clear.addEventListener('click', () => {
          if (searchInput) { searchInput.value = ''; searchInput.focus(); }
          clear.hidden = true;
          search('', true);
        });
      }

      const filterEl = $(config.ids.statusFilter);
      if (filterEl) filterEl.addEventListener('change', () => setFilter('status', filterEl.value));

      if (config.hasScope && config.ids.scopeFilter) {
        const scopeFilterEl = $(config.ids.scopeFilter);
        if (scopeFilterEl) scopeFilterEl.addEventListener('change', () => setFilter('scope', scopeFilterEl.value));
      }

      const resetBtn = $(config.ids.resetBtn);
      if (resetBtn) resetBtn.addEventListener('click', resetFilters);

      const addBtn = $(config.ids.addBtn);
      if (addBtn) addBtn.addEventListener('click', () => openModal(null));

      const tbody = $(config.ids.tbody);
      if (tbody) tbody.addEventListener('click', onTableClick);

      section.addEventListener('click', (e) => {
        if (e.target.closest('[' + config.actionAttr + '="add"]')) openModal(null);
      });

      const modal = $(config.ids.modal);
      if (modal) {
        modal.addEventListener('click', (e) => {
          // الخيار A: إغلاق فقط عند زر X/إلغاء
          if (e.target.closest('[' + config.closeAttr + ']')) closeModal();
        });

        const form = $(config.ids.form);
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

        const saveBtn = $(config.ids.saveBtn);
        if (saveBtn) saveBtn.addEventListener('click', save);

        /* الحزمة أ: زر «إدارة جهات الاستحقاق التابعة» (مشروط بـ config) —
           يفتح النافذة الفرعية ويمرر لها جهة العمل الحالية */
        if (config.subEntitiesBtn) {
          const subBtn = $(config.subEntitiesBtn);
          if (subBtn) subBtn.addEventListener('click', () => {
            const employerId = val(config.ids.idInput);
            if (!employerId) return; /* لا قيمة = وضع الإضافة، والزر مخفي أصلاً */
            openSubEntitiesModal(Number(employerId), val(config.ids.nameInput));
          });
        }

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });
      }
    }

    return { load, renderAll, renderTable, search, setFilter, resetFilters, openModal, closeModal, save, remove, bind };
  }

  /* ── صفوف جدول جهات العمل ── */
  function employerRowHtml(row) {
    const status = dirStatusOf(row.status);
    const id = Number(row.id);

    return ''
      + '<tr data-employer-row="' + id + '">'
      +   '<td data-label="الاسم">'
      +     '<span class="member-name">' + esc(row.name || '—') + '</span>'
      +     (row.address ? '<span class="member-sub">' + esc(row.address) + '</span>' : '')
      +   '</td>'
      +   '<td data-label="النطاق">'
      +     '<span class="member-badge-service">' + esc(EMPLOYER_SCOPE[row.scope || 'internal'] || '—') + '</span>'
      +   '</td>'
      +   '<td data-label="الرمز">'
      +     (row.code ? '<span class="member-number">' + esc(row.code) + '</span>' : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="المسؤول">'
      +     (row.contact_person ? esc(row.contact_person) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="الهاتف" class="member-phone">'
      +     (row.phone ? esc(row.phone) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="الحالة">'
      +     '<span class="member-badge ' + status.cls + '">' + esc(status.label) + '</span>'
      +   '</td>'
      +   '<td data-label="إجراءات">'
      +     '<div class="member-actions">'
      +       '<button type="button" class="member-action" data-employer-action="edit" data-employer-id="' + id + '" title="تعديل" aria-label="تعديل">✏️</button>'
      +       '<button type="button" class="member-action" data-employer-action="delete" data-employer-id="' + id + '" title="حذف" aria-label="حذف">🗑</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  }

  const EmployersTab = createDirectoryTab({
    table: 'employers',
    sectionId: 'tab-employers',
    logTag: 'Employers',
    cols: 7,
    hasScope: true,
    state: STATE.employers,
    actionAttr: 'data-employer-action',
    idAttr: 'data-employer-id',
    closeAttr: 'data-close-employer-modal',
    ids: {
      search:        'employers-search',
      searchClear:   'employers-search-clear',
      statusFilter:  'filter-employers-status',
      scopeFilter:   'filter-employers-scope',
      resetBtn:      'btn-reset-employers-filters',
      addBtn:        'btn-add-employer',
      count:         'employers-count',
      activeFilters: 'employers-active-filters',
      wrapper:       'employers-table-wrapper',
      tbody:         'employers-tbody',
      empty:         'employers-empty',
      emptyText:     'employers-empty-text',
      modal:         'employer-modal',
      modalTitle:    'employer-modal-title',
      form:          'employer-form',
      formError:     'employer-form-error',
      saveBtn:       'btn-save-employer',
      idInput:       'employer-id',
      nameInput:     'employer-name',
      statusSelect:  'employer-status',
    },
    inputs: {
      code:    'employer-code',
      address: 'employer-address',
      phone:   'employer-phone',
      contact: 'employer-contact',
      email:   null,
      scope:   'employer-scope',
      /* الحزمة أ: Checkbox «لها جهات استحقاق فرعية» — has_deduction_entities */
      hasDeductionEntities: 'employer-has-entities',
    },
    /* الحزمة أ: زر إدارة الفروع — يظهر في وضع التعديل فقط */
    subEntitiesBtn: 'btn-manage-sub-entities',
    editOnlyBtns: ['btn-manage-sub-entities'],
    labels: {
      one:           'جهة العمل',
      addTitle:      'إضافة جهة عمل',
      editTitle:     'تعديل جهة العمل',
      nameRequired:  'اسم جهة العمل حقل مطلوب.',
      duplicate:     'اسم جهة العمل أو الرمز مستخدم مسبقًا.',
      saveError:     'تعذَّر حفظ بيانات جهة العمل — تحقَّق من المدخلات.',
      savedAdd:      'تمت إضافة جهة العمل بنجاح',
      savedEdit:     'تم حفظ بيانات جهة العمل',
      deleted:       'تم حذف جهة العمل بنجاح',
      deleteBlocked: 'تعذَّر حذف جهة العمل — أنها مرتبطة بسجلات أخرى',
      deleteError:   'تعذَّر حذف جهة العمل — قد تكون مرتبطة بسجلات أخرى',
      loadError:     'تعذَّر تحميل قائمة جهات العمل',
      metaNone:      'لا توجد جهات عمل',
      metaUnit:      'جهة عمل',
      emptyDefault:  'لم تُسجَّل أي جهة عمل بعد — ابدأ بإضافة جهة عمل جديدة.',
    },
    rowHtml: employerRowHtml,
  });

  function renderEmployersTable()   { return EmployersTab.renderTable(); }
  function searchEmployers(v, imm)  { return EmployersTab.search(v, imm); }
  function setEmployerFilter(k, v)  { return EmployersTab.setFilter(k, v); }
  function resetEmployersFilters()  { return EmployersTab.resetFilters(); }
  function openEmployerModal(id)    { return EmployersTab.openModal(id); }
  function closeEmployerModal()     { return EmployersTab.closeModal(); }
  function saveEmployer()           { return EmployersTab.save(); }
  function deleteEmployer(id)       { return EmployersTab.remove(id); }
  function bindEmployers()          { return EmployersTab.bind(); }

  /* ═══════════════════════════════════════════════════
     الحزمة أ — نافذة إدارة جهات الاستحقاق التابعة (الفروع)
     استعلام: deduction_entities حيث employer_id = الجهة
     المحددة و is_self = false — والحفظ/الحذف مقيدان بـ employer_id
     ═══════════════════════════════════════════════════ */
  const SUB_ENTITIES = {
    employerId:   null,
    employerName: '',
    editId:       null,
    rows:         [],
    requestId:    0,
  };

  function subEntitiesVal(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function openSubEntitiesModal(employerId, employerName) {
    const modal = document.getElementById('sub-entities-modal');
    if (!modal) return;

    const id = Number(employerId);
    if (!id) {
      if (typeof toast === 'function') toast('حدّد جهة العمل أولًا (وضع التعديل) لإدارة فروعها', 'error');
      return;
    }

    SUB_ENTITIES.employerId   = id;
    SUB_ENTITIES.employerName = employerName || '';
    SUB_ENTITIES.editId       = null;

    const titleEl = document.getElementById('sub-entities-modal-title');
    if (titleEl) {
      titleEl.textContent = 'جهات الاستحقاق التابعة لـ: ' + (SUB_ENTITIES.employerName || ('#' + id));
    }

    resetSubEntityForm();
    modal.classList.remove('hidden');
    loadSubEntities(id);
  }

  function closeSubEntitiesModal() {
    const modal = document.getElementById('sub-entities-modal');
    if (modal) modal.classList.add('hidden');
    SUB_ENTITIES.editId = null;
  }

  async function loadSubEntities(employerId) {
    const eid = Number(employerId || SUB_ENTITIES.employerId);
    if (!eid) return;

    const tbody = document.getElementById('sub-entities-tbody');
    if (!tbody) return;

    const sb = membersSb();
    if (!sb) {
      if (typeof toast === 'function') toast('لا يوجد اتصال بقاعدة البيانات', 'error');
      return;
    }

    const requestId = ++SUB_ENTITIES.requestId;
    tbody.innerHTML = '<tr><td colspan="4"><div class="members-skeleton" style="width:60%"></div></td></tr>';

    try {
      const { data, error } = await sb
        .from('deduction_entities')
        .select('id, name, code, status, is_self, employer_id')
        .eq('employer_id', eid)
        .eq('is_self', false)
        .order('name', { ascending: true });

      if (requestId !== SUB_ENTITIES.requestId) return; /* استعلام قديم — تجاهله */
      if (error) throw error;

      SUB_ENTITIES.rows = data || [];
      renderSubEntitiesRows();
    } catch (e) {
      if (requestId !== SUB_ENTITIES.requestId) return;
      console.error('[Baraka Membership] SubEntities load error:', e);
      SUB_ENTITIES.rows = [];
      renderSubEntitiesRows();
      if (typeof toast === 'function') toast('تعذَّر تحميل جهات الاستحقاق التابعة', 'error');
    }
  }

  function renderSubEntitiesRows() {
    const tbody = document.getElementById('sub-entities-tbody');
    if (!tbody) return;

    const rows = SUB_ENTITIES.rows;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">'
        + '<span class="member-muted">لا توجد جهات استحقاق تابعة بعد — اضغط «إضافة فرع جديد».</span>'
        + '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const status = dirStatusOf(r.status);
      const id = Number(r.id);
      return ''
        + '<tr>'
        +   '<td data-label="الاسم"><span class="member-name">' + esc(r.name || '—') + '</span></td>'
        +   '<td data-label="الرمز">'
        +     (r.code ? '<span class="member-number">' + esc(r.code) + '</span>' : '<span class="member-muted">—</span>')
        +   '</td>'
        +   '<td data-label="الحالة"><span class="member-badge ' + status.cls + '">' + esc(status.label) + '</span></td>'
        +   '<td data-label="إجراءات">'
        +     '<div class="member-actions">'
        +       '<button type="button" class="member-action" data-sub-entity-action="edit" data-sub-entity-id="' + id + '" title="تعديل" aria-label="تعديل">✏️</button>'
        +       '<button type="button" class="member-action" data-sub-entity-action="delete" data-sub-entity-id="' + id + '" title="حذف" aria-label="حذف">🗑</button>'
        +     '</div>'
        +   '</td>'
        + '</tr>';
    }).join('');
  }

  function resetSubEntityForm() {
    SUB_ENTITIES.editId = null;
    setVal('sub-entity-id', '');
    setVal('sub-entity-name', '');
    setVal('sub-entity-code', '');
    setVal('sub-entity-status', 'active');

    const errEl = document.getElementById('sub-entity-form-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    const cancelBtn = document.getElementById('btn-cancel-sub-entity');
    if (cancelBtn) cancelBtn.hidden = true;

    const addBtn = document.getElementById('btn-add-sub-entity');
    if (addBtn) addBtn.hidden = false;
  }

  function startSubEntityEdit(row) {
    if (!row) return;

    SUB_ENTITIES.editId = Number(row.id);
    setVal('sub-entity-id', row.id);
    setVal('sub-entity-name', row.name || '');
    setVal('sub-entity-code', row.code || '');
    setVal('sub-entity-status', row.status || 'active');

    const errEl = document.getElementById('sub-entity-form-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    const cancelBtn = document.getElementById('btn-cancel-sub-entity');
    if (cancelBtn) cancelBtn.hidden = false;

    const addBtn = document.getElementById('btn-add-sub-entity');
    if (addBtn) addBtn.hidden = true;

    const nameEl = document.getElementById('sub-entity-name');
    if (nameEl) nameEl.focus();
  }

  async function saveSubEntity() {
    const sb = membersSb();
    const errEl = document.getElementById('sub-entity-form-error');
    const fail = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      if (typeof toast === 'function') toast(msg, 'error');
    };

    if (!sb) { fail('لا يوجد اتصال بقاعدة البيانات'); return; }

    const employerId = Number(SUB_ENTITIES.employerId);
    if (!employerId) { fail('أعد فتح النافذة — جهة العمل غير محددة.'); return; }

    const name = subEntitiesVal('sub-entity-name');
    if (!name) { fail('اسم فرع الاستحقاق حقل مطلوب.'); return; }

    const payload = {
      name:        name,
      code:        subEntitiesVal('sub-entity-code') || null,
      status:      subEntitiesVal('sub-entity-status') || 'active',
      employer_id: employerId, /* مقيد دائمًا بجهة العمل الحالية */
      is_self:     false,      /* الفروع ليست صفوفًا ذاتية */
    };

    const saveBtn = document.getElementById('btn-save-sub-entity');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'جارٍ الحفظ…'; }

    try {
      const query = SUB_ENTITIES.editId
        ? sb.from('deduction_entities').update(payload)
            .eq('id', SUB_ENTITIES.editId)
            .eq('employer_id', employerId) /* الحفظ مقيد بـ employer_id */
            .eq('is_self', false)
        : sb.from('deduction_entities').insert(payload);

      const { error } = await query;
      if (error) throw error;

      const isEdit = !!SUB_ENTITIES.editId;
      if (typeof toast === 'function') toast(isEdit ? 'تم حفظ فرع الاستحقاق' : 'تمت إضافة فرع الاستحقاق', 'success');
      resetSubEntityForm();
      invalidateMembersOptions();
      invalidateDeductionEntitiesOptions(); /* الحزمة ج: تحديث كاش قوائم جهات الخصم */
      loadSubEntities(employerId);
      EntitiesTab.load(); /* تحديث جدول جهات الخصم العام */
    } catch (e) {
      console.error('[Baraka Membership] SubEntities save error:', e);
      const msg = (e && e.code === '23505')
        ? 'اسم الفرع أو الرمز مستخدم داخل هذه الجهة.'
        : 'تعذَّر حفظ فرع الاستحقاق — تحقَّق من المدخلات.';
      fail(msg);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'حفظ الفرع'; }
    }
  }

  async function deleteSubEntity(id) {
    const employerId = Number(SUB_ENTITIES.employerId);
    if (!employerId) return;

    const row = SUB_ENTITIES.rows.find((r) => Number(r.id) === Number(id));
    if (!row) return;

    if (!window.confirm('سيتم حذف «' + (row.name || 'الفرع') + '» من جهات الاستحقاق التابعة.\nسيعود أعضاؤها إلى صف الجهة الذاتي.\nهل أنت متأكد من المتابعة؟')) return;

    const sb = membersSb();
    if (!sb) { if (typeof toast === 'function') toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const { error } = await sb
        .from('deduction_entities')
        .delete()
        .eq('id', row.id)
        .eq('employer_id', employerId) /* الحذف مقيد بـ employer_id */
        .eq('is_self', false);         /* لا يُحذف الصف الذاتي من هنا */
      if (error) throw error;

      if (typeof toast === 'function') toast('تم حذف فرع الاستحقاق', 'success');
      invalidateDeductionEntitiesOptions(); /* الحزمة ج: تحديث كاش قوائم جهات الخصم */
      loadSubEntities(employerId);
      EntitiesTab.load(); /* تحديث جدول جهات الخصم العام */
    } catch (e) {
      console.error('[Baraka Membership] SubEntities delete error:', e);
      const msg = (e && e.code === '23503')
        ? 'لا يمكن حذف الفرع — أنه مرتبط بسجلات أخرى (دفعات/أعضاء).'
        : 'تعذَّر حذف فرع الاستحقاق — قد يكون مرتبطًا بسجلات أخرى.';
      if (typeof toast === 'function') toast(msg, 'error');
    }
  }

  function bindSubEntitiesModal() {
    const modal = document.getElementById('sub-entities-modal');
    if (!modal || modal.dataset.subBound === '1') return;
    modal.dataset.subBound = '1';

    /* الإغلاق عبر الأزرار الحاملة لـ data-close-sub-entities-modal */
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-sub-entities-modal]')) closeSubEntitiesModal();
    });

    /* إضافة فرع جديد / حفظ / إلغاء التعديل */
    const addBtn = document.getElementById('btn-add-sub-entity');
    if (addBtn) addBtn.addEventListener('click', () => {
      resetSubEntityForm();
      const nameEl = document.getElementById('sub-entity-name');
      if (nameEl) nameEl.focus();
    });

    const saveBtn = document.getElementById('btn-save-sub-entity');
    if (saveBtn) saveBtn.addEventListener('click', saveSubEntity);

    const cancelBtn = document.getElementById('btn-cancel-sub-entity');
    if (cancelBtn) cancelBtn.addEventListener('click', resetSubEntityForm);

    const form = document.getElementById('sub-entity-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveSubEntity(); });

    /* تعديل / حذف لكل صف */
    const tbody = document.getElementById('sub-entities-tbody');
    if (tbody) tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sub-entity-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-sub-entity-action');
      const id = Number(btn.getAttribute('data-sub-entity-id'));
      if (action === 'edit') {
        startSubEntityEdit(SUB_ENTITIES.rows.find((r) => Number(r.id) === id));
      }
      if (action === 'delete') deleteSubEntity(id);
    });

    /* Escape يغلق النافذة الفرعية فقط (capture حتى لا يُغلق معاها
       نافذة جهة العمل المفتوحة خلفها) */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (modal.classList.contains('hidden')) return;
      e.stopImmediatePropagation();
      closeSubEntitiesModal();
    }, true);
  }

  /* ── صفوف جدول جهات الخصم ── */
  function entityRowHtml(row) {
    const status = dirStatusOf(row.status);
    const id = Number(row.id);
    /* الحزمة أ: جهة العمل المالكة عبر العلاقة المضمّنة (employers) */
    const ownerName = joinName(row.employers);

    return ''
      + '<tr data-entity-row="' + id + '">'
      +   '<td data-label="الاسم">'
      +     '<span class="member-name">' + esc(row.name || '—') + '</span>'
      +     (row.address ? '<span class="member-sub">' + esc(row.address) + '</span>' : '')
      +   '</td>'
      +   '<td data-label="جهة العمل المالكة">'
      +     (ownerName
              ? '<span>' + esc(ownerName) + '</span>'
              : '<span class="member-muted">—</span>')
      +     (row.is_self ? ' <span class="member-badge member-badge-self">(الجهة نفسها)</span>' : '')
      +   '</td>'
      +   '<td data-label="الرمز">'
      +     (row.code ? '<span class="member-number">' + esc(row.code) + '</span>' : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="المسؤول">'
      +     (row.contact_person ? esc(row.contact_person) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="الهاتف" class="member-phone">'
      +     (row.phone ? esc(row.phone) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="البريد" class="member-phone">'
      +     (row.email ? esc(row.email) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="الحالة">'
      +     '<span class="member-badge ' + status.cls + '">' + esc(status.label) + '</span>'
      +   '</td>'
      +   '<td data-label="إجراءات">'
      +     '<div class="member-actions">'
      +       '<button type="button" class="member-action" data-entity-action="edit" data-entity-id="' + id + '" title="تعديل" aria-label="تعديل">✏️</button>'
      +       '<button type="button" class="member-action" data-entity-action="delete" data-entity-id="' + id + '" title="حذف" aria-label="حذف">🗑</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  }

  const EntitiesTab = createDirectoryTab({
    table: 'deduction_entities',
    sectionId: 'tab-deduction-entities',
    logTag: 'DeductionEntities',
    cols: 8,
    /* الحزمة أ: علاقة مضمّنة لجلب اسم جهة العمل المالكة مع كل صف */
    select: '*, employers:employer_id (id, name)',
    /* الحزمة أ: حقل اختيار جهة العمل المالكة في النافذة */
    employerSelect: 'entity-employer',
    state: STATE.deductionEntities,
    actionAttr: 'data-entity-action',
    idAttr: 'data-entity-id',
    closeAttr: 'data-close-entity-modal',
    ids: {
      search:        'entities-search',
      searchClear:   'entities-search-clear',
      statusFilter:  'filter-entities-status',
      resetBtn:      'btn-reset-entities-filters',
      addBtn:        'btn-add-entity',
      count:         'entities-count',
      activeFilters: 'entities-active-filters',
      wrapper:       'entities-table-wrapper',
      tbody:         'entities-tbody',
      empty:         'entities-empty',
      emptyText:     'entities-empty-text',
      modal:         'entity-modal',
      modalTitle:    'entity-modal-title',
      form:          'entity-form',
      formError:     'entity-form-error',
      saveBtn:       'btn-save-entity',
      idInput:       'entity-id',
      nameInput:     'entity-name',
      statusSelect:  'entity-status',
    },
    inputs: {
      code:    'entity-code',
      address: 'entity-address',
      phone:   'entity-phone',
      contact: 'entity-contact',
      email:   'entity-email',
    },
    labels: {
      one:           'جهة الخصم',
      addTitle:      'إضافة جهة خصم',
      editTitle:     'تعديل جهة الخصم',
      nameRequired:  'اسم جهة الخصم حقل مطلوب.',
      employerRequired: 'اختر جهة العمل المالكة للجهة الخصم.',
      duplicate:     'اسم جهة الخصم أو الرمز مستخدم مسبقًا.',
      saveError:     'تعذَّر حفظ بيانات جهة الخصم — تحقَّق من المدخلات.',
      savedAdd:      'تمت إضافة جهة الخصم بنجاح',
      savedEdit:     'تم حفظ بيانات جهة الخصم',
      deleted:       'تم حذف جهة الخصم بنجاح',
      deleteBlocked: 'لا يمكن حذف جهة الخصم — لترتبط بدفعات خصم مسجَّلة',
      deleteError:   'تعذَّر حذف جهة الخصم — قد تكون مرتبطة بسجلات أخرى',
      loadError:     'تعذَّر تحميل قائمة جهات الخصم',
      metaNone:      'لا توجد جهات خصم',
      metaUnit:      'جهة خصم',
      emptyDefault:  'لم تُسجَّل أي جهة خصم بعد — ابدأ بإضافة جهة خصم جديدة.',
    },
    rowHtml: entityRowHtml,
  });

  function renderDeductionEntitiesTable() { return EntitiesTab.renderTable(); }
  function searchDeductionEntities(v, imm) { return EntitiesTab.search(v, imm); }
  function setEntityFilter(k, v)       { return EntitiesTab.setFilter(k, v); }
  function resetDeductionEntitiesFilters() { return EntitiesTab.resetFilters(); }
  function openEntityModal(id)         { return EntitiesTab.openModal(id); }
  function closeEntityModal()          { return EntitiesTab.closeModal(); }
  function saveEntity()                { return EntitiesTab.save(); }
  function deleteEntity(id)            { return EntitiesTab.remove(id); }
  function bindDeductionEntities()     { return EntitiesTab.bind(); }

// ⬇⬇⬇ يتبع في الدفعة 6 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 5 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     الاشتراكات — التحميل والعرض
     ═══════════════════════════════════════════════ */
  STATE.subscriptions = {
    list: [],
    page: 1,
    perPage: 20,
    total: 0,
    filters: { q: '', period_year: '', period_month: '', status: '', payment_method: '' },
    loading: false,
    requestId: 0,
    searchTimer: null,
    summary: { total: 0, paid: 0, remaining: 0, rate: 0 },
  };

  const SUB_MONTHS_AR = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  const SUB_STATUS = {
    pending: { label: 'غير مدفوع', cls: 'subs-badge-unpaid'  },
    partial: { label: 'جزئي',      cls: 'subs-badge-partial' },
    paid:    { label: 'مدفوع',     cls: 'subs-badge-paid'    },
  };

  const SUB_METHOD = { cash: 'نقدي', salary_deduction: 'خصم راتب', bank_transfer: 'تحويل' };

  const SUB_FREQUENCY = { monthly: 'شهري', annual: 'سنوي' };

  const SUB_FILTER_LABELS = {
    q:              'بحث',
    period_year:    'السنة',
    period_month:   'الشهر',
    status:         'الحالة',
    payment_method: 'طريقة الدفع',
  };

  const SUB_SELECT = [
    'id', 'member_id', 'period_year', 'period_month', 'frequency',
    'amount', 'paid_amount', 'status', 'payment_method', 'paid_at',
    'receipt_number', 'notes',
    'members:member_id ( id, full_name, member_number )',
  ].join(', ');

  function subStatusOf(status) {
    return SUB_STATUS[status] || { label: status || '—', cls: 'member-badge-hidden' };
  }

  function hasSubFilters() {
    const f = STATE.subscriptions.filters;
    return Boolean(f.q || f.period_year || f.period_month || f.status || f.payment_method);
  }

  async function findSubMemberIds(term) {
    const sb = membersSb();
    if (!sb || !term) return null;
    try {
      const { data, error } = await sb
        .from('members')
        .select('id')
        .or('full_name.ilike.%' + term + '%,member_number.ilike.%' + term + '%')
        .limit(500);
      if (error || !Array.isArray(data)) return null;
      return data.map((r) => Number(r.id)).filter(Number.isInteger);
    } catch (e) {
      return null;
    }
  }

  async function loadSubscriptions() {
    const sb = membersSb();
    const s = STATE.subscriptions;

    if (!sb) {
      s.loading = false;
      s.list = [];
      s.total = 0;
      renderSubsTable();
      renderSubsSummary();
      renderSubsMeta();
      renderSubsPagination();
      showSubsEmpty('لا يوجد اتصال بقاعدة البيانات — تعذَّر تحميل الاشتراكات.');
      return;
    }

    const requestId = ++s.requestId;
    s.loading = true;
    renderSubsTable();
    renderSubsMeta();
    renderSubsPagination();

    try {
      const { list, total } = await fetchSubsPage();
      if (requestId !== s.requestId) return;

      s.loading = false;
      s.list = list;
      s.total = total;

      const pages = Math.max(1, Math.ceil(total / s.perPage));
      if (s.page > pages) {
        s.page = pages;
        return loadSubscriptions();
      }

      renderSubsTable();
      renderSubsSummary();
      renderSubsMeta();
      renderSubsPagination();
      renderSubsActiveFilters();
    } catch (e) {
      if (requestId !== s.requestId) return;
      console.error('[Baraka Membership] loadSubscriptions error:', e);
      s.loading = false;
      s.list = [];
      s.total = 0;
      renderSubsTable();
      renderSubsSummary();
      renderSubsMeta();
      renderSubsPagination();
      showSubsEmpty('تعذَّر تحميل الاشتراكات — تحقَّق من الاتصال ثم أعد المحاولة.');
      if (typeof toast === 'function') toast('تعذَّر تحميل قائمة الاشتراكات', 'error');
    }
  }

  async function fetchSubsPage() {
    const s = STATE.subscriptions;
    const sb = membersSb();
    const from = (s.page - 1) * s.perPage;

    const term = sanitizeSearch(s.filters.q);
    const memberIds = term ? await findSubMemberIds(term) : null;

    let query = sb
      .from('subscriptions')
      .select(SUB_SELECT, { count: 'exact' })
      .order('period_year',  { ascending: false })
      .order('period_month', { ascending: false })
      .order('id',           { ascending: false })
      .range(from, from + s.perPage - 1);

    query = applySubFilters(query, memberIds);

    const { data, error, count } = await query;
    if (error) throw error;

    return { list: data || [], total: typeof count === 'number' ? count : (data ? data.length : 0) };
  }

  function applySubFilters(query, memberIds) {
    const f = STATE.subscriptions.filters;

    if (f.period_year)    query = query.eq('period_year',    Number(f.period_year));
    if (f.period_month)   query = query.eq('period_month',   Number(f.period_month));
    if (f.status)         query = query.eq('status',         f.status);
    if (f.payment_method) query = query.eq('payment_method', f.payment_method);

    const term = sanitizeSearch(f.q);
    if (term) {
      const orParts = ['receipt_number.ilike.%' + term + '%'];
      if (Array.isArray(memberIds) && memberIds.length) {
        orParts.push('member_id.in.(' + memberIds.join(',') + ')');
      }
      query = query.or(orParts.join(','));
    }

    return query;
  }

  function renderSubsTable() {
    const tbody = document.getElementById('subs-tbody');
    if (!tbody) return;

    const wrap  = document.getElementById('subs-table-wrapper');
    const empty = document.getElementById('subs-empty');
    const s = STATE.subscriptions;

    if (s.loading) {
      if (empty) empty.hidden = true;
      if (wrap)  wrap.hidden = false;
      const widths = [70, 90, 55, 60, 55, 65, 65, 65, 60, 55];
      tbody.innerHTML = Array.from({ length: 6 }, () =>
        '<tr>' + widths
          .map((w) => '<td><div class="members-skeleton" style="width:' + w + '%"></div></td>')
          .join('') + '</tr>'
      ).join('');
      return;
    }

    if (!s.list.length) {
      tbody.innerHTML = '';
      if (wrap) wrap.hidden = true;
      showSubsEmpty(hasSubFilters()
        ? 'لا توجد اشتراكات مطابقة للبحث أو الفلاتر الحالية — جرّب تعديلها أو مسحها.'
        : 'لم يُسجَّل أي اشتراك بعد — ابدأ بإضافة اشتراك جديد أو نفِّذ إجراءً تجميعيًا لتوليد الفترة.');
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap)  wrap.hidden = false;
    tbody.innerHTML = s.list.map(subRowHtml).join('');
  }

  function subRowHtml(row) {
    const st     = subStatusOf(row.status);
    const member = row.members || {};
    const id     = Number(row.id);
    const amount = Number(row.amount) || 0;
    const paid   = Number(row.paid_amount) || 0;
    const month  = SUB_MONTHS_AR[(Number(row.period_month) || 0) - 1] || '—';

    return ''
      + '<tr data-sub-row="' + id + '">'
      +   '<td data-label="رقم العضوية"><span class="member-number">' + esc(member.member_number || '—') + '</span></td>'
      +   '<td data-label="الاسم">'
      +     '<span class="member-name">' + esc(member.full_name || '—') + '</span>'
      +     (row.receipt_number ? '<span class="member-sub">سند: ' + esc(row.receipt_number) + '</span>' : '')
      +   '</td>'
      +   '<td data-label="السنة">' + (row.period_year ? esc(fmtNum(row.period_year)) : '—') + '</td>'
      +   '<td data-label="الشهر">' + esc(month) + '</td>'
      +   '<td data-label="النوع">' + esc(SUB_FREQUENCY[row.frequency] || row.frequency || '—') + '</td>'
      +   '<td data-label="المبلغ">' + esc(fmtMoney(amount)) + '</td>'
      +   '<td data-label="المدفوع">' + (paid > 0 ? esc(fmtMoney(paid)) : '<span class="member-muted">—</span>') + '</td>'
      +   '<td data-label="الحالة">'
      +     '<span class="member-badge ' + st.cls + '">' + esc(st.label) + '</span>'
      +   '</td>'
      +   '<td data-label="طريقة الدفع">'
      +     (row.payment_method
              ? '<span class="subs-method-badge" data-method="' + esc(row.payment_method) + '">'
                + esc(SUB_METHOD[row.payment_method] || row.payment_method) + '</span>'
              : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="إجراءات">'
      +     '<div class="member-actions">'
      +       '<button type="button" class="member-action" data-sub-action="view"   data-sub-id="' + id + '" title="عرض">👁</button>'
      +       '<button type="button" class="member-action" data-sub-action="edit"   data-sub-id="' + id + '" title="تعديل">✏️</button>'
      +       '<button type="button" class="member-action" data-sub-action="delete" data-sub-id="' + id + '" title="حذف">🗑</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  }

  function showSubsEmpty(message) {
    const empty = document.getElementById('subs-empty');
    const text  = document.getElementById('subs-empty-text');
    if (text && message) text.textContent = message;
    if (empty) empty.hidden = false;
  }

  function renderSubsSummary() {
    const s = STATE.subscriptions;

    let total = 0;
    let paid  = 0;
    s.list.forEach((row) => {
      total += Number(row.amount) || 0;
      paid  += Number(row.paid_amount) || 0;
    });

    const remaining = Math.max(0, total - paid);
    const rate      = total > 0 ? Math.round((paid / total) * 100) : 0;
    s.summary = { total: total, paid: paid, remaining: remaining, rate: rate };

    if (s.loading || !s.list.length) {
      setText('subs-sum-total',      '—');
      setText('subs-sum-paid',       '—');
      setText('subs-sum-remaining',  '—');
      setText('subs-sum-rate',       '—');
      return;
    }

    setText('subs-sum-total',     fmtMoney(total));
    setText('subs-sum-paid',      fmtMoney(paid));
    setText('subs-sum-remaining', fmtMoney(remaining));
    setText('subs-sum-rate',      fmtNum(rate) + '%');
  }

  function renderSubsPagination() {
    const host = document.getElementById('subs-pagination');
    if (!host) return;

    const s = STATE.subscriptions;
    if (s.loading || !s.total) { host.innerHTML = ''; return; }

    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const cur   = Math.min(s.page, pages);
    const from  = (cur - 1) * s.perPage + 1;
    const to    = Math.min(cur * s.perPage, s.total);

    const parts = [];
    parts.push('<span class="pagination-info">' + esc(fmtNum(from) + '–' + fmtNum(to) + ' من ' + fmtNum(s.total)) + '</span>');
    parts.push(pageBtn('‹', cur - 1, { disabled: cur <= 1, title: 'الصفحة السابقة' }));

    membersPageWindow(cur, pages).forEach((n) => {
      if (n === '…') parts.push('<span class="pagination-gap">…</span>');
      else parts.push(pageBtn(fmtNum(n), n, { active: n === cur, title: 'صفحة ' + n }));
    });

    parts.push(pageBtn('›', cur + 1, { disabled: cur >= pages, title: 'الصفحة التالية' }));
    host.innerHTML = parts.join('');
  }

  function goToSubsPage(page) {
    const s = STATE.subscriptions;
    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const next = Math.min(Math.max(1, Number(page) || 1), pages);
    if (next === s.page) return;
    s.page = next;
    loadSubscriptions();
    const wrap = document.getElementById('subs-table-wrapper');
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onSubsPaginationClick(e) {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    goToSubsPage(btn.dataset.page);
  }

  function bindSubsPagination() {
    const host = document.getElementById('subs-pagination');
    if (!host || host.dataset.subsPaginationBound) return;
    host.dataset.subsPaginationBound = '1';
    host.addEventListener('click', onSubsPaginationClick);
  }

  function renderSubsMeta() {
    const el = document.getElementById('subs-count');
    if (!el) return;

    const s = STATE.subscriptions;
    if (s.loading) { el.textContent = 'جارٍ تحميل الاشتراكات…'; return; }
    if (!s.total)  { el.textContent = hasSubFilters() ? 'لا توجد نتائج مطابقة' : 'لا توجد اشتراكات'; return; }

    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const from  = (s.page - 1) * s.perPage + 1;
    const to    = Math.min(s.page * s.perPage, s.total);

    el.innerHTML = 'عرض <b>' + esc(fmtNum(from) + '–' + fmtNum(to)) + '</b> من <b>' + esc(fmtNum(s.total))
      + '</b> اشتراكًا · صفحة ' + esc(fmtNum(s.page)) + ' من ' + esc(fmtNum(pages));
  }

  function renderSubsActiveFilters() {
    const host = document.getElementById('subs-active-filters');
    if (!host) return;

    const f = STATE.subscriptions.filters;
    const chips = [];

    Object.keys(f).forEach((key) => {
      const value = f[key];
      if (value === '' || value === null || value === undefined) return;
      let label = value;

      if (key === 'period_month') {
        label = SUB_MONTHS_AR[Number(value) - 1] || value;
      } else if (key === 'status') {
        label = subStatusOf(value).label;
      } else if (key === 'payment_method') {
        label = SUB_METHOD[value] || value;
      }

      chips.push('<span class="members-chip">' + esc(SUB_FILTER_LABELS[key] || key) + ': ' + esc(label) + '</span>');
    });

    host.innerHTML = chips.join('');
  }

  bindSubsPagination();

  /* ═══════════════════════════════════════════════
     نافذة إضافة / تعديل / حذف الاشتراك
     ═══════════════════════════════════════════════ */
  let SUB_EDIT = { id: null, readOnly: false };

  if (!STATE.subscriptions.membersOptions) {
    STATE.subscriptions.membersOptions = [];
    STATE.subscriptions.membersOptionsLoaded = false;
  }

  function ensureSelectOption(selectEl, value, label) {
    if (!selectEl || value === null || value === undefined || value === '') return;
    const v = String(value);
    const exists = Array.from(selectEl.options).some((o) => o.value === v);
    if (exists) return;
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = label || v;
    selectEl.appendChild(opt);
  }

  async function getSubById(id) {
    const subId = Number(id) || 0;
    if (!subId) return null;

    const cached = STATE.subscriptions.list.find((r) => Number(r.id) === subId);
    if (cached) return cached;

    const sb = membersSb();
    if (!sb) return null;
    try {
      const { data, error } = await sb
        .from('subscriptions')
        .select(SUB_SELECT)
        .eq('id', subId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.warn('[Baraka Membership] getSubById error:', e);
      return null;
    }
  }

  function subStatusFromPaid(amount, paid) {
    if (paid >= amount) return 'paid';
    if (paid > 0) return 'partial';
    return 'pending';
  }

  async function loadSubsMembersOptions() {
    const s = STATE.subscriptions;
    if (s.membersOptionsLoaded) return;

    const sb = membersSb();
    if (!sb) return;

    try {
      const { data, error } = await sb
        .from('members')
        .select('id, full_name, member_number')
        .eq('status', 'active')
        .order('full_name', { ascending: true });

      if (error) throw error;

      s.membersOptions = (data || []).slice().sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ar')
      );
      s.membersOptionsLoaded = true;
      fillSubMemberSelect();
    } catch (e) {
      console.warn('[Baraka Membership] loadSubsMembersOptions error:', e);
    }
  }

  function fillSubMemberSelect() {
    const el = document.getElementById('sub-member');
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">— اختر العضو —</option>'
      + (STATE.subscriptions.membersOptions || []).map((m) =>
          '<option value="' + esc(m.id) + '">'
          + esc(m.full_name || 'بدون اسم')
          + (m.member_number ? ' — ' + esc(m.member_number) : '')
          + '</option>'
        ).join('');
    if (current) el.value = current;
  }

  async function openSubModal(id, opts) {
    const modal = document.getElementById('sub-modal');
    if (!modal) return;

    const subId = Number(id) || 0;
    const data = subId ? await getSubById(subId) : null;

    if (subId && !data) {
      toast('تعذَّر تحميل بيانات الاشتراك', 'error');
      return;
    }

    SUB_EDIT = { id: subId || null, readOnly: !!(opts && opts.readOnly), row: data || null };

    await loadSubsMembersOptions();

    if (data) {
      const yearEl  = document.getElementById('sub-year');
      const monthEl = document.getElementById('sub-month');
      ensureSelectOption(yearEl,  data.period_year,  String(data.period_year));
      ensureSelectOption(monthEl, data.period_month,
        SUB_MONTHS_AR[Number(data.period_month) - 1] || String(data.period_month));
    }

    const now = new Date();
    setVal('sub-id',             data ? data.id : '');
    setVal('sub-member',         data ? data.member_id : '');
    setVal('sub-year',           data ? data.period_year  : now.getFullYear());
    setVal('sub-month',          data ? data.period_month : now.getMonth() + 1);
    setVal('sub-frequency',      data ? data.frequency || 'monthly' : 'monthly');
    setVal('sub-amount',         data ? (Number(data.amount) || 0) : '');
    setVal('sub-paid-amount',    data ? (Number(data.paid_amount) || 0) : '');
    setVal('sub-payment-method', data ? data.payment_method || '' : '');
    setVal('sub-receipt-number', data ? data.receipt_number || '' : '');
    setVal('sub-notes',          data ? data.notes || '' : '');

    const titleEl = document.getElementById('sub-modal-title');
    if (titleEl) {
      titleEl.textContent = SUB_EDIT.readOnly
        ? 'بيانات الاشتراك'
        : (SUB_EDIT.id ? 'تعديل الاشتراك' : 'إضافة اشتراك');
    }

    document.querySelectorAll('#sub-form input, #sub-form select, #sub-form textarea')
      .forEach((el) => { el.disabled = SUB_EDIT.readOnly; });

    const saveBtn = document.getElementById('btn-save-sub');
    if (saveBtn) saveBtn.hidden = SUB_EDIT.readOnly;

    const errEl = document.getElementById('sub-form-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    modal.classList.remove('hidden');
    const first = document.getElementById('sub-member');
    if (first && !SUB_EDIT.readOnly) first.focus();
  }

  function closeSubModal() {
    const modal = document.getElementById('sub-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    SUB_EDIT = { id: null, readOnly: false };
  }

  async function saveSubscription() {
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    const errEl = document.getElementById('sub-form-error');
    const fail = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      toast(msg, 'error');
    };

    const val = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    };

    const memberId = Number(val('sub-member')) || 0;
    const year     = Number(val('sub-year')) || 0;
    const month    = Number(val('sub-month')) || (new Date().getMonth() + 1);
    const amount   = parseFloat(val('sub-amount'));

    if (!memberId) { fail('يجب اختيار العضو.'); return; }
    if (!year || year < 1900 || year > 2100) { fail('السنة غير صالحة (1900–2100).'); return; }
    if (!Number.isFinite(amount) || amount < 0) { fail('المبلغ حقل مطلوب ويجب أن يكون رقمًا موجبًا.'); return; }

    const paid   = Math.max(0, parseFloat(val('sub-paid-amount')) || 0);
    const status = subStatusFromPaid(amount, paid);

    const payload = {
      member_id:      memberId,
      period_year:    year,
      period_month:   month,
      frequency:      val('sub-frequency') === 'annual' ? 'annual' : 'monthly',
      amount:         amount,
      paid_amount:    paid,
      status:         status,
      payment_method: val('sub-payment-method') || null,
      receipt_number: val('sub-receipt-number'),
      notes:          val('sub-notes'),
      paid_at:        paid > 0
        ? (SUB_EDIT.row && SUB_EDIT.row.paid_at ? SUB_EDIT.row.paid_at : new Date().toISOString())
        : null,
    };

    const btn = document.getElementById('btn-save-sub');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }

    try {
      const query = SUB_EDIT.id
        ? sb.from('subscriptions').update(payload).eq('id', SUB_EDIT.id)
        : sb.from('subscriptions').insert(payload);

      const { error } = await query;
      if (error) throw error;

      const isEdit = !!SUB_EDIT.id;
      closeSubModal();
      toast(isEdit ? 'تم حفظ بيانات الاشتراك' : 'تمت إضافة الاشتراك بنجاح', 'success');
      loadSubscriptions();
    } catch (e) {
      console.error('[Baraka Membership] saveSubscription error:', e);
      const msg = (e && e.code === '23505')
        ? 'يوجد اشتراك مسجَّل مسبقًا لهذا العضو في نفس الفترة ونفس النوع.'
        : 'تعذَّر حفظ الاشتراك — تحقَّق من المدخلات.';
      fail(msg);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
  }

  async function deleteSubscription(id) {
    const subId = Number(id) || 0;
    if (!subId) return;

    const row = STATE.subscriptions.list.find((r) => Number(r.id) === subId);
    const memberName = row && row.members ? row.members.full_name : '';
    const period = row
      ? ((SUB_MONTHS_AR[(Number(row.period_month) || 0) - 1] || '') + ' ' + (row.period_year || '')).trim()
      : '';
    const label = memberName
      ? 'اشتراك ' + memberName + (period ? ' — ' + period : '')
      : 'هذا الاشتراك';

    if (!window.confirm('سيتم حذف ' + label + ' نهائيًا من سجل الاشتراكات.\nهل أنت متأكد من المتابعة؟')) return;

    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const { error } = await sb.from('subscriptions').delete().eq('id', subId);
      if (error) throw error;
      toast('تم حذف الاشتراك بنجاح', 'success');
      loadSubscriptions();
    } catch (e) {
      console.error('[Baraka Membership] deleteSubscription error:', e);
      toast('تعذَّر حذف الاشتراك — قد يكون مرتبطًا بسجلات أخرى', 'error');
    }
  }

  function onSubsTableClick(e) {
    const btn = e.target.closest('[data-sub-action]');
    if (!btn) return;

    const action = btn.dataset.subAction;
    if (action === 'add') return;

    const id = Number(btn.dataset.subId) || 0;
    if (!id) return;

    if (action === 'view')   openSubModal(id, { readOnly: true });
    if (action === 'edit')   openSubModal(id);
    if (action === 'delete') deleteSubscription(id);
    if (action === 'pay')    openPaymentModal(id);
  }

  async function openPaymentModal(id) {
    const subId = Number(id) || 0;
    if (!subId) return;

    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    const row = await getSubById(subId);
    if (!row) { toast('تعذَّر العثور على الاشتراك', 'error'); return; }

    const amount    = Number(row.amount) || 0;
    const current   = Number(row.paid_amount) || 0;
    const remaining = Math.max(0, amount - current);
    const who       = (row.members && row.members.full_name) || 'العضو';

    const answer = window.prompt(
      'تسجيل دفعة — ' + who
      + '\nالمطلوب: ' + fmtMoney(amount)
      + '\nالمُسجَّل حاليًا: ' + fmtMoney(current)
      + '\nالمتبقي: ' + fmtMoney(remaining)
      + '\n\nأدخل إجمالي المبلغ المدفوع الجديد:',
      String(remaining)
    );
    if (answer === null) return;

    const paid = parseFloat(String(answer).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(paid) || paid < 0) { toast('أدخل مبلغًا رقميًا صحيحًا', 'error'); return; }
    if (paid === current) { toast('لا تغيير على المبلغ المسجَّل', 'info'); return; }

    try {
      const { error } = await sb.from('subscriptions').update({
        paid_amount: paid,
        status: subStatusFromPaid(amount, paid),
        paid_at: paid > 0 ? (row.paid_at || new Date().toISOString()) : null,
      }).eq('id', subId);
      if (error) throw error;

      toast('تم تحديث المدفوع إلى ' + fmtMoney(paid), 'success');
      loadSubscriptions();
    } catch (e) {
      console.error('[Baraka Membership] openPaymentModal error:', e);
      toast('تعذَّر تسجيل الدفعة — حاول مجددًا', 'error');
    }
  }

  function bindSubsModal() {
    const tbody = document.getElementById('subs-tbody');
    if (tbody && !tbody.dataset.subsModalBound) {
      tbody.dataset.subsModalBound = '1';
      tbody.addEventListener('click', onSubsTableClick);
    }

    const addBtn = document.getElementById('btn-add-sub');
    if (addBtn) addBtn.addEventListener('click', () => openSubModal(null));

    const emptyAdd = document.querySelector('#subs-empty [data-sub-action="add"]');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openSubModal(null));

    const saveBtn = document.getElementById('btn-save-sub');
    if (saveBtn) saveBtn.addEventListener('click', saveSubscription);

    const modal = document.getElementById('sub-modal');
    if (modal && !modal.dataset.subsBackdropBound) {
      modal.dataset.subsBackdropBound = '1';
      modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-sub-modal]')) closeSubModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeSubModal();
    });
  }

  bindSubsModal();

// ⬇⬇⬇ يتبع في الدفعة 7 ⬇⬇⬇
// ⬆⬆⬆ تكملة الدفعة 6 ⬆⬆⬆

  /* ═══════════════════════════════════════════════
     دفعات الخصم — التحميل والعرض
     ═══════════════════════════════════════════════ */
  STATE.deductionBatches = {
    list: [],
    page: 1,
    perPage: 20,
    total: 0,
    filters: { q: '', period_year: '', period_month: '', payment_method: '', status: '' },
    loading: false,
    requestId: 0,
    searchTimer: null,
    summary: { total: 0, deduction: 0, cash: 0, amount: 0 },
  };

  const BATCH_MONTHS_AR = SUB_MONTHS_AR;

  const BATCH_STATUS = {
    draft:     'مسودة',
    sent:      'مُرسلة',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
  };

  const BATCH_STATUS_BADGE = {
    draft:     'member-badge-suspended',
    sent:      'badge-info',
    completed: 'member-badge-active',
    cancelled: 'badge-danger',
  };

  const BATCH_METHOD = { salary_deduction: 'خصم راتب', cash_demand: 'مطالبة نقدية' };

  const BATCH_FILTER_LABELS = {
    q:              'بحث',
    period_year:    'السنة',
    period_month:   'الشهر',
    payment_method: 'النوع',
    status:         'الحالة',
  };

  const BATCH_SELECT = [
    'id', 'batch_number', 'period_year', 'period_month', 'deduction_entity_id',
    'payment_method', 'total_members', 'total_amount', 'status', 'created_at',
    'deduction_entities:deduction_entity_id ( id, name )',
  ].join(', ');

  function batchStatusOf(status) {
    return {
      label: BATCH_STATUS[status] || status || '—',
      cls:   BATCH_STATUS_BADGE[status] || 'member-badge-hidden',
    };
  }

  function hasBatchFilters() {
    const f = STATE.deductionBatches.filters;
    return Boolean(f.q || f.period_year || f.period_month || f.payment_method || f.status);
  }

  async function loadBatches() {
    const sb = membersSb();
    const s  = STATE.deductionBatches;

    if (!sb) {
      s.loading = false;
      s.list  = [];
      s.total = 0;
      renderBatchesTable();
      renderBatchesSummary();
      renderBatchesMeta();
      renderBatchesPagination();
      showBatchesEmpty('لا يوجد اتصال بقاعدة البيانات — تعذَّر تحميل الدفعات.');
      return;
    }

    const requestId = ++s.requestId;
    s.loading = true;
    renderBatchesTable();
    renderBatchesMeta();
    renderBatchesPagination();

    try {
      const { list, total } = await fetchBatchesPage();
      if (requestId !== s.requestId) return;

      s.loading = false;
      s.list  = list;
      s.total = total;

      const pages = Math.max(1, Math.ceil(total / s.perPage));
      if (s.page > pages) {
        s.page = pages;
        return loadBatches();
      }

      renderBatchesTable();
      renderBatchesSummary();
      renderBatchesMeta();
      renderBatchesPagination();
      renderBatchesActiveFilters();
    } catch (e) {
      if (requestId !== s.requestId) return;
      console.error('[Baraka Membership] loadBatches error:', e);
      s.loading = false;
      s.list  = [];
      s.total = 0;
      renderBatchesTable();
      renderBatchesSummary();
      renderBatchesMeta();
      renderBatchesPagination();
      showBatchesEmpty('تعذَّر تحميل الدفعات — تحقَّق من الاتصال ثم أعد المحاولة.');
      if (typeof toast === 'function') toast('تعذَّر تحميل قائمة الدفعات', 'error');
    }
  }

  async function fetchBatchesPage() {
    const s  = STATE.deductionBatches;
    const sb = membersSb();
    const from = (s.page - 1) * s.perPage;

    let query = sb
      .from('deduction_batches')
      .select(BATCH_SELECT, { count: 'exact' })
      .order('period_year',  { ascending: false })
      .order('period_month', { ascending: false })
      .order('id',           { ascending: false })
      .range(from, from + s.perPage - 1);

    query = applyBatchFilters(query);

    const { data, error, count } = await query;
    if (error) throw error;

    return { list: data || [], total: typeof count === 'number' ? count : (data ? data.length : 0) };
  }

  function applyBatchFilters(query) {
    const f = STATE.deductionBatches.filters;

    if (f.period_year)    query = query.eq('period_year',    Number(f.period_year));
    if (f.period_month)   query = query.eq('period_month',   Number(f.period_month));
    if (f.payment_method) query = query.eq('payment_method', f.payment_method);
    if (f.status)         query = query.eq('status',         f.status);

    const term = sanitizeSearch(f.q);
    if (term) query = query.ilike('batch_number', '%' + term + '%');

    return query;
  }

  function renderBatchesTable() {
    const tbody = document.getElementById('batches-tbody');
    if (!tbody) return;

    const wrap  = document.getElementById('batches-table-wrapper');
    const empty = document.getElementById('batches-empty');
    const s = STATE.deductionBatches;

    if (s.loading) {
      if (empty) empty.hidden = true;
      if (wrap)  wrap.hidden = false;
      const widths = [75, 55, 50, 60, 80, 45, 65, 55, 60];
      tbody.innerHTML = Array.from({ length: 6 }, () =>
        '<tr>' + widths
          .map((w) => '<td><div class="members-skeleton" style="width:' + w + '%"></div></td>')
          .join('') + '</tr>'
      ).join('');
      return;
    }

    if (!s.list.length) {
      tbody.innerHTML = '';
      if (wrap) wrap.hidden = true;
      showBatchesEmpty(hasBatchFilters()
        ? 'لا توجد دفعات مطابقة للبحث أو الفلاتر الحالية — جرّب تعديلها أو مسحها.'
        : 'لم تُولَّد أي دفعة خصم بعد — أنشئ دفعة يدويًا أو نفِّذ إجراءً تجميعيًا.');
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap)  wrap.hidden = false;
    tbody.innerHTML = s.list.map(renderBatchRowHtml).join('');
  }

  function renderBatchRowHtml(row) {
    const id      = Number(row.id);
    const status  = batchStatusOf(row.status);
    const entity  = joinName(row.deduction_entities);
    const method  = row.payment_method || 'salary_deduction';
    const month   = BATCH_MONTHS_AR[(Number(row.period_month) || 0) - 1] || '—';
    const members = Number(row.total_members) || 0;
    const amount  = Number(row.total_amount) || 0;
    const created = relTimeAr(row.created_at);

    return ''
      + '<tr data-batch-row="' + id + '">'
      +   '<td data-label="رقم الدفعة">'
      +     '<span class="member-number">' + esc(row.batch_number || ('#' + id)) + '</span>'
      +     (created ? '<span class="member-sub">أُنشئت ' + esc(created) + '</span>' : '')
      +   '</td>'
      +   '<td data-label="الشهر">' + esc(month) + '</td>'
      +   '<td data-label="السنة">' + (row.period_year ? esc(String(row.period_year)) : '—') + '</td>'
      +   '<td data-label="النوع">'
      +     '<span class="subs-method-badge" data-method="' + esc(method) + '">'
      +       esc(BATCH_METHOD[method] || method)
      +     '</span>'
      +   '</td>'
      +   '<td data-label="جهة الخصم">'
      +     (entity ? esc(entity) : '<span class="member-muted">—</span>')
      +   '</td>'
      +   '<td data-label="عدد الأعضاء">'
      +     (members ? '<b>' + esc(fmtNum(members)) + '</b>' : '<span class="member-muted">' + esc(fmtNum(0)) + '</span>')
      +   '</td>'
      +   '<td data-label="الإجمالي">' + esc(fmtMoney(amount)) + '</td>'
      +   '<td data-label="الحالة">'
      +     '<span class="member-badge ' + status.cls + '">' + esc(status.label) + '</span>'
      +   '</td>'
      +   '<td data-label="إجراءات">'
      +     '<div class="member-actions">'
      +       '<button type="button" class="member-action" data-batch-action="view"   data-batch-id="' + id + '" title="عرض">👁</button>'
      +       '<button type="button" class="member-action" data-batch-action="edit"   data-batch-id="' + id + '" title="تعديل">✏️</button>'
      +     '</div>'
      +   '</td>'
      + '</tr>';
  }

  function showBatchesEmpty(message) {
    const empty = document.getElementById('batches-empty');
    const text  = document.getElementById('batches-empty-text');
    if (text && message) text.textContent = message;
    if (empty) empty.hidden = false;
  }

  function renderBatchesSummary() {
    const s = STATE.deductionBatches;

    let deduction = 0;
    let cash      = 0;
    let amount    = 0;

    s.list.forEach((row) => {
      amount += Number(row.total_amount) || 0;
      if ((row.payment_method || 'salary_deduction') === 'cash_demand') cash += 1;
      else deduction += 1;
    });

    s.summary = { total: s.list.length, deduction: deduction, cash: cash, amount: amount };

    if (s.loading || !s.list.length) {
      setText('batches-sum-total',     '—');
      setText('batches-sum-deduction', '—');
      setText('batches-sum-cash',      '—');
      setText('batches-sum-amount',    '—');
      return;
    }

    setText('batches-sum-total',     fmtNum(s.total));
    setText('batches-sum-deduction', fmtNum(deduction));
    setText('batches-sum-cash',      fmtNum(cash));
    setText('batches-sum-amount',    fmtMoney(amount));
  }

  function renderBatchesPagination() {
    const host = document.getElementById('batches-pagination');
    if (!host) return;

    const s = STATE.deductionBatches;
    if (s.loading || !s.total) { host.innerHTML = ''; return; }

    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const cur   = Math.min(s.page, pages);
    const from  = (cur - 1) * s.perPage + 1;
    const to    = Math.min(cur * s.perPage, s.total);

    const parts = [];
    parts.push('<span class="pagination-info">' + esc(fmtNum(from) + '–' + fmtNum(to) + ' من ' + fmtNum(s.total)) + '</span>');
    parts.push(pageBtn('‹', cur - 1, { disabled: cur <= 1, title: 'الصفحة السابقة' }));

    membersPageWindow(cur, pages).forEach((n) => {
      if (n === '…') parts.push('<span class="pagination-gap">…</span>');
      else parts.push(pageBtn(fmtNum(n), n, { active: n === cur, title: 'صفحة ' + n }));
    });

    parts.push(pageBtn('›', cur + 1, { disabled: cur >= pages, title: 'الصفحة التالية' }));
    host.innerHTML = parts.join('');
  }

  function goToBatchesPage(page) {
    const s = STATE.deductionBatches;
    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const next = Math.min(Math.max(1, Number(page) || 1), pages);
    if (next === s.page) return;
    s.page = next;
    loadBatches();
    const wrap = document.getElementById('batches-table-wrapper');
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onBatchesPaginationClick(e) {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    goToBatchesPage(btn.dataset.page);
  }

  function bindBatchesPagination() {
    const host = document.getElementById('batches-pagination');
    if (!host || host.dataset.batchesPaginationBound) return;
    host.dataset.batchesPaginationBound = '1';
    host.addEventListener('click', onBatchesPaginationClick);
  }

  function renderBatchesMeta() {
    const el = document.getElementById('batches-count');
    if (!el) return;

    const s = STATE.deductionBatches;
    if (s.loading) { el.textContent = 'جارٍ تحميل الدفعات…'; return; }
    if (!s.total)  { el.textContent = hasBatchFilters() ? 'لا توجد نتائج مطابقة' : 'لا توجد دفعات'; return; }

    const pages = Math.max(1, Math.ceil(s.total / s.perPage));
    const from  = (s.page - 1) * s.perPage + 1;
    const to    = Math.min(s.page * s.perPage, s.total);

    el.innerHTML = 'عرض <b>' + esc(fmtNum(from) + '–' + fmtNum(to)) + '</b> من <b>' + esc(fmtNum(s.total))
      + '</b> دفعة · صفحة ' + esc(fmtNum(s.page)) + ' من ' + esc(fmtNum(pages));
  }

  function renderBatchesActiveFilters() {
    const host = document.getElementById('batches-active-filters');
    if (!host) return;

    const f = STATE.deductionBatches.filters;
    const chips = [];

    Object.keys(f).forEach((key) => {
      const value = f[key];
      if (value === '' || value === null || value === undefined) return;
      let label = value;

      if (key === 'period_month') {
        label = BATCH_MONTHS_AR[Number(value) - 1] || value;
      } else if (key === 'status') {
        label = BATCH_STATUS[value] || value;
      } else if (key === 'payment_method') {
        label = BATCH_METHOD[value] || value;
      }

      chips.push('<span class="members-chip">' + esc(BATCH_FILTER_LABELS[key] || key) + ': ' + esc(label) + '</span>');
    });

    host.innerHTML = chips.join('');
  }

  function searchBatches(value, immediate) {
    const term = String(value || '').trim();

    const run = () => {
      STATE.deductionBatches.filters.q = term;
      STATE.deductionBatches.page = 1;
      loadBatches();
    };

    clearTimeout(STATE.deductionBatches.searchTimer);
    if (immediate === true) run();
    else STATE.deductionBatches.searchTimer = setTimeout(run, 300);
  }

  function setBatchFilter(key, value) {
    STATE.deductionBatches.filters[key] = (value === null || value === undefined) ? '' : String(value);
    STATE.deductionBatches.page = 1;
    loadBatches();
  }

  function resetBatchesFilters() {
    const s = STATE.deductionBatches;
    s.filters = { q: '', period_year: '', period_month: '', payment_method: '', status: '' };
    s.page = 1;

    const search = document.getElementById('batches-search');
    if (search) search.value = '';

    const clear = document.getElementById('batches-search-clear');
    if (clear) clear.hidden = true;

    document.querySelectorAll('#tab-deductions [data-batch-filter]').forEach((el) => { el.value = ''; });

    renderBatchesActiveFilters();
    loadBatches();
  }

  /* ═══════════════════════════════════════════════
     الإجراء التجميعي (Bulk Batch Generation)
     يولّد لـ(سنة، شهر) محدد:
       - دفعة خصم (deduction_batches) واحدة لكل جهة عمل (salary_deduction)
         أو دفعة مطالبة نقدية واحدة (cash_demand) لبقية الأعضاء.
       - اشتراك (subscriptions) شهري لكل عضو.
       - سطر تفاصيل (deduction_batch_items) لكل عضو داخل دفعته.
     خطوات التنفيذ:
       1) fetchMembersForBulk(scope) — جلب الأعضاء حسب النطاق.
       2) checkExistingBatches / checkExistingSubscriptions — التكرار.
       3) groupMembersByDeductionEntity — التجميع حسب جهة الخصم (+ مطالبة نقدية).
       4) createBatchAndSubscriptions — الحفظ لكل مجموعة
          (Partial Failure: فشل مجموعة لا يُسقط باقي المجموعات).
     المبالغ من membership_fees (سعر الفترة) لكل membership_type.
     ═══════════════════════════════════════════════ */
  const BULK_MONTHS_AR = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const BULK_CHUNK = 100;        // صف لكل استعلام إدراج/استعلام (حدود Supabase)
  const BULK_PAGE = 1000;        // صف لكل صفحة عند الجلب (الحد الافتراضي لـ PostgREST)
  const BULK_MAX_MEMBERS = 10000; // حد أمان إجمالي

  let BULK_RUNNING = false;

  /* ─ شريط التقدم داخل bulk-batch-modal ─ */
  function setBulkProgress(percent, text) {
    const bar = document.getElementById('bulk-batch-progress-bar');
    if (bar) bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    setText('bulk-batch-status', text || '');
  }

  function showBulkProgress(visible) {
    const wrap = document.getElementById('bulk-batch-progress');
    if (wrap) wrap.classList.toggle('hidden', !visible);
  }

  function resetBulkProgress() {
    setBulkProgress(0, 'جارٍ التنفيذ…');
    showBulkProgress(false);
    const errEl = document.getElementById('bulk-batch-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  }

  /* ─ تعبئة قوائم السنة والشهر ─ */
  function fillBulkYearOptions(selectedYear) {
    const el = document.getElementById('bulk-year');
    if (!el) return;
    const current = new Date().getFullYear();
    const sel = Number(selectedYear) || current;
    const years = [];
    for (let y = current + 2; y >= current - 2; y--) years.push(y);
    if (!years.includes(sel)) years.unshift(sel);
    el.innerHTML = years
      .map((y) => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`)
      .join('');
  }

  function fillBulkMonthOptions(selectedMonth) {
    const el = document.getElementById('bulk-month');
    if (!el) return;
    const sel = Number(selectedMonth) || (new Date().getMonth() + 1);
    el.innerHTML = BULK_MONTHS_AR
      .map((name, i) => {
        const m = i + 1;
        return `<option value="${m}"${m === sel ? ' selected' : ''}>${name}</option>`;
      })
      .join('');
  }

  /* ═══════════════════════════════════════════════
     1) نافذة الإجراء التجميعي
     ═══════════════════════════════════════════════ */
  function openBulkBatchModal() {
    const modal = document.getElementById('bulk-batch-modal');
    if (!modal) return;

    const now = new Date();
    fillBulkYearOptions(now.getFullYear());
    fillBulkMonthOptions(now.getMonth() + 1);
    setVal('bulk-scope', 'all');
    const skipEl = document.getElementById('bulk-skip-existing');
    if (skipEl) skipEl.checked = true;
    resetBulkProgress();

    modal.classList.remove('hidden');
  }

  function closeBulkBatchModal() {
    const modal = document.getElementById('bulk-batch-modal');
    if (modal) modal.classList.add('hidden');
    resetBulkProgress();
  }

  /* ═══════════════════════════════════════════════
     2) جلب الأعضاء المستهدفين حسب النطاق
     ═══════════════════════════════════════════════ */
  const BULK_MEMBER_SELECT = [
    'id', 'full_name', 'employee_number',
    'status', 'service_status', 'collection_method',
    'employer_id', 'deduction_entity_id', 'membership_type_id',
    'employers:employer_id ( id, name )',
    /* الحزمة ج: اسم جهة الخصم مضمّن — مفتاح التجميع الجديد */
    'deduction_entities:deduction_entity_id ( id, name, is_self )',
  ].join(', ');

  async function fetchMembersForBulk(scope, year, month) {
    const sb = membersSb();
    if (!sb) throw new Error('no_db');

    // ملاحظة: year/month ليسا جزءًا من تصفية الأعضاء — يحتفظان بالتواقيع.
    // تضييق النطاق:
    //   all       → كل الأعضاء النشطين (يُقسَّمون لاحقًا في groupMembersByDeductionEntity)
    //   employees → service_status=active + collection_method=salary_deduction + جهة عمل
    //   pension   → متقاعد/خارج الخدمة أو تحصيل نقدي.
    //                (قيم members.collection_method الفعلية: 'cash' | 'salary_deduction' —
    //                 'cash_demand' هو مصطلح الدفعات وليس طريقة تحصيل عضو.)
    //
    // الحزمة ج: عمود deduction_entity_id مضمون الوجود بعد ترحيل entity-linkage
    // (يُملأ تلقائيًا بالصف الذاتي عبر المشغّل) — حُذفت معالجة 42703 الاحتياطية.

    const buildQuery = () => {
      let q = sb
        .from('members')
        .select(BULK_MEMBER_SELECT)
        .eq('status', 'active')
        .order('id', { ascending: true });
      if (scope === 'employees') {
        q = q.eq('service_status', 'active').eq('collection_method', 'salary_deduction').not('employer_id', 'is', null);
      } else if (scope === 'pension') {
        q = q.or('service_status.in.(retired,external),collection_method.eq.cash');
      }
      return q;
    };

    const all = [];
    for (let from = 0; from < BULK_MAX_MEMBERS; from += BULK_PAGE) {
      const { data, error } = await buildQuery().range(from, from + BULK_PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < BULK_PAGE) break;
    }
    return all;
  }

  /* ═══════════════════════════════════════════════
     3) التحقق من التكرار
     ═══════════════════════════════════════════════ */
  async function checkExistingSubscriptions(memberIds, year, month) {
    const sb = membersSb();
    const ids = (memberIds || [])
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!sb || !ids.length) return new Set();

    const chunks = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) chunks.push(ids.slice(i, i + BULK_CHUNK));

    const results = await Promise.all(chunks.map((chunk) =>
      sb.from('subscriptions')
        .select('member_id')
        .eq('period_year', year)
        .eq('period_month', month)
        .eq('frequency', 'monthly')
        .in('member_id', chunk)
    ));

    const existing = new Set();
    results.forEach(({ data, error }) => {
      if (error) console.warn('[Baraka Membership] checkExistingSubscriptions chunk error:', error);
      (data || []).forEach((r) => existing.add(Number(r.member_id)));
    });
    return existing;
  }

  async function checkExistingBatches(year, month) {
    const sb = membersSb();
    if (!sb) return [];
    const { data, error } = await sb
      .from('deduction_batches')
      .select('id, batch_number, payment_method, deduction_entity_id')
      .eq('period_year', year)
      .eq('period_month', month);
    if (error) throw error;
    return data || [];
  }

  /* ═══════════════════════════════════════════════
     4) التجميع حسب جهة الخصم (الحزمة ج)
     ═══════════════════════════════════════════════
     مفتاح التجميع أصبح deduction_entity_id (وليس employer_id):
     - العمود مضمون لكل عضو خصم راتب (يُملأ يدويًا أو بالصف الذاتي عبر المشغّل)،
       لذا لم يعد التجميع بحاجة إلى resolveDeductionEntity / VIEW التوافقي.
     - جهتا عمل تشتركان في جهة خصم واحدة → مجموعة (دفعة) واحدة.
     - fallback دفاعي: عضو خصم راتب بلا deduction_entity_id (بيانات قديمة
       قبل الترحيل) يُجمَّع بمفتاح جهة عمله حتى لا يسقط من الدفعات. */
  function groupMembersByDeductionEntity(members) {
    const salaryGroups = new Map();
    const cashMembers = [];

    (members || []).forEach((m) => {
      const isSalary = m.service_status === 'active'
        && m.collection_method === 'salary_deduction'
        && m.employer_id;
      if (isSalary) {
        const entityId = Number(m.deduction_entity_id) || null;
        const key = entityId ? ('de-' + entityId) : ('emp-' + Number(m.employer_id));
        if (!salaryGroups.has(key)) {
          salaryGroups.set(key, {
            entityId: entityId,
            entityName: entityId
              ? (joinName(m.deduction_entities) || ('جهة الخصم #' + entityId))
              : '',
            employerId: Number(m.employer_id),
            employerName: joinName(m.employers) || ('جهة العمل #' + Number(m.employer_id)),
            /* أسماء جهات العمل المشاركة (قد تتعدد عند جهة خصم مشتركة) */
            employerNames: new Set(),
            members: [],
          });
        }
        const g = salaryGroups.get(key);
        const empName = joinName(m.employers) || ('جهة العمل #' + Number(m.employer_id));
        g.employerNames.add(empName);
        g.members.push(m);
      } else {
        // متقاعدون / خارج الخدمة / بلا جهة / تحصيل نقدي → مطالبة نقدية واحدة
        cashMembers.push(m);
      }
    });

    /* employerName النهائي: أسماء جهات العمل المشاركة مفصولة بـ «، » */
    const groups = Array.from(salaryGroups.values()).map((g) => {
      const names = Array.from(g.employerNames);
      return {
        entityId: g.entityId,
        entityName: g.entityName,
        employerId: g.employerId,
        employerName: names.length ? names.join('، ') : g.employerName,
        members: g.members,
      };
    });

    return { salaryGroups: groups, cashMembers };
  }

  /* ═══════════════════════════════════════════════
     5) أرقام الدفعات والمبالغ
     ═══════════════════════════════════════════════ */
  /** B-{year}-{month}-{seq:03d} مع تفادي الأرقام المستخدمة مسبقًا */
  function generateBatchNumber(year, month, sequence, existingNumbers) {
    const taken = new Set([...(existingNumbers || [])].map((n) => String(n || '')));
    const mm = String(month).padStart(2, '0');
    let seq = Math.max(1, Number(sequence) || 1);
    let candidate;
    do {
      candidate = `B-${year}-${mm}-${String(seq).padStart(3, '0')}`;
      seq += 1;
    } while (taken.has(candidate));
    return candidate;
  }

  /** سعر الشهر لكل نوع عضوية من سجل membership_fees التاريخي */
  async function fetchMonthlyFeesByType(year, month) {
    const sb = membersSb();
    if (!sb) throw new Error('no_db');

    const periodDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const { data, error } = await sb
      .from('membership_fees')
      .select('membership_type_id, monthly_fee, effective_from, effective_to');
    if (error) throw error;

    const feesByType = {};
    (data || []).forEach((fee) => {
      const from = String(fee.effective_from || '').slice(0, 10);
      const to = fee.effective_to ? String(fee.effective_to).slice(0, 10) : null;
      if (!from || from > periodDate) return;
      if (to && to < periodDate) return;
      feesByType[Number(fee.membership_type_id)] = Number(fee.monthly_fee) || 0;
    });
    return feesByType;
  }

  /* ═══════════════════════════════════════════════
     6) إنشاء دفعة + اشتراكات + عناصر الدفعة (لمجموعة)
     ═══════════════════════════════════════════════ */
  async function insertSubscriptionsChunked(sb, rows) {
    const stats = { created: 0, existing: 0, failed: [] };

    for (let i = 0; i < rows.length; i += BULK_CHUNK) {
      const chunk = rows.slice(i, i + BULK_CHUNK);
      const { error } = await sb.from('subscriptions').insert(chunk);
      if (!error) { stats.created += chunk.length; continue; }

      // فشل الجمعي (غالبًا 23505) → محاولة صف-بصف لعزل الفشل
      console.warn('[Baraka Membership] subscriptions insert failed, retrying row-by-row:', error.message);
      for (const row of chunk) {
        try {
          const r = await sb.from('subscriptions').insert(row);
          if (r.error) throw r.error;
          stats.created += 1;
        } catch (e) {
          if (e && e.code === '23505') stats.existing += 1;
          else {
            stats.failed.push(Number(row.member_id));
            console.error('[Baraka Membership] insertSubscription error:', e);
          }
        }
      }
    }
    return stats;
  }

  async function createBatchAndSubscriptions(args) {
    const { sb, group, year, month, feesByType, skipExisting, existingBatches, seqCounter, takenBatchNumbers } = args;
    const isCash = group.paymentMethod === 'cash_demand';

    const result = {
      label: group.label,
      batchCreated: false,
      batchReused: false,
      batchId: null,
      batchNumber: null,
      membersAdded: 0,
      subsCreated: 0,
      subsExisting: 0,
      subsFailed: 0,
      itemsCreated: 0,
      noFeeMembers: 0,
      error: null,
    };

    const entityKeyOf = (pm, eid) => `${pm}|${eid == null ? 'null' : eid}`;

    /* (1) الدفعة: إعادة استخدام موجودة عند skipExisting، وإلا إنشاء جديدة */
    const existingBatch = skipExisting
      ? (existingBatches || []).find((b) => entityKeyOf(b.payment_method, b.deduction_entity_id) === entityKeyOf(group.paymentMethod, group.deductionEntityId))
      : null;

    if (existingBatch) {
      result.batchId = Number(existingBatch.id);
      result.batchNumber = existingBatch.batch_number;
      result.batchReused = true;
    } else {
      const payload = {
        batch_number: generateBatchNumber(year, month, seqCounter.next, takenBatchNumbers),
        period_year: year,
        period_month: month,
        payment_method: group.paymentMethod,
        deduction_entity_id: group.deductionEntityId,
        total_members: 0, // تُحسب من العناصر الفعلية بعد الحفظ
        total_amount: 0,
        status: 'draft',
        notes: 'توليد آلي — إجراء تجميعي',
      };
      seqCounter.next += 1;
      takenBatchNumbers.add(payload.batch_number);

      const { data, error } = await sb
        .from('deduction_batches')
        .insert(payload)
        .select('id, batch_number')
        .maybeSingle();
      if (error) {
        result.error = (error.code === '23505')
          ? 'توجد دفعة موجودة مسبقًا لنفس الفترة والجهة.'
          : (error.message || 'تعذَّر إنشاء الدفعة.');
        return result;
      }
      result.batchId = data ? Number(data.id) : null;
      result.batchNumber = data ? data.batch_number : payload.batch_number;

      // (نادرًا) نجاح الإدراج دون استرجاع معرّف → الاسترجاع من رقم الدفعة
      if (!result.batchId) {
        const { data: found } = await sb
          .from('deduction_batches')
          .select('id, batch_number')
          .eq('batch_number', payload.batch_number)
          .maybeSingle();
        if (found) {
          result.batchId = Number(found.id);
          result.batchNumber = found.batch_number;
          result.batchReused = true;
        }
      }
      if (!result.batchId) {
        result.error = 'تعذَّر استرجاع معرّف الدفعة بعد الإنشاء.';
        return result;
      }
      result.batchCreated = true;
    }

    /* (2) تحديد الأعضاء الجدد في هذه المجموعة (تخطي الموجود عند skipExisting) */
    let targetMembers = group.members;
    if (skipExisting) {
      const existingSubs = await checkExistingSubscriptions(targetMembers.map((m) => m.id), year, month);
      if (existingSubs.size) {
        targetMembers = targetMembers.filter((m) => !existingSubs.has(Number(m.id)));
      }
      // عناصر موجودة مسبقًا في الدفعة المعاد استخدامها → تخطيها
      if (result.batchReused && targetMembers.length) {
        const itemMemberIds = new Set();
        const ids = targetMembers.map((m) => Number(m.id));
        for (let i = 0; i < ids.length; i += BULK_CHUNK) {
          const chunk = ids.slice(i, i + BULK_CHUNK);
          const { data, error } = await sb
            .from('deduction_batch_items')
            .select('member_id')
            .eq('batch_id', result.batchId)
            .in('member_id', chunk);
          if (error) console.warn('[Baraka Membership] existing items check error:', error);
          (data || []).forEach((r) => itemMemberIds.add(Number(r.member_id)));
        }
        if (itemMemberIds.size) {
          targetMembers = targetMembers.filter((m) => !itemMemberIds.has(Number(m.id)));
        }
      }
    }

    result.membersAdded = targetMembers.length;
    if (!targetMembers.length) return result;

    /* (3) صفوف الاشتراكات + عناصر الدفعة */
    const subRows = [];
    const itemRows = [];
    targetMembers.forEach((m) => {
      const typeId = m.membership_type_id == null ? null : Number(m.membership_type_id);
      const hasFee = typeId != null && Object.prototype.hasOwnProperty.call(feesByType, typeId);
      const amount = hasFee ? (Number(feesByType[typeId]) || 0) : 0;
      if (!hasFee) result.noFeeMembers += 1;

      subRows.push({
        member_id: Number(m.id),
        period_year: year,
        period_month: month,
        frequency: 'monthly',
        amount,
        paid_amount: 0,
        status: 'pending',
        // قيد CHECK على subscriptions يقبل ('cash', 'salary_deduction') فقط —
        // تُخزَّن المطالبة النقدية كـ 'cash' ولا يُخالف القيد.
        payment_method: isCash ? 'cash' : 'salary_deduction',
      });

      itemRows.push({
        batch_id: result.batchId,
        member_id: Number(m.id),
        employee_number: m.employee_number || '',
        full_name: m.full_name || '',
        /* الحزمة ج: employer_name من جهة العمل الأصلية للعضو (سجل تاريخي دقيق) —
           وليس من entityName (جهة الخصم)؛ group.employerName هو الـ fallback
           لأن المجموعة قد تضم أكثر من جهة عمل تشترك في جهة خصم واحدة */
        employer_name: isCash ? '' : (joinName(m.employers) || group.employerName || ''),
        primary_amount: amount,
        dependents_amount: 0,
        adjustments_amount: 0,
        total_amount: amount,
        dependents_count: 0,
        dependents_list: [],
        status: 'pending',
      });
    });

    const subStats = await insertSubscriptionsChunked(sb, subRows);
    result.subsCreated = subStats.created;
    result.subsExisting = subStats.existing;
    result.subsFailed = subStats.failed.length;

    /* (4) عناصر الدفعة (سطر لكل عضو — ما تعرضه نافذة تفاصيل الدفعة) */
    for (let i = 0; i < itemRows.length; i += BULK_CHUNK) {
      const chunk = itemRows.slice(i, i + BULK_CHUNK);
      const { error } = await sb.from('deduction_batch_items').insert(chunk);
      if (!error) {
        result.itemsCreated += chunk.length;
        continue;
      }
      console.error('[Baraka Membership] insertBatchItems error, retrying row-by-row:', error.message);
      for (const row of chunk) {
        const r = await sb.from('deduction_batch_items').insert(row);
        if (!r.error) result.itemsCreated += 1;
      }
    }

    /* (5) تحديث إجماليات الدفعة من العناصر الفعلية */
    try {
      const { data: allItems, error: itemsErr } = await sb
        .from('deduction_batch_items')
        .select('member_id, total_amount')
        .eq('batch_id', result.batchId)
        .limit(BULK_PAGE);
      if (!itemsErr && allItems) {
        const memberSet = new Set();
        let total = 0;
        allItems.forEach((it) => {
          memberSet.add(Number(it.member_id));
          total += Number(it.total_amount) || 0;
        });
        await sb
          .from('deduction_batches')
          .update({
            total_members: memberSet.size,
            total_amount: Math.round(total * 100) / 100,
          })
          .eq('id', result.batchId);
      }
    } catch (e) {
      console.warn('[Baraka Membership] batch totals update error:', e);
    }

    return result;
  }

  /* ═══════════════════════════════════════════════
     7) التنفيذ الكامل
     ═══════════════════════════════════════════════ */
  async function executeBulkBatch(year, month, scope, skipExisting) {
    if (BULK_RUNNING) {
      if (typeof toast === 'function') toast('جارٍ تنفيذ إجراء تجميعي بالفعل — انتظر الانتهاء.', 'error');
      return;
    }

    // القراءة من النموذج عند عدم تمرير القيم (الاستدعاء من الزر)
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    };
    if (year === undefined || year === null || year === '') year = Number(val('bulk-year'));
    if (month === undefined || month === null || month === '') month = Number(val('bulk-month'));
    if (!scope) scope = val('bulk-scope') || 'all';
    if (skipExisting === undefined || skipExisting === null) {
      const skipEl = document.getElementById('bulk-skip-existing');
      skipExisting = skipEl ? skipEl.checked : true;
    }

    console.log('[Baraka] executeBulkBatch called with:', { year, month, scope, skipExisting });

    const sb = membersSb();
    const errEl = document.getElementById('bulk-batch-error');
    const fail = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      if (typeof toast === 'function') toast(msg, 'error');
    };

    year = Number(year);
    month = Number(month);
    skipExisting = !!skipExisting;

    if (!sb) { fail('لا يوجد اتصال بقاعدة البيانات.'); return; }
    if (!year || year < 1900 || year > 2100 || !month || month < 1 || month > 12) {
      fail('السنة والشهر حقول إلزامية بقيم صالحة.');
      return;
    }
    if (!['all', 'employees', 'pension'].includes(scope)) scope = 'all';

    const btn = document.getElementById('btn-execute-bulk');
    BULK_RUNNING = true;
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التنفيذ…'; }
    resetBulkProgress();
    showBulkProgress(true);

    const summary = {
      members: 0,
      groups: 0,
      batchesCreated: 0,
      batchesReused: 0,
      subsCreated: 0,
      subsExisting: 0,
      subsFailed: 0,
      itemsCreated: 0,
      noFeeMembers: 0,
      failures: [],
    };

    try {
      /* 1) جلب الأعضاء */
      setBulkProgress(5, 'جارٍ جلب الأعضاء المستهدفين…');
      const members = await fetchMembersForBulk(scope, year, month);
      summary.members = members.length;
      console.log('[Baraka] fetchMembersForBulk →', members.length, 'members for scope:', scope);

      if (!members.length) {
        setBulkProgress(100, 'لا يوجد أعضاء مطابقون للنطاق المحدد.');
        if (typeof toast === 'function') toast('لا يوجد أعضاء مطابقون للنطاق المحدد', 'info');
        return;
      }

      /* 2) التحقق من التكرار */
      let existingBatches = [];
      if (skipExisting) {
        setBulkProgress(20, 'جارٍ التحقق من الدفعات والاشتراكات الموجودة…');
        existingBatches = await checkExistingBatches(year, month);
        console.log('[Baraka] existing batches for', year, month, '→', existingBatches.length);
      }

      /* 3) مبالغ الفترة + التجميع */
      setBulkProgress(35, 'جارٍ حساب المبالغ وتجميع الجهات…');
      const feesByType = await fetchMonthlyFeesByType(year, month);

      /* الحزمة ج: التجميع حسب deduction_entity_id مباشرة —
         لا حاجة لـ resolveDeductionEntity (العمود مضمون عبر المشغّل) */
      const { salaryGroups, cashMembers } = groupMembersByDeductionEntity(members);
      const groups = [];
      for (const g of salaryGroups) {
        if (!g.entityId) {
          console.warn('[Baraka] bulk: members without deduction_entity_id (pre-migration data?) for employer', g.employerId);
        }
        groups.push({
          key: g.entityId ? ('entity-' + g.entityId) : ('salary-emp-' + g.employerId),
          /* اسم جهة الخصم هو الأهم للخطاب/الدفعة — واسم جهة العمل fallback دفاعي */
          label: 'خصم رواتب — ' + (g.entityName || g.employerName),
          paymentMethod: 'salary_deduction',
          deductionEntityId: g.entityId,
          entityName: g.entityName,
          employerName: g.employerName, /* يُحفظ في عناصر الدفعة (سجل تاريخي) */
          members: g.members,
        });
      }
      if (cashMembers.length) {
        groups.push({
          key: 'cash',
          label: 'مطالبة نقدية — متقاعدون وخارج الخدمة',
          paymentMethod: 'cash_demand',
          deductionEntityId: null,
          entityName: '',
          employerName: '',
          members: cashMembers,
        });
      }
      summary.groups = groups.length;
      console.log('[Baraka] bulk groups →', groups.map((g) => `${g.key}(${g.members.length})`).join(', '));

      /* 4) إنشاء الدفعات والاشتراكات (كل مجموعة مستقلة — فشل أحدها لا يُسقط البقية) */
      const takenBatchNumbers = new Set(existingBatches.map((b) => b.batch_number).filter(Boolean));
      const seqCounter = { next: 1 };

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        setBulkProgress(
          40 + Math.round(55 * (i / groups.length)),
          `جارٍ معالجة: ${group.label} (${i + 1}/${groups.length})`
        );

        const result = await createBatchAndSubscriptions({
          sb, group, year, month, feesByType, skipExisting,
          existingBatches, seqCounter, takenBatchNumbers,
        });

        if (result.error) {
          summary.failures.push({ label: group.label, message: result.error });
          console.error('[Baraka Membership] bulk group failed:', group.key, result.error);
          continue;
        }

        if (result.batchCreated) summary.batchesCreated += 1;
        if (result.batchReused) summary.batchesReused += 1;
        summary.subsCreated += result.subsCreated;
        summary.subsExisting += result.subsExisting;
        summary.subsFailed += result.subsFailed;
        summary.itemsCreated += result.itemsCreated;
        summary.noFeeMembers += result.noFeeMembers;

        console.log('[Baraka] bulk group done:', group.key, JSON.stringify({
          batch: result.batchNumber,
          created: result.batchCreated,
          reused: result.batchReused,
          subs: result.subsCreated,
          items: result.itemsCreated,
        }));
      }

      /* 5) تحديث قوائم التبويب + النتائج النهائية */
      setBulkProgress(95, 'جارٍ تحديث القوائم…');
      loadBatches().catch((e) => console.error('[Baraka Membership] post-bulk loadBatches error:', e));
      loadSubscriptions().catch((e) => console.error('[Baraka Membership] post-bulk loadSubscriptions error:', e));

      const monthLabel = BULK_MONTHS_AR[month - 1] || month;
      const baseMsg = `تم إنشاء ${summary.batchesCreated} دفعة خصم و ${summary.subsCreated} اشتراك بنجاح`
        + (summary.batchesReused ? ` (مع إعادة استخدام ${summary.batchesReused} دفعة موجودة)` : '')
        + ` — ${monthLabel} ${year}.`;

      const warnParts = [];
      if (summary.subsExisting) warnParts.push(`تم تخطي ${summary.subsExisting} اشتراكًا موجودًا مسبقًا`);
      if (summary.noFeeMembers) warnParts.push(`تنبيه: ${summary.noFeeMembers} عضوًا بلا سعر مفصَّل (مبلغ 0)`);
      if (summary.subsFailed) warnParts.push(`فشل حفظ ${summary.subsFailed} اشتراك`);
      const warnText = warnParts.length ? ' — ' + warnParts.join(' · ') : '';

      if (summary.failures.length) {
        const failLines = summary.failures
          .slice(0, 5)
          .map((f) => `${f.label}: ${f.message}`)
          .join(' | ');
        setBulkProgress(100, baseMsg + warnText + ` — فشل ${summary.failures.length} من ${summary.groups} مجموعات: ${failLines}`);
        if (typeof toast === 'function') toast(baseMsg + ' لكن فشلت بعض المجموعات — راجع التفاصيل.', 'error');
        // تُبقي النافذة مفتوحة لعرض التفاصيل
      } else {
        setBulkProgress(100, baseMsg + warnText);
        closeBulkBatchModal();
        if (typeof toast === 'function') toast(baseMsg + warnText, 'success');
      }
    } catch (e) {
      console.error('[Baraka Membership] executeBulkBatch error:', e);
      const msg = (e && e.message === 'no_db')
        ? 'لا يوجد اتصال بقاعدة البيانات.'
        : 'تعذَّر تنفيذ الإجراء التجميعي — تحقَّق من الاتصال ثم أعد المحاولة.';
      setBulkProgress(100, msg);
      fail(msg);
    } finally {
      BULK_RUNNING = false;
      if (btn) { btn.disabled = false; btn.textContent = 'تنفيذ'; }
    }
  }

  function bindBatches() {
    const section = document.getElementById('tab-deductions');
    if (!section || section.dataset.batchesBound) return;
    section.dataset.batchesBound = '1';

    const search = document.getElementById('batches-search');
    const clear  = document.getElementById('batches-search-clear');

    if (search) {
      search.addEventListener('input', () => {
        if (clear) clear.hidden = !search.value;
        searchBatches(search.value);
      });

      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchBatches(search.value, true);
        }
        if (e.key === 'Escape') {
          search.value = '';
          if (clear) clear.hidden = true;
          searchBatches('', true);
        }
      });
    }

    if (clear) {
      clear.addEventListener('click', () => {
        if (search) { search.value = ''; search.focus(); }
        clear.hidden = true;
        searchBatches('', true);
      });
    }

    section.querySelectorAll('[data-batch-filter]').forEach((el) => {
      el.addEventListener('change', () => setBatchFilter(el.dataset.batchFilter, el.value));
    });

    const resetBtn = document.getElementById('btn-reset-batches-filters');
    if (resetBtn) resetBtn.addEventListener('click', resetBatchesFilters);

    const bulkBtn = document.getElementById('btn-bulk-batch');
    if (bulkBtn && !bulkBtn.dataset.bulkBatchOpenBound) {
      bulkBtn.dataset.bulkBatchOpenBound = '1';
      bulkBtn.addEventListener('click', openBulkBatchModal);
    }

    const executeBtn = document.getElementById('btn-execute-bulk');
    if (executeBtn && !executeBtn.dataset.bulkExecuteBound) {
      executeBtn.dataset.bulkExecuteBound = '1';
      executeBtn.addEventListener('click', () => { executeBulkBatch(); });
    }

    const exportBtn = document.getElementById('btn-export-batches');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => toast('تصدير الدفعات قيد الإنشاء', 'info'));
    }

    bindBatchModal();
    bindBatchesPagination();
  }

  bindBatchesPagination();

  STATE.deductionBatches.entitiesOptions = [];
  STATE.deductionBatches.entitiesOptionsLoaded = false;

  /* ═══════════════════════════════════════════════
     نافذة عرض / تعديل دفعة الخصم
     ═══════════════════════════════════════════════ */
  let BATCH_EDIT = { id: null, readOnly: false, row: null };

  async function loadBatchEntitiesOptions() {
    const s = STATE.deductionBatches;
    const sb = membersSb();
    if (!sb) return;

    if (s.entitiesOptionsLoaded) {
      fillBatchEntitySelect();
      return;
    }

    try {
      /* الحزمة ج: employer_id + is_self + اسم جهة العمل المالكة —
         للتجميع بـ optgroup وتمييز الصفوف الذاتية */
      const { data, error } = await sb
        .from('deduction_entities')
        .select('id, name, employer_id, is_self, employers:employer_id ( id, name )')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;

      s.entitiesOptions = (data || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'ar')
      );
      s.entitiesOptionsLoaded = true;

      fillBatchEntitySelect();
    } catch (e) {
      console.warn('[Baraka Membership] loadBatchEntitiesOptions error:', e);
    }
  }

  function fillBatchEntitySelect() {
    const el = document.getElementById('batch-entity');
    if (!el) return;

    const current = el.value;
    const options = STATE.deductionBatches.entitiesOptions || [];

    /* الحزمة ج: تجميع الخيارات بـ <optgroup> حسب جهة العمل المالكة —
       ينظم القائمة بعد تضاعفها (صف ذاتي لكل جهة عمل + الفروع) */
    const NO_EMPLOYER = '— بدون جهة عمل —';
    const groupsMap = new Map();
    options.forEach((entity) => {
      const employerName = joinName(entity.employers)
        || (entity.employer_id ? ('جهة العمل #' + entity.employer_id) : NO_EMPLOYER);
      if (!groupsMap.has(employerName)) groupsMap.set(employerName, []);
      groupsMap.get(employerName).push(entity);
    });

    const groupNames = Array.from(groupsMap.keys()).sort((a, b) =>
      String(a).localeCompare(String(b), 'ar')
    );

    const optionHtml = (entity) => {
      /* الصف الذاتي داخل مجموعته: الترتيب أولًا + شارة نصية واضحة */
      const selfBadge = entity.is_self === true ? ' (الجهة نفسها)' : '';
      return '<option value="' + esc(entity.id) + '">'
        + esc((entity.name || 'بدون اسم') + selfBadge)
        + '</option>';
    };

    el.innerHTML =
      '<option value="">— بدون (مطالبة نقدية) —</option>'
      + groupNames.map((gName) => {
          const list = groupsMap.get(gName).slice().sort((a, b) => {
            /* الصف الذاتي أولًا ثم الفروع أبجديًا */
            if (!!a.is_self !== !!b.is_self) return a.is_self ? -1 : 1;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
          });
          return '<optgroup label="' + esc(gName) + '">'
            + list.map(optionHtml).join('')
            + '</optgroup>';
        }).join('');

    if (current) el.value = current;
  }

  async function getBatchById(id) {
    const batchId = Number(id) || 0;
    if (!batchId) return null;

    const cached = STATE.deductionBatches.list.find(
      (row) => Number(row.id) === batchId
    );

    if (cached) return cached;

    const sb = membersSb();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('deduction_batches')
        .select(BATCH_SELECT)
        .eq('id', batchId)
        .maybeSingle();

      if (error) throw error;

      return data || null;
    } catch (e) {
      console.warn('[Baraka Membership] getBatchById error:', e);
      return null;
    }
  }

  async function getBatchItems(batchId) {
    const sb = membersSb();
    const id = Number(batchId) || 0;

    if (!sb || !id) return [];

    const { data, error } = await sb
      .from('deduction_batch_items')
      .select([
        'id',
        'batch_id',
        'member_id',
        'employee_number',
        'full_name',
        'primary_amount',
        'dependents_amount',
        'total_amount',
        'dependents_count',
        'dependents_list',
      ].join(', '))
      .eq('batch_id', id)
      .order('id', { ascending: true });

    if (error) throw error;

    return data || [];
  }

  function renderBatchItemsTable(items) {
    const tbody = document.getElementById('batch-items-tbody');
    if (!tbody) return;

    if (!items || !items.length) {
      tbody.innerHTML =
        '<tr>'
        + '<td colspan="6" class="member-muted">لا توجد عناصر</td>'
        + '</tr>';
      return;
    }

    tbody.innerHTML = items.map((item, index) => {
      const dependentsCount = Number(item.dependents_count);
      const dependentsList = Array.isArray(item.dependents_list)
        ? item.dependents_list
        : [];

      const count = Number.isFinite(dependentsCount)
        ? dependentsCount
        : dependentsList.length;

      return ''
        + '<tr>'
        +   '<td data-label="#">'
        +     esc(fmtNum(index + 1))
        +   '</td>'
        +   '<td data-label="الاسم">'
        +     esc(item.full_name || '—')
        +   '</td>'
        +   '<td data-label="الرقم الوظيفي">'
        +     esc(item.employee_number || '—')
        +   '</td>'
        +   '<td data-label="المبلغ الأساسي">'
        +     esc(fmtMoney(item.primary_amount))
        +   '</td>'
        +   '<td data-label="المنتسبون">'
        +     esc(fmtNum(count))
        +   '</td>'
        +   '<td data-label="الإجمالي">'
        +     esc(fmtMoney(item.total_amount))
        +   '</td>'
        + '</tr>';
    }).join('');
  }

  async function openBatchModal(id, opts) {
    const modal = document.getElementById('batch-modal');
    if (!modal) return;

    const batchId = Number(id) || 0;
    const data = batchId ? await getBatchById(batchId) : null;

    if (batchId && !data) {
      toast('تعذَّر تحميل بيانات الدفعة', 'error');
      return;
    }

    BATCH_EDIT = {
      id: batchId || null,
      readOnly: !!(opts && opts.readOnly),
      row: data || null,
    };

    await loadBatchEntitiesOptions();

    const now = new Date();

    setVal('batch-id', data ? data.id : '');
    setVal('batch-number', data ? data.batch_number || '' : '');
    setVal('batch-year', data ? data.period_year : now.getFullYear());
    setVal('batch-month', data ? data.period_month : now.getMonth() + 1);
    setVal('batch-method',
      data ? data.payment_method || 'salary_deduction' : 'salary_deduction');
    setVal('batch-entity', data ? data.deduction_entity_id || '' : '');
    setVal('batch-status', data ? data.status || 'draft' : 'draft');
    setVal('batch-notes', data ? data.notes || '' : '');

    let items = [];

    if (batchId) {
      try {
        items = await getBatchItems(batchId);
      } catch (e) {
        console.warn('[Baraka Membership] getBatchItems error:', e);
        toast('تعذَّر تحميل عناصر الدفعة', 'error');
      }
    }

    renderBatchItemsTable(items);

    const title = document.getElementById('batch-modal-title');
    if (title) {
      title.textContent = BATCH_EDIT.readOnly
        ? 'تفاصيل الدفعة'
        : (BATCH_EDIT.id ? 'تعديل الدفعة' : 'دفعة جديدة');
    }

    document
      .querySelectorAll('#batch-form input, #batch-form select, #batch-form textarea')
      .forEach((el) => { el.disabled = BATCH_EDIT.readOnly; });

    const saveBtn = document.getElementById('btn-save-batch');
    if (saveBtn) saveBtn.hidden = BATCH_EDIT.readOnly;

    const errorEl = document.getElementById('batch-form-error');
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    modal.classList.remove('hidden');

    const first = document.getElementById('batch-number');
    if (first && !BATCH_EDIT.readOnly) first.focus();
  }

  function closeBatchModal() {
    const modal = document.getElementById('batch-modal');
    if (modal) modal.classList.add('hidden');

    BATCH_EDIT = { id: null, readOnly: false, row: null };
  }

  function onBatchesTableClick(e) {
    const btn = e.target.closest('[data-batch-action]');
    if (!btn) return;

    const id = Number(btn.dataset.batchId) || 0;
    if (!id) return;

    const action = btn.dataset.batchAction;

    if (action === 'view') openBatchModal(id, { readOnly: true });
    if (action === 'edit') openBatchModal(id);
  }

  function bindBatchModal() {
    const tbody = document.getElementById('batches-tbody');

    if (tbody && !tbody.dataset.batchModalBound) {
      tbody.dataset.batchModalBound = '1';
      tbody.addEventListener('click', onBatchesTableClick);
    }

    const addBtn = document.getElementById('btn-add-batch');
    if (addBtn && !addBtn.dataset.batchAddBound) {
      addBtn.dataset.batchAddBound = '1';
      addBtn.addEventListener('click', () => openBatchModal(null));
    }

    const emptyAdd = document.querySelector('#batches-empty [data-batch-action="add"]');
    if (emptyAdd && !emptyAdd.dataset.batchEmptyBound) {
      emptyAdd.dataset.batchEmptyBound = '1';
      emptyAdd.addEventListener('click', () => openBatchModal(null));
    }

    const modal = document.getElementById('batch-modal');

    if (modal && !modal.dataset.batchBackdropBound) {
      modal.dataset.batchBackdropBound = '1';
      modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-batch-modal]')) {
          closeBatchModal();
        }
      });
    }

    if (!document.body.dataset.batchEscapeBound) {
      document.body.dataset.batchEscapeBound = '1';
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
          closeBatchModal();
        }
      });
    }

    const saveBtn = document.getElementById('btn-save-batch');
    if (saveBtn && !saveBtn.dataset.batchSaveBound) {
      saveBtn.dataset.batchSaveBound = '1';
      saveBtn.addEventListener('click', saveBatch);
    }
  }

  async function saveBatch() {
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    const value = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    };

    const errorEl = document.getElementById('batch-form-error');
    const fail = (message) => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
      toast(message, 'error');
    };

    const batchNumber = value('batch-number');
    const year = Number(value('batch-year')) || 0;
    const month = Number(value('batch-month')) || 0;
    const method = value('batch-method');
    const entityId = Number(value('batch-entity')) || null;
    const status = value('batch-status') || 'draft';
    const notes = value('batch-notes');

    if (!batchNumber || !year || !month || !method) {
      fail('رقم الدفعة والسنة والشهر والنوع حقول إلزامية.');
      return;
    }

    if (method === 'salary_deduction' && !entityId) {
      fail('جهة الخصم إلزامية في دفعات خصم الراتب.');
      return;
    }

    const payload = {
      batch_number: batchNumber,
      period_year: year,
      period_month: month,
      payment_method: method,
      deduction_entity_id: entityId,
      status,
      notes,
    };

    try {
      let result;

      if (BATCH_EDIT.id) {
        result = await sb
          .from('deduction_batches')
          .update(payload)
          .eq('id', BATCH_EDIT.id);
      } else {
        result = await sb
          .from('deduction_batches')
          .insert(payload);
      }

      if (result.error) throw result.error;

      toast(
        BATCH_EDIT.id ? 'تم تعديل الدفعة بنجاح' : 'تم حفظ الدفعة بنجاح',
        'success'
      );

      closeBatchModal();
      await loadBatches();
    } catch (e) {
      console.error('[Baraka Membership] saveBatch error:', e);
      fail(
        e && e.code === '23505'
          ? 'رقم الدفعة مستخدم مسبقًا.'
          : 'تعذَّر حفظ الدفعة — تحقَّق من المدخلات.'
      );
    }
  }

  bindBatchModal();

  /* ═══════════════════════════════════════════════
     ربط البحث والفلاتر — تبويب الاشتراكات
     ═══════════════════════════════════════════════ */

  function searchSubs(value, immediate) {
    const term = String(value || '').trim();

    const run = () => {
      STATE.subscriptions.filters.q = term;
      STATE.subscriptions.page = 1;
      loadSubscriptions();
    };

    clearTimeout(STATE.subscriptions.searchTimer);
    if (immediate === true) run();
    else STATE.subscriptions.searchTimer = setTimeout(run, 300);
  }

  function setSubFilter(key, value) {
    STATE.subscriptions.filters[key] = (value === null || value === undefined) ? '' : String(value);
    STATE.subscriptions.page = 1;
    loadSubscriptions();
  }

  function resetSubsFilters() {
    const s = STATE.subscriptions;
    s.filters = { q: '', period_year: '', period_month: '', status: '', payment_method: '' };
    s.page = 1;

    const search = document.getElementById('subs-search');
    if (search) search.value = '';

    const clear = document.getElementById('subs-search-clear');
    if (clear) clear.hidden = true;

    document.querySelectorAll('#tab-subscriptions [data-sub-filter]').forEach((el) => { el.value = ''; });

    renderSubsActiveFilters();
    loadSubscriptions();
  }

  async function fetchSubsForExport() {
    const s = STATE.subscriptions;
    const sb = membersSb();
    const limit = 10000;

    const term = sanitizeSearch(s.filters.q);
    const memberIds = term ? await findSubMemberIds(term) : null;

    let query = sb
      .from('subscriptions')
      .select(SUB_SELECT)
      .order('period_year',  { ascending: false })
      .order('period_month', { ascending: false })
      .order('id',           { ascending: false })
      .range(0, limit - 1);

    query = applySubFilters(query, memberIds);

    const { data, error } = await query;
    if (error) throw error;

    return { list: data || [] };
  }

  async function exportSubsExcel() {
    if (typeof XLSX === 'undefined') {
      toast('مكتبة Excel غير محمّلة — أعد تحميل الصفحة', 'error');
      return;
    }
    const sb = membersSb();
    if (!sb) { toast('لا يوجد اتصال بقاعدة البيانات', 'error'); return; }

    try {
      const { list } = await fetchSubsForExport();
      if (!list.length) { toast('لا توجد بيانات مطابقة للتصدير', 'info'); return; }

      const rows = list.map((sub, i) => {
        const member = sub.members || {};
        const amount = Number(sub.amount) || 0;
        const paid   = Number(sub.paid_amount) || 0;

        return {
          '#':              i + 1,
          'رقم العضوية':   member.member_number || '',
          'الاسم':          member.full_name || '',
          'السنة':          sub.period_year || '',
          'الشهر':          SUB_MONTHS_AR[(Number(sub.period_month) || 0) - 1] || '',
          'النوع':          SUB_FREQUENCY[sub.frequency] || sub.frequency || '',
          'المبلغ':         amount,
          'المدفوع':        paid,
          'المتبقي':        Math.max(0, amount - paid),
          'الحالة':         (SUB_STATUS[sub.status] || {}).label || sub.status || '',
          'طريقة الدفع':    SUB_METHOD[sub.payment_method] || '',
          'رقم السند':      sub.receipt_number || '',
          'ملاحظات':        sub.notes || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 },  { wch: 14 }, { wch: 30 }, { wch: 8 },  { wch: 10 },
        { wch: 8 },  { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 14 }, { wch: 28 },
      ];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الاشتراكات');
      XLSX.writeFile(wb, 'الاشتراكات-' + new Date().toISOString().slice(0, 10) + '.xlsx', { bookType: 'xlsx' });

      toast('تم تصدير ' + fmtNum(rows.length) + ' اشتراكًا إلى ملف Excel', 'success');
    } catch (e) {
      console.error('[Baraka Membership] exportSubsExcel error:', e);
      toast('تعذَّر تصدير البيانات', 'error');
    }
  }

  function bindSubs() {
    const section = document.getElementById('tab-subscriptions');
    if (!section || section.dataset.subsBound) return;
    section.dataset.subsBound = '1';

    const search = document.getElementById('subs-search');
    const clear  = document.getElementById('subs-search-clear');

    if (search) {
      search.addEventListener('input', () => {
        if (clear) clear.hidden = !search.value;
        searchSubs(search.value);
      });

      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchSubs(search.value, true);
        }
        if (e.key === 'Escape') {
          search.value = '';
          if (clear) clear.hidden = true;
          searchSubs('', true);
        }
      });
    }

    if (clear) {
      clear.addEventListener('click', () => {
        if (search) { search.value = ''; search.focus(); }
        clear.hidden = true;
        searchSubs('', true);
      });
    }

    section.querySelectorAll('[data-sub-filter]').forEach((el) => {
      el.addEventListener('change', () => setSubFilter(el.dataset.subFilter, el.value));
    });

    const resetBtn = document.getElementById('btn-reset-subs-filters');
    if (resetBtn) resetBtn.addEventListener('click', resetSubsFilters);

    const bulkSubBtn = document.getElementById('btn-bulk-sub');
    if (bulkSubBtn && !bulkSubBtn.dataset.bulkSubOpenBound) {
      bulkSubBtn.dataset.bulkSubOpenBound = '1';
      bulkSubBtn.addEventListener('click', () => {
        // نافذة الإجراء التجميعي داخل تبويب الدفعات — يجب إظهاره أولًا
        // وإلا بقيت النافذة مخفية (الأب يحمل hidden).
        if (typeof showTab === 'function') showTab('deductions');
        openBulkBatchModal();
      });
    }

    const exportBtn = document.getElementById('btn-export-subs');
    if (exportBtn) exportBtn.addEventListener('click', exportSubsExcel);
  }

  /* ═══════════════════════════════════════════════
     ربط الفلاتر فور تحميل DOM
     ═══════════════════════════════════════════════ */
  bindMembersFilters();
  bindEmployers();
  bindDeductionEntities();
  bindSubs();
  bindBatches();
  // تأكيد ربط زر + جهة ونافذة الجهة السريعة حتى لو فشل bindMembersFilters مبكرًا
  try { bindMemberStatusListener(); } catch (e) { console.warn('[Baraka] bindMemberStatusListener error', e); }
  try { bindQuickEmployerModal(); } catch (e) { console.warn('[Baraka] bindQuickEmployerModal error', e); }
  try { bindQuickEmployerTrigger(); } catch (e) { console.warn('[Baraka] bindQuickEmployerTrigger error', e); }
  /* الحزمة أ: ربط نافذة جهات الاستحقاق التابعة */
  try { bindSubEntitiesModal(); } catch (e) { console.warn('[Baraka] bindSubEntitiesModal error', e); }
  // ربط نافذة bulk-batch-modal أيضًا
  try {
    const bulkModal = document.getElementById('bulk-batch-modal');
    if (bulkModal && !bulkModal.dataset.bulkBound) {
      bulkModal.dataset.bulkBound = '1';
      bulkModal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-bulk-batch]')) {
          if (typeof closeBulkBatchModal === 'function') closeBulkBatchModal();
          else bulkModal.classList.add('hidden');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !bulkModal.classList.contains('hidden')) {
          if (typeof closeBulkBatchModal === 'function') closeBulkBatchModal();
          else bulkModal.classList.add('hidden');
        }
      });
    }
  } catch (e) { console.warn('[Baraka] bulk-batch bind error', e); }

  /* ═══════════════════════════════════════════════
     API عام للوحدات الفرعية
     ═══════════════════════════════════════════════ */
  window.MembershipApp = {
    STATE,
    showTab,
    refreshDashboard: loadDashboardData,

    /* ─ تبويب الأعضاء ─ */
    loadMembers,
    renderMembersTable,
    renderMembersPagination,
    bindMembersFilters,
    searchMembers,
    resetMembersFilters,
    setMemberFilter,
    goToMembersPage,
    openMemberModal,
    closeMemberModal,
    exportMembersExcel,
    importMembersExcel,
    /* الحزمة ب: Cascading قائمة جهة الخصم */
    invalidateDeductionEntitiesOptions,
    fillMemberDeductionEntitySelect,

    /* ─ تبويب الاشتراكات ─ */
    loadSubscriptions,
    renderSubsTable,
    renderSubsSummary,
    renderSubsPagination,
    bindSubs,
    searchSubs,
    resetSubsFilters,
    setSubFilter,
    goToSubsPage,
    openSubModal,
    closeSubModal,
    saveSubscription,
    deleteSubscription,
    openPaymentModal,
    exportSubsExcel,

    /* ─ تبويب دفعات الخصم ─ */
    loadBatches,
    fetchBatchesPage,
    applyBatchFilters,
    renderBatchesTable,
    renderBatchRowHtml,
    renderBatchesSummary,
    renderBatchesPagination,
    renderBatchesMeta,
    renderBatchesActiveFilters,
    bindBatches,
    searchBatches,
    setBatchFilter,
    resetBatchesFilters,
    goToBatchesPage,
    openBulkBatchModal,
    closeBulkBatchModal,
    executeBulkBatch,
    fetchMembersForBulk,
    checkExistingSubscriptions,
    checkExistingBatches,
    /* الحزمة ج: التجميع حسب جهة الخصم (بديل groupMembersByEmployer/resolveDeductionEntity) */
    groupMembersByDeductionEntity,
    generateBatchNumber,
    fetchMonthlyFeesByType,
    createBatchAndSubscriptions,

    /* ─ تبويب جهات العمل ─ */
    loadEmployers,
    renderEmployersTable,
    searchEmployers,
    setEmployerFilter,
    resetEmployersFilters,
    openEmployerModal,
    closeEmployerModal,
    saveEmployer,
    deleteEmployer,
    bindEmployers,

    /* ─ الحزمة أ: نافذة جهات الاستحقاق التابعة ─ */
    openSubEntitiesModal,
    closeSubEntitiesModal,
    loadSubEntities,

    /* ─ تبويب جهات الخصم ─ */
    loadDeductionEntities,
    renderDeductionEntitiesTable,
    searchDeductionEntities,
    setEntityFilter,
    resetDeductionEntitiesFilters,
    openEntityModal,
    closeEntityModal,
    saveEntity,
    deleteEntity,
    bindDeductionEntities,

    toast: (typeof toast === 'function') ? toast : (msg) => alert(msg),
    getSupabase: () => (typeof supabaseClient !== 'undefined' ? supabaseClient : null),
    getUser: () => STATE.user,
    getSettings: () => STATE.settings,
  };

  /* ═══════════════════════════════════════════════
     بدء التشغيل
     ═══════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
// ═══════════ نهاية الملف ═══════════