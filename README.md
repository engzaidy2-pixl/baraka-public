# بركة | منصة الجمعيات
### Baraka for Associations

> منصة إدارية مفتوحة المصدر لإدارة خزينة الجمعيات الأهلية: التحصيل والصرف، الإيرادات والمصروفات، التقارير المالية — بشفافية وأمان.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Skeleton%20%2F%20Phase%201-blue)]()
[![Language](https://img.shields.io/badge/Language-Arabic%20(RTL)-green)]()
[![Tech](https://img.shields.io/badge/Tech-HTML%20%7C%20CSS%20%7C%20JS%20%7C%20Supabase-informational)]()

---

## 📖 نظرة عامة

**بركة** منصة إدارية مفتوحة المصدر، مصممة خصيصًا للجمعيات الأهلية (غير الربحية) في العالم العربي. تهدف إلى تمكين الجمعيات من إدارة خزينتها بشفافية وكفاءة، عبر واجهة عربية بسيطة، وتقنيات حديثة مجانية.

المشروع في **المرحلة الأولى (الهيكل العظمي)** — البنية الأساسية جاهزة، والوحدات تُبنى تدريجيًا.

---

## ✨ الميزات الحالية (المرحلة الأولى)

- 🔐 **شاشة دخول** — اسم مستخدم أو بريد إلكتروني + رمز دخول.
- 📊 **لوحة تحكم** — بشريط جانبي ديناميكي يُبنى من قاعدة البيانات.
- 🗂️ **مجموعتان قابلتان للطي**:
  - **الخزينة والعمليات**
  - **النظام والإدارة**
- 🧩 **11 وحدة**:
  - لوحة التحكم
  - الأعضاء
  - شؤون العضوية
  - التحصيل / الإيرادات
  - الصرف / المصروفات
  - سندات القبض والصرف
  - دفتر الخزينة
  - تقارير الخزينة
  - مركز التقارير العام
  - الإعدادات والصيانة
  - المستخدمون والصلاحيات
- 👥 **4 أدوار**:
  - رئيس مجلس الإدارة
  - المدير المالي
  - أمين الصندوق
  - المراجع
- 🔑 **75 صلاحية** موزعة على الأدوار (view / add / edit / delete).
- ⚙️ **وحدتان عاملتان**:
  - الإعدادات العامة
  - المستخدمون والصلاحيات

---

## 🗺️ الميزات المخططة

- [ ] تفعيل باقي الوحدات (الأعضاء، التحصيل، الصرف، السندات، دفتر الخزينة).
- [ ] **مركز التقارير العام** — 7 تقارير (مالية، إحصائية، إدارية).
- [ ] **شؤون العضوية** — استمارات الاشتراك، التجديد، أنواع العضوية.
- [ ] **التنبيهات والرسائل** — بين المستخدمين، وأوامر إدارية.
- [ ] **النسخ الاحتياطي والتفعيل** — تصدير/استيراد، ترخيص أوفلاين.
- [ ] **مساحات عمل إضافية** — الأنشطة، المخازن، الموارد البشرية.

---

## 🏗️ البنية
baraka-associations/
├── LICENSE ← رخصة MIT
├── README.md ← هذا الملف
├── docs/ ← التطبيق (يُخدَم عبر GitHub Pages)
│ ├── index.html ← شاشة الدخول
│ ├── dashboard.html ← الصفحة الرئيسية
│ ├── style.css ← التنسيقات
│ ├── app.js ← المنطق العام
│ ├── auth.js ← المصادقة
│ ├── ui.js ← عناصر الواجهة
│ ├── modules.js ← بناء الشريط الجانبي والوحدات
│ ├── supabase.js ← إعداد الاتصال بـ Supabase
│ ├── schema.sql ← بنية قاعدة البيانات
│ └── seed.sql ← البيانات الأولية
└── _archive/ ← ملفات مرجعية (نسخ قديمة، تجارب)


---

## 🛠️ التقنيات

| الطبقة | التقنية |
|---|---|
| **الواجهة** | HTML5 + CSS3 + JavaScript (ES Modules) |
| **التصميم** | Tailwind CSS + Font Awesome |
| **الخط** | Tajawal (Google Fonts) |
| **قاعدة البيانات** | PostgreSQL (عبر Supabase) |
| **المصادقة** | Supabase Auth (`signInWithPassword`) |
| **الأمان** | Row Level Security (RLS) |
| **الاستضافة** | GitHub Pages |
| **الاتجاه** | RTL (يمين إلى يسار) |

---

## 🔐 المصادقة (Auth)

تسجيل الدخول يُنفَّذ عبر **Supabase Auth**، وليس من `localStorage`:

1. **اسم مستخدم أو بريد؟**
   - إن احتوى المُدخل على `@` → يُمرَّر كبريد مباشرة إلى `auth.signInWithPassword`.
   - وإلا → يُستدعى RPC `get_email_by_username(uname)` لجلب البريد المرتبط باسم المستخدم،
     مع احتياطي محلي (`username → email` من الكاش) إن تعذّر استدعاء الدالة.
2. **التحقق** — `supabaseClient.auth.signInWithPassword({ email, password })`.
3. **الملف الشخصي** — يُجلب من `profiles` للتأكد من الوجود ومن أن `status = 'active'`،
   ويُحدَّث `last_login`، وتُحفظ الجلسة محليًا (`baraka_b.session`).
   أي حساب موقوف أو بلا ملف شخصي يُنهى تسجيل دخوله فورًا (`signOut`).

| الدالة | الوصف |
|---|---|
| `loginAsync(identifier, password, remember)` | **المسار الأساسي** — الدخول عبر Supabase Auth. |
| `loginLocal(identifier, password, remember)` | مسار احتياطي من `localStorage` (رمز العرض `123456`)، يُستخدم فقط إذا كان `supabaseClient` غير متاح. |
| `logout()` | ينهي جلسة Supabase ويمسح الجلسة المحلية. |

**ملاحظات تشغيلية**

- المستخدمون يُنشَؤون في **Supabase → Authentication → Users**، ثم يُضاف صف مطابق في `profiles`
  بنفس `id` (UUID) مع `username` و `role` و `status`.
- «تذكرني»: عند تعطيله تُحفظ جلسة Supabase في `sessionStorage` (تنتهي بإغلاق التبويب)، وعند تفعيله في `localStorage`.
- في وضع العرض المحلي (بلا `supabaseClient`) تظهر عناصر التجربة (رمز `123456`) وتُستخدم `loginLocal`؛ وعند تشغيل Supabase Auth تُخفى تلقائيًا (`applyAuthMode`).
- **أزرار الدخول السريع ديناميكية في الوضعين**: كل زر يمثل دورًا ويعرض **أول مستخدم نشط فيه**
  (بترتيب `created_at` تصاعديًا). عند تشغيل Supabase تُجلب الأزرار عبر RPC
  `get_quick_login_users()` — دالة `SECURITY DEFINER` تعمل قبل الجلسة (anon)
  لأن RLS يمنع قراءة `profiles` مباشرة؛ وعند فشلها يُرجع إلى الحسابات المحلية.
  الدالة مُعرَّفة في `docs/schema.sql` (القسم 2.c).
- `localStorage` بعد الترحيل ليس جهة تحقق، بل ذاكرة واجهة (كاش)؛ الجهة الحاكمة هي جلسة Supabase وسياسات RLS.
- الدالة `get_email_by_username` مُعرَّفة في `docs/schema.sql` (القسم 2.b) وهي `SECURITY DEFINER` لازمة قبل الدخول.

---

## 🚀 التثبيت

### المتطلبات
- حساب على [Supabase](https://supabase.com) (مجاني).
- حساب على [GitHub](https://github.com) (مجاني).

### الخطوات

**1. إعداد قاعدة البيانات**
```bash
# في Supabase → SQL Editor، نفّذ بالترتيب:
1. انسخ محتوى docs/schema.sql والصقه → Run
2. انسخ محتوى docs/seed.sql والصقه → Run
```

**2. إنشاء المستخدمين**
```bash
# Supabase → Authentication → Users → Add user (بريد + كلمة مرور)
# ثم أضف صفًا في profiles بنفس المعرّف:
insert into profiles (id, full_name, username, email, role, status)
values ('<UUID من auth.users>', 'سعد الحربي', 'saad', 'saad@baraka.org', 'chairman', 'active');
```

**3. ربط المفاتيح**
```bash
# docs/supabase.js — استبدل SUPABASE_URL و SUPABASE_ANON_KEY بمفاتيح مشروعك (anon فقط)
```

**4. النشر**
```bash
# GitHub → Settings → Pages → Branch: main / Folder: /docs
```

**5. التحقق من الدخول**
```bash
# 1) افتح index.html وسجّل الدخول باسم المستخدم أو البريد + كلمة المرور (Supabase Auth).
# 2) تأكد من ظهور الاسم والدور في dashboard.html.
# 3) تحقق من آخر دخول: select username, last_login from profiles;
```

---

## 🧪 ملاحظات ما بعد الترحيل

- لا يعمل الدخول إلا بعد إنشاء المستخدم في **Supabase Auth** وإضافة صف `profiles` مطابق له.
- إن تعذّر استدعاء `get_email_by_username` تظهر رسالة في الكونسول وينتقل الدخول إلى الاحتياطي المحلي
  (`username → email`)، فإن لم يُطابق الاسم يظهر خطأ بيانات الدخول.
- رسالة «اسم المستخدم أو رمز الدخول غير صحيح» مقصودة لتكون موحّدة (لا تكشف إن كان الحساب موجودًا)،
  بينما تُعرض رسالة مختلفة لأخطاء الاتصال أو الحساب الموقوف أو غياب الملف الشخصي.
- الجلسة تُدار عبر supabase-js (`autoRefreshToken`) مع `storageKey = baraka_b.auth`.

---

## 📄 الرخصة

MIT — انظر [LICENSE](LICENSE).
