/**
 * ui.js — أدوات الواجهة (Option B): أيقونات SVG، الشريط الجانبي، النوافذ المنبثقة، التنبيهات
 *
 * // ملاحظة: المفاتيح fa-* مربوطة مؤقتًا بأيقونات SVG مضمّنة.
 * // القرار المستقبلي: اعتماد Font Awesome كمصدر وحيد في مهمة لاحقة.
 */

/* ── أيقونات SVG مضمّنة (أسلوب lucide) — تطابق مفاتيح عمود icon في جدول modules و topbar_icons ── */
const ICON_PATHS = {
  'gauge': '<path d="M12 14l3.5-3.5"/><path d="M20.2 17a9 9 0 1 0-16.4 0"/><path d="M12 5v1"/><path d="M5 8l1 1"/><path d="M19 8l-1 1"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'coins-in': '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15.5 9.5c-.7-1-1.9-1.5-3.5-1.5-2 0-3.5 1-3.5 2.5S10 13 12 13s3.5.8 3.5 2.5S14 18 12 18c-1.6 0-2.8-.5-3.5-1.5"/>',
  'coins-out': '<circle cx="12" cy="12" r="9"/><path d="M9 15.5c.7.6 1.8 1 3 1 1.8 0 3-.9 3-2.2 0-2.8-6-1.6-6-4.3 0-1.3 1.2-2 3-2 1.2 0 2.3.3 3 .9"/>',
  'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  'book': '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
  'chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 14v3"/><path d="M11 10v7"/><path d="M15 12v5"/><path d="M19 7v10"/>',
  'archive': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  'gear': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'menu': '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>',
  'close': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'pencil': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  'pause': '<circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>',
  'play': '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
  'key': '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  'copy': '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'chevron': '<path d="m6 9 6 6 6-6"/>',
  'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'vault': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v-1M12 16v-1"/>',
  'lock': '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'spark': '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/>',
  'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'envelope': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
};

/* ── مفاتيح fa-* (مطابقة لعمود icon في جدول modules وجدول topbar_icons) ── */
ICON_PATHS['fa-gauge']                = ICON_PATHS['gauge'];
ICON_PATHS['fa-users']                = ICON_PATHS['users'];
ICON_PATHS['fa-id-card']              = '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 9h4M15 13h4M5 17c0-2 2-3 4-3s4 1 4 3"/>';
ICON_PATHS['fa-hand-holding-dollar']  = ICON_PATHS['coins-in'];
ICON_PATHS['fa-money-bill-transfer']  = ICON_PATHS['coins-out'];
ICON_PATHS['fa-file-invoice']         = ICON_PATHS['receipt'];
ICON_PATHS['fa-book']                 = ICON_PATHS['book'];
ICON_PATHS['fa-chart-pie']            = '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>';
ICON_PATHS['fa-chart-line']           = '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m7 14 4-4 4 4 6-6"/>';
ICON_PATHS['fa-gear']                 = ICON_PATHS['gear'];
ICON_PATHS['fa-vault']                = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v-1M12 16v-1"/>';
ICON_PATHS['fa-user-shield']          = ICON_PATHS['shield'];
ICON_PATHS['fa-bell']                 = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';
ICON_PATHS['fa-envelope']             = '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>';

function icon(name, size = 20, extraClass = '') {
  const paths = ICON_PATHS[name] || ICON_PATHS['spark'];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 ${extraClass}" aria-hidden="true">${paths}</svg>`;
}

/* ── الشريط الجانبي (هاتف/تابلت) ── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (!sidebar) return;
  /* الشريط على اليمين (RTL): الإخفاء يكون بدفعه إلى خارج الحافة اليمنى */
  const isOpen = sidebar.classList.contains('translate-x-0');
  sidebar.classList.toggle('translate-x-0', !isOpen);
  sidebar.classList.toggle('translate-x-full', isOpen);
  if (overlay) overlay.classList.toggle('hidden', isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

/* ── التنبيهات العائمة ── */
function toast(text, kind = 'success') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 items-center px-4';
    document.body.appendChild(host);
  }
  const colors = {
    success: 'bg-navy-900 text-gold-100 border-gold-500/40',
    error: 'bg-red-800 text-red-50 border-red-600',
    info: 'bg-gold-500 text-navy-950 border-gold-600',
  };
  const iconName = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'spark';
  const el = document.createElement('div');
  el.className = `toast-pop flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl max-w-sm ${colors[kind] || colors.success}`;
  el.innerHTML = `${icon(iconName, 17)}<span class="leading-snug">${text}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3800);
}

/* ── النوافذ المنبثقة ── */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('hidden');
  requestAnimationFrame(() => m.classList.add('show'));
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => m.classList.add('hidden'), 220);
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.b-modal:not(.hidden)').forEach((m) => closeModal(m.id));
});

/**
 * تحديد المسار المطلق من جذر المشروع
 * @param {string} relativePath - مثل 'index.html' أو 'dashboard.html'
 * @returns {string} - المسار الصحيح حسب موقع الصفحة الحالية
 */
function appPath(relativePath) {
  const path = window.location.pathname;
  if (path.includes('/modules/')) return '../../' + relativePath;
  return relativePath;
}


/* ── تسجيل الخروج ── */
async function logout() {
  B_STORE.del('baraka_b.session');
  /* إنهاء جلسة Supabase Auth */
  const sb = (typeof sbClient === 'function') ? sbClient() : null;
  if (sb) {
    try { await sb.auth.signOut(); }
    catch (e) { console.warn('[Baraka] signOut failed:', e?.message || e); }
  }
  window.location.href = appPath('index.html');
}

/* ── تصدير في بيئة Node (للاختبارات) مع الحفاظ على التوافق مع المتصفح ── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ICON_PATHS,
    icon,
    toggleSidebar,
    toast,
    openModal,
    closeModal,
    appPath,
    logout,
  };
}
