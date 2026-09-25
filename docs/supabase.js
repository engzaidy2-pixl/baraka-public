/**
 * supabase.js — إعداد الاتصال بـ Supabase
 * ⚠️ لا تضع مفتاح service_role هنا أبدًا.
 */

const SUPABASE_URL = 'https://rlqklxmwlzhhexshnijc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJscWtseG13bHpoaGV4c2huaWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDE2MzQsImV4cCI6MjEwNTQxNzYzNH0.CyJcJ9LDJJNNYVrCRBUMfK_cQpOFMKBrDF9dx76YM78';

let supabaseClient = null;

/* ══════════════════════════════════════════════════════════════
 * مخزن جلسة المصادقة — "تذكرني"
 * supabase-js يكتب الجلسة في localStorage افتراضيًا. هذا المحوّل يوجّه الكتابة
 * إلى localStorage عند تفعيل "تذكرني"، وإلى sessionStorage عند إلغائه،
 * مع القراءة من المخزنين (وإزالة النسخة الأخرى عند كل كتابة).
 * ══════════════════════════════════════════════════════════════ */
const AUTH_PERSIST_KEY = 'baraka_b.auth_persist'; /* يبقى في localStorage دائمًا */

function rememberAuth() {
  try { return localStorage.getItem(AUTH_PERSIST_KEY) !== 'session'; }
  catch { return true; }
}

/** يُستدعى قبل تسجيل الدخول لتحديد مكان حفظ الجلسة */
function setAuthPersistence(remember) {
  try { localStorage.setItem(AUTH_PERSIST_KEY, remember ? 'local' : 'session'); }
  catch { /* تجاهل */ }
}

const authStorage = {
  getItem(key) {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
    catch { return null; }
  },
  setItem(key, value) {
    try {
      const target = rememberAuth() ? localStorage : sessionStorage;
      const other = target === localStorage ? sessionStorage : localStorage;
      target.setItem(key, value);
      other.removeItem(key); /* لا نُبقي نسخة قديمة في المخزن الآخر */
    } catch { /* تجاهل */ }
  },
  removeItem(key) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); }
    catch { /* تجاهل */ }
  },
};

/* ══════════════════════════════════════════════════════════════
 * إنشاء العميل — يُترك null في وضع العرض المحلي (auth.js يتحول إلى loginLocal)
 * ══════════════════════════════════════════════════════════════ */
/* يُعتبر المشروع مُهيّأً بمجرد وجود العنوان والمفتاح (يدعم أيضًا Supabase المحلي) */
const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

if (typeof window !== 'undefined') {
  if (typeof window.supabase === 'undefined') {
    console.warn('[Baraka] supabase-js library not loaded — running in demo mode (localStorage).');
  } else if (!SUPABASE_CONFIGURED) {
    console.warn('[Baraka] Supabase not configured — running in demo mode (localStorage).');
  } else {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,        /* حفظ الجلسة (localStorage/sessionStorage حسب "تذكرني") */
        autoRefreshToken: true,      /* تجديد رمز الدخول تلقائيًا */
        detectSessionInUrl: false,   /* لا نستخدم روابط OAuth/السحرية — دخول بكلمة مرور فقط */
        storageKey: 'baraka_b.auth',
        storage: authStorage,
      },
    });
    console.info('[Baraka] Supabase client initialized:', SUPABASE_URL);
  }
}
