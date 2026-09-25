/**
 * app.js — المنطق الرئيسي للوحة التحكم (Option B)
 * الشريط الجانبي: مجموعات قابلة للطي (Accordion) تُبنى ديناميكيًا من MODULES (9 وحدات) بعد فلترة الصلاحيات.
 * الشريط العلوي: يحتوي على أيقونات TOPBAR_ICONS مع شارات التنبيهات.
 * التبويبات الفرعية: تُدار ديناميكيًا عبر MODULE_TABS.
 */

const USER = currentUser();
if (!USER && window.location.pathname.includes('dashboard')) {
  window.location.replace('index.html');
}

let activeTab = 'dashboard';
let settingsDraft = null;
const usersView = { search: '', role: 'all', status: 'all' };
let editingUser = null;           // 'new' | object
let matrixDraft = null;
let matrixRole = 'chairman';
let matrixDirty = false;

/* ═══════════════ الشريط الجانبي (يُبنى من جدول modules — 9 وحدات) ═══════════════ */
function buildSidebar() {
  const nav = document.getElementById('modules-nav');
  if (!nav) return;
  const modules = visibleModules(USER.role);

  /* تقسيم الوحدات إلى مجموعات بترتيبها: operations ثم administration */
  const sections = [];
  modules.forEach((m) => {
    const last = sections[sections.length - 1];
    if (m.group && last && last.type === 'group' && last.key === m.group) last.items.push(m);
    else if (m.group) sections.push({ type: 'group', key: m.group, title: MODULE_GROUPS[m.group]?.name || m.group, items: [m] });
    else sections.push({ type: 'single', key: m.key, items: [m] });
  });

  /* قالب عنصر تنقل واحد */
  const navItem = (m) => {
    const under = m.status === 'under_construction';
    return `
            <li>
              <button type="button" data-tab="${m.key}" aria-current="${activeTab === m.key ? 'page' : 'false'}"
                class="nav-item flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition-all duration-200
                       ${activeTab === m.key ? 'bg-white/[0.07] text-gold-200 border-s-2 border-gold-500' : 'text-navy-200 hover:bg-white/5 hover:text-white'}
                       ${under && activeTab !== m.key ? 'opacity-45' : ''}">
                <span class="${activeTab === m.key ? 'text-gold-400' : 'text-navy-400'}">${icon(m.icon, 17)}</span>
                <span class="flex-1 text-start leading-tight">${m.name}</span>
                ${under ? '<span class="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-extrabold text-gold-400 whitespace-nowrap"><span class="b-dot"></span>قيد الإنشاء</span>' : ''}
              </button>
            </li>`;
  };

  nav.innerHTML = sections.map((s) => {
    if (s.type === 'single') {
      return `
    <div class="mt-2">
      <ul class="space-y-0.5 pt-1">
        ${s.items.map(navItem).join('')}
      </ul>
    </div>`;
    }
    return `
    <div class="mb-2">
      <button type="button" data-group-toggle="${s.key}" aria-expanded="true" aria-controls="group-${s.key}"
        class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-black tracking-wider text-gold-500/90 hover:text-gold-300 transition-colors">
        <span class="flex items-center gap-2">
          <span class="inline-block h-1.5 w-1.5 rotate-45 bg-gold-500" aria-hidden="true"></span>
          ${s.title}
        </span>
        <span class="chevron-wrap transition-transform duration-300">${icon('chevron', 14)}</span>
      </button>
      <div id="group-${s.key}" class="collapse-grid"><div>
        <ul class="space-y-0.5 pt-1">
          ${s.items.map(navItem).join('')}
        </ul>
      </div></div>
    </div>`;
  }).join('');

  /* طي/فتح المجموعات (Accordion) */
  nav.querySelectorAll('[data-group-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById('group-' + btn.dataset.groupToggle);
      const closed = panel.classList.toggle('closed');
      btn.setAttribute('aria-expanded', String(!closed));
      btn.querySelector('.chevron-wrap').style.transform = closed ? 'rotate(-90deg)' : 'rotate(0deg)';
    });
  });

  /* اختيار التبويب */
  nav.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showTab(btn.dataset.tab);
      if (window.innerWidth < 1024) toggleSidebar();
    });
  });
}

/* ═══════════════ الشريط العلوي (Topbar Icons) ═══════════════ */
function buildTopbar() {
  const container = document.getElementById('topbar-icons');
  if (!container) return;
  const icons = getTopbarIcons();
  container.innerHTML = icons.map((ic) => `
    <button class="topbar-icon relative rounded-xl border border-navy-100 bg-white p-2.5 text-navy-600 transition-all hover:bg-gold-50 hover:text-gold-700 hover:border-gold-300" data-icon="${ic.key}" title="${ic.name}" aria-label="${ic.name}">
      ${icon(ic.icon, 19)}
      ${ic.show_badge ? '<span class="badge absolute -top-1 -end-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white shadow">3</span>' : ''}
    </button>
  `).join('');

  container.querySelectorAll('.topbar-icon').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.icon;
      const ic = icons.find((i) => i.key === key);
      if (ic && ic.url) {
        window.location.href = ic.url;
      } else {
        toast(`وحدة "${ic?.name || key}" قيد الإنشاء`);
      }
    });
  });
}

/* ═══════════════ التبويبات الفرعية (Module Tabs) ═══════════════ */
function buildModuleTabs(moduleKey) {
  const tabs = getModuleTabs(moduleKey);
  if (!tabs.length) return '';
  return `
    <div class="module-tabs flex flex-wrap gap-2 border-b border-navy-200/80 pb-3" data-module="${moduleKey}" role="tablist">
      ${tabs.map((t, i) => `
        <button class="module-tab inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-extrabold transition-all duration-200
                ${i === 0 ? 'active border-navy-900 bg-navy-900 text-gold-100 shadow-md' : 'border-navy-200 bg-white text-navy-600 hover:border-gold-500 hover:text-navy-900'}"
                data-tab="${t.key}"
                role="tab"
                aria-selected="${i === 0}">
          <span>${t.name}</span>
          ${t.status === 'under_construction' ? '<span class="uc-badge inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-extrabold text-gold-800"><span class="b-dot"></span>قيد الإنشاء</span>' : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function handleModuleTabClick(moduleKey, tabKey) {
  // حدّث الزر النشط
  const container = document.querySelector(`.module-tabs[data-module="${moduleKey}"]`);
  if (container) {
    container.querySelectorAll('.module-tab').forEach((btn) => {
      const isActive = btn.dataset.tab === tabKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        btn.className = 'module-tab active inline-flex items-center gap-2 rounded-xl border border-navy-900 bg-navy-900 px-4 py-2 text-sm font-extrabold text-gold-100 shadow-md transition-all duration-200';
      } else {
        btn.className = 'module-tab inline-flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-extrabold text-navy-600 hover:border-gold-500 hover:text-navy-900 transition-all duration-200';
      }
    });
  }

  // اعرض محتوى التبويب
  const contentHost = document.getElementById(`${moduleKey}-content`);
  if (!contentHost) return;
  const tab = getModuleTabs(moduleKey).find((t) => t.key === tabKey);
  if (!tab) return;

  if (tab.status === 'under_construction') {
    contentHost.innerHTML = `
      <div class="empty-state mt-6 rounded-2xl border-2 border-dashed border-navy-200 bg-white p-8 text-center shadow-xl shadow-navy-900/5 sm:p-12 fade-up">
        <div class="empty-icon mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-navy-200 bg-gold-50 text-gold-600">
          ${icon('spark', 40)}
        </div>
        <h3 class="mt-5 font-display text-xl font-black text-navy-900">${tab.name}</h3>
        <p class="mt-2 text-sm font-medium text-navy-500">هذه الوحدة قيد الإنشاء ضمن خطة التطوير والتفعيل القادمة.</p>
        <span class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-extrabold text-gold-800"><span class="b-dot"></span>قيد الإنشاء</span>
      </div>
    `;
  } else {
    // التبويب الفعّال (association_profile) — اعرض نموذج الإعدادات
    if (moduleKey === 'settings_maintenance' && tabKey === 'association_profile') {
      contentHost.innerHTML = '';
      renderSettingsForm(contentHost);
    } else {
      contentHost.innerHTML = '';
    }
  }
}

function bindModuleTabsEvents(moduleKey) {
  const container = document.querySelector(`.module-tabs[data-module="${moduleKey}"]`);
  if (!container) return;
  container.querySelectorAll('.module-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleModuleTabClick(moduleKey, btn.dataset.tab);
    });
  });
}

/* ═══════════════ التبويبات الرئيسية (showTab) ═══════════════ */
function showTab(key) {
  // ⭐ إعادة توجيه تبويب شؤون العضوية
  if (key === 'membership_affairs') {
    window.location.href = 'modules/membership/membership.html';
    return;
  }
  
  activeTab = key;
  const mod = MODULES.find((m) => m.key === key);
  document.getElementById('page-title').textContent = mod ? mod.name : 'بركة';

  /* تحديث حالة الروابط في القائمة الجانبية */
  document.querySelectorAll('#modules-nav [data-tab]').forEach((b) => {
    const isActive = b.dataset.tab === key;
    const under = MODULES.find((m) => m.key === b.dataset.tab)?.status === 'under_construction';
    b.className = `nav-item flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition-all duration-200
      ${isActive ? 'bg-white/[0.07] text-gold-200 border-s-2 border-gold-500' : 'text-navy-200 hover:bg-white/5 hover:text-white'}
      ${under && !isActive ? 'opacity-45' : ''}`;
    b.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  /* التبديل بين الأقسام الرئيسية */
  const knownTabs = ['dashboard', 'membership_affairs', 'settings_maintenance', 'users'];
  knownTabs.forEach((k) => {
    const el = document.getElementById('tab-' + k);
    if (el) el.classList.toggle('hidden', k !== key);
  });
  const genericEl = document.getElementById('tab-generic');
  if (genericEl) {
    genericEl.classList.toggle('hidden', knownTabs.includes(key));
  }

  /* معالجة شؤون العضوية */
  if (key === 'membership_affairs') {
    const tabsHost = document.getElementById('membership_affairs-tabs');
    if (tabsHost) tabsHost.innerHTML = buildModuleTabs('membership_affairs');
    handleModuleTabClick('membership_affairs', 'members');
    bindModuleTabsEvents('membership_affairs');
  }

  /* معالجة الإعدادات والصيانة */
  if (key === 'settings_maintenance') {
    const tabsHost = document.getElementById('settings_maintenance-tabs');
    if (tabsHost) tabsHost.innerHTML = buildModuleTabs('settings_maintenance');
    handleModuleTabClick('settings_maintenance', 'association_profile');
    bindModuleTabsEvents('settings_maintenance');
  }

  /* وحدات العمليات الأخرى قيد الإنشاء */
  if (!knownTabs.includes(key) && mod) {
    renderUnderConstruction(mod);
  }
}

function renderUnderConstruction(mod) {
  const host = document.getElementById('tab-generic');
  if (!host) return;
  const steps = ['تصميم الشاشات واعتمادها', 'ربط الجداول بقاعدة Supabase', 'تفعيل الصلاحيات والتدقيق'];
  host.innerHTML = `
    <div class="mx-auto max-w-2xl fade-up">
      <div class="rounded-2xl border-2 border-navy-100 bg-white p-8 text-center shadow-xl shadow-navy-900/5 sm:p-12">
        <div class="relative mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-dashed border-navy-200 bg-gold-50 text-gold-600">
          ${icon(mod.icon, 40)}
          <span class="absolute -bottom-2 -left-2 inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-extrabold text-gold-800 shadow"><span class="b-dot"></span>قيد الإنشاء</span>
        </div>
        <h2 class="mt-6 text-2xl font-black text-navy-900 sm:text-3xl">${mod.name}</h2>
        <p class="mx-auto mt-3 max-w-md text-[15px] font-medium leading-relaxed text-navy-500">${mod.plan || 'هذه الوحدة ضمن خطة التطوير القادمة لمنصة بركة.'}</p>
        <div class="mt-8 rounded-xl border border-navy-100 p-5 text-start">
          <p class="mb-4 text-xs font-black tracking-wider text-navy-400">مراحل التنفيذ المقررة</p>
          <ol class="space-y-3.5">
            ${steps.map((s, i) => `
              <li class="flex items-center gap-3">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-navy-900 text-gold-200' : 'bg-gold-50 text-gold-700'}">${i === 0 ? icon('check', 13) : i + 1}</span>
                <span class="text-sm font-bold ${i === 0 ? 'text-navy-900' : 'text-navy-500'}">${s}</span>
              </li>`).join('')}
          </ol>
        </div>
        <div class="skeleton mx-auto mt-8 h-11 w-44 rounded-md"></div>
        <p class="mt-3 text-xs font-bold text-navy-400">زر التشغيل سيُفعَّل عند اكتمال الوحدة</p>
      </div>
    </div>`;
}

/* ═══════════════ الشريط العلوي والعلامة التجارية ═══════════════ */
function refreshBrand() {
  const s = loadSettings();
  const brandHtml = s.logo_url
    ? `<img src="${s.logo_url}" alt="شعار ${s.association_name}" class="h-11 w-11 rounded-xl object-cover border border-black/10">`
    : `<span class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 font-black text-xl text-navy-950">${(s.association_name.trim().charAt(0)) || 'ب'}</span>`;
  const side = document.getElementById('sidebar-brand');
  const top = document.getElementById('assoc-name');
  if (side) side.innerHTML = brandHtml;
  if (top) top.textContent = s.association_name;
  const sideName = document.getElementById('sidebar-assoc-name');
  if (sideName) sideName.textContent = s.association_name;
  const cur = document.getElementById('dash-currency');
  if (cur) cur.textContent = s.currency;
}

function initTopbar() {
  refreshBrand();
  buildTopbar();
  document.getElementById('user-name').textContent = USER.full_name;
  document.getElementById('user-role').textContent = ROLE_LABELS[USER.role];
  document.getElementById('date-hijri').textContent = hijriToday();
  document.getElementById('date-gregorian').textContent = gregorianToday();
  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.textContent = USER.full_name.charAt(0);
  setInterval(() => {
    document.getElementById('date-hijri').textContent = hijriToday();
    document.getElementById('date-gregorian').textContent = gregorianToday();
  }, 60000);
}

/* ═══════════════ نموذج الإعدادات (بيانات المنشأة) ═══════════════ */
function renderSettingsForm(container) {
  settingsDraft = { ...loadSettings() };
  const s = settingsDraft;

  container.innerHTML = `
    <div class="fade-up space-y-6 mt-6">
      <!-- الشعار -->
      <div class="rounded-2xl border-2 border-navy-100 bg-white p-6 shadow-xl shadow-navy-900/5 sm:p-8">
        <h3 class="font-display text-lg font-black text-navy-900">شعار الجمعية</h3>
        <p class="mt-1 text-sm font-medium text-navy-500">يظهر في شاشة الدخول والشريط الجانبي — وإن لم يوجد يظهر اسم الجمعية نصيًا.</p>
        <div class="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div id="s-logo-preview" class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-navy-200 bg-gold-50"></div>
          <div class="flex flex-1 flex-col items-center gap-3 sm:items-start">
            <input type="file" id="s-logo-file" accept="image/*" class="hidden" aria-label="رفع الشعار">
            <div class="flex flex-wrap justify-center gap-2 sm:justify-start">
              <label for="s-logo-file" class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gold-500/40 bg-navy-900 px-5 py-2.5 text-sm font-extrabold text-gold-100 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-navy-800">
                رفع شعار (يُخزَّن في Supabase Storage)
              </label>
              <button type="button" id="s-logo-remove" class="hidden inline-flex items-center gap-2 rounded-md border border-navy-200 bg-white px-4 py-2.5 text-sm font-extrabold text-navy-700 transition-colors hover:border-gold-500 hover:text-navy-900">إزالة</button>
            </div>
            <p class="text-xs font-semibold text-navy-400">الصيغ المدعومة: PNG / JPG / SVG — بحد أقصى 1 م.ب</p>
          </div>
        </div>
      </div>

      <!-- بيانات الجمعية -->
      <div class="rounded-2xl border-2 border-navy-100 bg-white p-6 shadow-xl shadow-navy-900/5 sm:p-8">
        <h3 class="mb-6 font-display text-lg font-black text-navy-900">بيانات الجمعية</h3>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div><label for="s-name" class="mb-1.5 block text-sm font-extrabold text-navy-800">اسم الجمعية</label><input id="s-name" type="text" class="b-input" value="${s.association_name}"></div>
          <div><label for="s-currency" class="mb-1.5 block text-sm font-extrabold text-navy-800">العملة</label><input id="s-currency" type="text" class="b-input" value="${s.currency}"></div>
          <div class="sm:col-span-2"><label for="s-address" class="mb-1.5 block text-sm font-extrabold text-navy-800">العنوان</label><input id="s-address" type="text" class="b-input" value="${s.address}"></div>
          <div><label for="s-phone" class="mb-1.5 block text-sm font-extrabold text-navy-800">الهاتف</label><input id="s-phone" type="tel" dir="ltr" class="b-input text-start" value="${s.phone}"></div>
          <div><label for="s-email" class="mb-1.5 block text-sm font-extrabold text-navy-800">البريد الإلكتروني</label><input id="s-email" type="email" dir="ltr" class="b-input text-start" value="${s.email}"></div>
          <div><label for="s-fiscal" class="mb-1.5 block text-sm font-extrabold text-navy-800">السنة المالية</label><input id="s-fiscal" type="text" class="b-input" value="${s.fiscal_year}"></div>
        </div>
        <div class="mt-7 grid grid-cols-1 gap-4 border-t border-navy-100 pt-6 sm:grid-cols-2">
          <div class="flex items-center justify-between gap-4 rounded-xl border border-navy-100 p-4">
            <div>
              <p class="text-sm font-extrabold text-navy-900">السماح بتسجيل الدخول بالبريد</p>
              <p class="mt-0.5 text-xs font-semibold text-navy-400">البريد المُدخل في شاشة الدخول يُمرَّر مباشرة لـ Supabase Auth</p>
            </div>
            <button type="button" id="s-email-login" class="b-switch ${s.allow_email_login ? 'on' : ''}" role="switch" aria-checked="${s.allow_email_login}" aria-label="السماح بتسجيل الدخول بالبريد"></button>
          </div>
          <div class="flex items-center justify-between gap-4 rounded-xl border border-navy-100 p-4">
            <div>
              <p class="text-sm font-extrabold text-navy-900">حساسية حالة الأحرف في اسم المستخدم</p>
              <p class="mt-0.5 text-xs font-semibold text-navy-400">username_case_sensitive — تؤثر على مطابقة أسماء الدخول</p>
            </div>
            <button type="button" id="s-case-sensitive" class="b-switch ${s.username_case_sensitive ? 'on' : ''}" role="switch" aria-checked="${s.username_case_sensitive}" aria-label="حساسية حالة الأحرف"></button>
          </div>
        </div>
      </div>

      <!-- الحفظ -->
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-navy-100 bg-white p-6 shadow-xl shadow-navy-900/5 sm:p-8">
        <p id="s-saved-at" class="text-sm font-bold text-navy-400">${s.updated_at ? `آخر حفظ: ${s.updated_at}` : 'لم تُحفَظ تعديلات بعد في هذه الجلسة'}</p>
        <button type="button" id="s-save" class="inline-flex items-center gap-2 rounded-md border border-gold-500/40 bg-navy-900 px-8 py-3 text-sm font-black text-gold-100 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-navy-800">حفظ الإعدادات</button>
      </div>
    </div>
  `;

  renderLogoPreview();

  ['s-name', 's-currency', 's-address', 's-phone', 's-email', 's-fiscal'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const map = { 's-name': 'association_name', 's-currency': 'currency', 's-address': 'address', 's-phone': 'phone', 's-email': 'email', 's-fiscal': 'fiscal_year' };
      settingsDraft[map[id]] = e.target.value;
    });
  });
  bindSwitch('s-email-login', (v) => (settingsDraft.allow_email_login = v));
  bindSwitch('s-case-sensitive', (v) => (settingsDraft.username_case_sensitive = v));

  /* رفع الشعار */
  document.getElementById('s-logo-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { settingsDraft.logo_url = String(reader.result); renderLogoPreview(); };
    reader.readAsDataURL(file);
  });
  document.getElementById('s-logo-remove').addEventListener('click', () => {
    settingsDraft.logo_url = '';
    renderLogoPreview();
  });

  document.getElementById('s-save').addEventListener('click', async () => {
    if (!can(USER.role, 'settings_maintenance', 'edit')) {
      toast('ليس لديك صلاحية تعديل الإعدادات', 'error');
      return;
    }
    settingsDraft.updated_at = nowStamp();
    await pushSettings(settingsDraft);
    refreshBrand();
    renderSavedAt();
    toast('تم حفظ الإعدادات والصيانة');
  });
}

function renderLogoPreview() {
  const box = document.getElementById('s-logo-preview');
  const rm = document.getElementById('s-logo-remove');
  if (!box || !rm) return;
  box.innerHTML = settingsDraft.logo_url
    ? `<img src="${settingsDraft.logo_url}" alt="معاينة الشعار" class="h-full w-full object-cover">`
    : `<span class="text-gold-600">${icon('upload', 30)}</span>`;
  rm.classList.toggle('hidden', !settingsDraft.logo_url);
}

function renderSavedAt() {
  const el = document.getElementById('s-saved-at');
  if (!el) return;
  const s = loadSettings();
  el.textContent = s.updated_at ? `آخر حفظ: ${s.updated_at}` : 'لم تُحفَظ تعديلات بعد في هذه الجلسة';
}

/* مفاتيح التبديل المخصصة */
function setSwitch(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on', !!value);
  el.setAttribute('aria-checked', String(!!value));
}
function bindSwitch(id, cb) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    const on = !el.classList.contains('on');
    setSwitch(id, on);
    cb(on);
  });
}

/* ═══════════════ المستخدمون والصلاحيات ═══════════════ */
function initUsersTab() {
  matrixDraft = JSON.parse(JSON.stringify(loadMatrix()));
  matrixRole = USER.role === 'auditor' ? 'chairman' : USER.role;

  /* مبدّل: المستخدمون / مصفوفة الصلاحيات */
  document.querySelectorAll('[data-uview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.uview;
      document.getElementById('users-list-view').classList.toggle('hidden', v !== 'list');
      document.getElementById('matrix-view').classList.toggle('hidden', v !== 'matrix');
      document.querySelectorAll('[data-uview]').forEach((b) =>
        b.classList.toggle('seg-active', b === btn));
    });
  });

  /* البحث والتصفية */
  document.getElementById('u-search').addEventListener('input', (e) => { usersView.search = e.target.value; renderUsersTable(); });
  document.getElementById('u-role-filter').addEventListener('change', (e) => { usersView.role = e.target.value; renderUsersTable(); });
  document.getElementById('u-status-filter').addEventListener('change', (e) => { usersView.status = e.target.value; renderUsersTable(); });

  /* إضافة مستخدم */
  const addBtn = document.getElementById('u-add-btn');
  if (can(USER.role, 'users', 'add')) {
    addBtn.classList.remove('hidden');
    addBtn.addEventListener('click', () => openUserModal('new'));
  }

  buildRoleCards();
  renderUsersTable();
  renderMatrixChips();
  renderMatrixTable();

  /* أزرار المصفوفة */
  document.getElementById('matrix-save').addEventListener('click', async () => {
    if (!can(USER.role, 'users', 'edit')) { toast('ليس لديك صلاحية تعديل الصلاحيات', 'error'); return; }
    await pushMatrix(matrixDraft);
    matrixDirty = false;
    buildSidebar();
    if (!can(USER.role, activeTab, 'view')) {
      showTab(visibleModules(USER.role)[0]?.key || 'dashboard');
    }
    toast('تم حفظ مصفوفة الصلاحيات — حُدِّثت القائمة الجانبية');
  });
  document.getElementById('matrix-reset').addEventListener('click', () => {
    matrixDraft = JSON.parse(JSON.stringify(loadMatrix()));
    matrixDirty = false;
    renderMatrixTable();
  });

  /* النوافذ المنبثقة */
  document.getElementById('um-cancel').addEventListener('click', () => closeModal('modal-user'));
  document.getElementById('um-submit').addEventListener('click', submitUser);
  document.getElementById('rs-close').addEventListener('click', () => closeModal('modal-reset'));
  document.getElementById('rs-copy').addEventListener('click', copyTempCode);
  document.getElementById('cf-cancel').addEventListener('click', () => closeModal('modal-confirm'));
}

function filteredUsers() {
  const q = usersView.search.trim().toLowerCase();
  return loadUsers().filter((u) =>
    (usersView.role === 'all' || u.role === usersView.role) &&
    (usersView.status === 'all' || u.status === usersView.status) &&
    (!q || u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const list = filteredUsers();
  const all = loadUsers();
  const pEdit = can(USER.role, 'users', 'edit');
  const pDelete = can(USER.role, 'users', 'delete');

  tbody.innerHTML = list.map((u) => {
    const isSelf = u.id === USER.id;
    const actions = [
      pEdit ? `<button data-act="edit" data-id="${u.id}" title="تعديل" class="icon-btn text-gold-600 hover:bg-gold-50">${icon('pencil', 16)}</button>` : '',
      pEdit ? `<button data-act="reset" data-id="${u.id}" title="إعادة تعيين رمز الدخول" class="icon-btn text-gold-600 hover:bg-gold-50">${icon('key', 16)}</button>` : '',
      pDelete && !isSelf ? `<button data-act="toggle" data-id="${u.id}" title="${u.status === 'active' ? 'إيقاف' : 'تفعيل'}" class="icon-btn ${u.status === 'active' ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}">${icon(u.status === 'active' ? 'pause' : 'play', 16)}</button>` : '',
    ].join('');
    return `
      <tr class="transition-colors hover:bg-gold-50/60">
        <td class="px-4 py-3.5">
          <div class="flex items-center gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-black text-navy-800">${u.full_name.charAt(0)}</span>
            <div class="leading-tight">
              <p class="font-extrabold text-navy-900">${u.full_name} ${isSelf ? '<span class="text-[10px] font-black text-gold-700">(أنت)</span>' : ''}</p>
              <p class="text-xs font-semibold text-navy-400" dir="ltr">${u.email}</p>
            </div>
          </div>
        </td>
        <td class="px-4 py-3.5"><code class="rounded-md bg-gold-50 px-2 py-1 text-xs font-bold text-gold-700" dir="ltr">${u.username}</code></td>
        <td class="px-4 py-3.5 font-bold text-navy-900">${ROLE_LABELS[u.role]}</td>
        <td class="px-4 py-3.5">
          <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
            <span class="h-1.5 w-1.5 rounded-full bg-current"></span>${u.status === 'active' ? 'نشط' : 'موقوف'}
          </span>
        </td>
        <td class="px-4 py-3.5 text-xs font-bold text-navy-400">${u.last_login || 'لم يسجل الدخول'}</td>
        <td class="px-4 py-3.5"><div class="flex items-center justify-end gap-1">${actions || '<span class="text-xs text-navy-300">—</span>'}</div></td>
      </tr>`;
  }).join('') || `<tr><td colspan="6" class="px-4 py-12 text-center text-sm font-bold text-navy-400">لا توجد نتائج مطابقة لبحثك أو التصفية المحددة</td></tr>`;

  document.getElementById('u-count').textContent = `${list.length} من ${all.length} مستخدمًا`;

  tbody.querySelectorAll('[data-act]').forEach((btn) => {
    const u = loadUsers().find((x) => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      if (btn.dataset.act === 'edit') openUserModal(u);
      if (btn.dataset.act === 'reset') openResetModal(u);
      if (btn.dataset.act === 'toggle') openConfirmModal(u);
    });
  });
}

/* ── نموذج إضافة/تعديل مستخدم ── */
let roleChoice = 'cashier';
function buildRoleCards() {
  const host = document.getElementById('um-role-list');
  host.innerHTML = ROLES.map((r) => `
    <button type="button" data-role="${r.key}" class="role-card rounded-xl border-2 px-4 py-3 text-start transition-all">
      <span class="block text-[13px] font-extrabold">${r.label}</span>
      <span class="block text-[11px] font-semibold opacity-70">${r.hint}</span>
    </button>`).join('');
  host.querySelectorAll('[data-role]').forEach((b) => {
    b.addEventListener('click', () => { roleChoice = b.dataset.role; paintRoleCards(); });
  });
}
function paintRoleCards() {
  document.querySelectorAll('#um-role-list .role-card').forEach((b) => {
    b.classList.toggle('role-active', b.dataset.role === roleChoice);
  });
}
function openUserModal(userOrNew) {
  editingUser = userOrNew;
  document.getElementById('um-title').textContent = userOrNew === 'new' ? 'إضافة مستخدم جديد' : 'تعديل بيانات المستخدم';
  document.getElementById('um-submit').textContent = userOrNew === 'new' ? 'إضافة المستخدم' : 'حفظ التعديلات';
  const u = userOrNew === 'new' ? { full_name: '', username: '', email: '' } : userOrNew;
  document.getElementById('um-name').value = u.full_name;
  document.getElementById('um-username').value = u.username;
  document.getElementById('um-email').value = u.email;
  roleChoice = u.role || 'cashier';
  paintRoleCards();
  openModal('modal-user');
}
async function submitUser() {
  const full_name = document.getElementById('um-name').value.trim();
  const username = document.getElementById('um-username').value.trim();
  const email = document.getElementById('um-email').value.trim();
  if (!full_name || !username) { toast('الاسم واسم المستخدم حقلان إلزاميان', 'error'); return; }

  const users = loadUsers();
  if (editingUser === 'new') {
    users.push({
      id: 'u-' + Date.now(), full_name, username,
      email: email || `${username}@baraka.org`,
      role: roleChoice, status: 'active', last_login: null,
      created_at: new Date().toISOString().slice(0, 10),
    });
    toast('تمت إضافة المستخدم — ستصله دعوة لتعيين رمز الدخول (محاكاة)');
  } else {
    const i = users.findIndex((x) => x.id === editingUser.id);
    users[i] = { ...users[i], full_name, username, email: email || users[i].email, role: roleChoice };
    toast('تم حفظ تعديلات المستخدم');
  }
  await pushUsers(users);
  renderUsersTable();
  buildSidebar();
  closeModal('modal-user');
}

/* ── إعادة تعيين رمز الدخول ── */
function genTempCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return 'BRK-' + out;
}
function openResetModal(u) {
  document.getElementById('rs-name').textContent = u.full_name;
  document.getElementById('rs-code').textContent = genTempCode();
  openModal('modal-reset');
}
function copyTempCode() {
  const code = document.getElementById('rs-code').textContent;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => toast('تم نسخ الرمز المؤقت إلى الحافظة'));
  } else toast(code, 'info');
}

/* ── إيقاف/تفعيل ── */
let confirmTarget = null;
function openConfirmModal(u) {
  confirmTarget = u;
  document.getElementById('cf-title').textContent = u.status === 'active' ? 'إيقاف المستخدم' : 'تفعيل المستخدم';
  document.getElementById('cf-text').innerHTML = u.status === 'active'
    ? `سيُمنع <b class="text-navy-900">${u.full_name}</b> من تسجيل الدخول فورًا مع بقاء سجله محفوظًا. هل تريد المتابعة؟`
    : `سيستعيد <b class="text-navy-900">${u.full_name}</b> إمكانية تسجيل الدخول حسب صلاحيات دوره. هل تريد المتابعة؟`;
  const ok = document.getElementById('cf-ok');
  ok.textContent = u.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب';
  ok.className = `px-7 py-2.5 text-sm font-black rounded-md text-white ${u.status === 'active' ? 'bg-red-800 hover:bg-red-900' : 'bg-navy-900 hover:bg-navy-800 border border-gold-500/40'}`;
  openModal('modal-confirm');
}
document.addEventListener('click', async (e) => {
  if (e.target?.id === 'cf-ok' && confirmTarget) {
    const users = loadUsers();
    const i = users.findIndex((x) => x.id === confirmTarget.id);
    users[i].status = users[i].status === 'active' ? 'suspended' : 'active';
    await pushUsers(users);
    renderUsersTable();
    closeModal('modal-confirm');
    toast('تم تحديث حالة المستخدم');
    confirmTarget = null;
  }
});

/* ═══════════════ مصفوفة الأدوار والصلاحيات ═══════════════ */
function renderMatrixChips() {
  const host = document.getElementById('matrix-role-chips');
  host.innerHTML = ROLES.map((r) => `
    <button type="button" data-mrole="${r.key}"
      class="matrix-chip rounded-lg border px-3.5 py-2 text-xs font-extrabold transition-all
      ${r.key === matrixRole ? 'border-navy-900 bg-navy-900 text-gold-200' : 'border-navy-200 bg-white text-navy-600 hover:border-gold-500'}">
      ${r.label}
    </button>`).join('');
  host.querySelectorAll('[data-mrole]').forEach((b) => {
    b.addEventListener('click', () => { matrixRole = b.dataset.mrole; renderMatrixChips(); renderMatrixTable(); });
  });
}

function renderMatrixTable() {
  const body = document.getElementById('matrix-body');
  const editable = can(USER.role, 'users', 'edit');
  body.innerHTML = MODULES.map((m) => `
    <tr class="transition-colors hover:bg-gold-50/60">
      <td class="px-4 py-3">
        <div class="flex items-center gap-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-gold-500">${icon(m.icon, 15)}</span>
          <span class="font-extrabold text-navy-900">${m.name}</span>
          ${m.status === 'under_construction' ? '<span class="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-extrabold text-gold-800">قيد الإنشاء</span>' : ''}
        </div>
      </td>
      ${ACTIONS.map(([a, label]) => {
        const on = (matrixDraft[matrixRole]?.[m.key] || []).includes(a);
        return `<td class="px-4 py-3 text-center">
          <button type="button" data-cell="${m.key}:${a}" role="checkbox" aria-checked="${on}"
            aria-label="${ROLE_LABELS[matrixRole]} — ${m.name} — ${label}"
            class="matrix-check inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-all duration-200 hover:scale-110
            ${on ? 'border-transparent bg-navy-900 text-gold-300 shadow-sm' : 'border-navy-200 bg-white text-navy-300'}
            ${editable ? '' : 'opacity-50 cursor-not-allowed'}">
            ${on ? icon('check', 14) : ''}
          </button>
        </td>`;
      }).join('')}
    </tr>`).join('');

  body.querySelectorAll('[data-cell]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!editable) { toast('ليس لديك صلاحية تعديل الصلاحيات', 'error'); return; }
      const [mod, action] = btn.dataset.cell.split(':');
      const arr = new Set(matrixDraft[matrixRole]?.[mod] || []);
      if (arr.has(action)) {
        arr.delete(action);
        if (action === 'view') arr.clear();      /* إلغاء العرض يلغي ما سواه */
      } else {
        arr.add(action);
        if (action !== 'view') arr.add('view'); /* أي إجراء يستلزم العرض */
      }
      matrixDraft[matrixRole][mod] = [...arr];
      matrixDirty = true;
      renderMatrixTable();
    });
  });
}

/* ═══════════════ التهيئة ═══════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!USER) return;
  /* مزامنة طبقة البيانات من Supabase (المراحل 1-3) قبل بناء الواجهة */
  await fetchSettings();
  await fetchUsers();
  await fetchMatrix();
  buildTopbar();
  buildSidebar();
  initTopbar();
  initUsersTab();
  initLogin();
  showTab('dashboard');
  window.hideAppLoading?.(); /* إخفاء شاشة التحميل بعد اكتمال بناء الواجهة */
});
