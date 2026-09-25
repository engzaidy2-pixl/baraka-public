<div align="center">

# بركة | منصة الجمعيات

**Baraka for Associations**

منصة إدارية مفتوحة المصدر لإدارة خزينة الجمعيات الأهلية

[![Live Demo](https://img.shields.io/badge/🚀%20عرض%20حي-engzaidy2--pixl.github.io-blue?style=for-the-badge)](https://engzaidy2-pixl.github.io/baraka-public/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Under%20Development-orange)]()
[![Language](https://img.shields.io/badge/Language-Arabic%20(RTL)-green)]()
[![DB](https://img.shields.io/badge/DB-PostgreSQL%20%7C%20Supabase-blue)]()
[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-informational)]()

</div>

---

## 🚀 جرّب التطبيق الآن

### الرابط الحي
```
https://engzaidy2-pixl.github.io/baraka-public/
```

### بيانات الدخول التجريبية
| الدور | اسم المستخدم | كلمة المرور |
|---|---|---|
| رئيس مجلس الإدارة | `Ehab` | `Baraka@2026!` |
| المدير المالي | `Elham` | `Baraka@2026!` |
| أمين الصندوق | `fatima` | `Baraka@2026!` |
| المراجع | `Ramadan` | `Baraka@2026!` |

> ⚠️ **ملاحظة**: هذه بيانات تجريبية. غيّرها قبل الاستخدام الحقيقي.

---

## 📖 نظرة عامة

**بركة** منصة إدارية شاملة للجمعيات الأهلية، تهدف إلى تمكين الجمعيات من إدارة عملياتها المالية والإدارية بشفافية وأمان. تُبنى المنصة على تقنيات حديثة مجانية، وتهدف إلى إتاحة الفرصة للجمعيات التي لا تستطيع تحمل تكاليف الأنظمة التجارية.

### المشروع في مرحلة التطوير النشط

تم بناء **الهيكل العظمي** بالكامل، ويجري تطوير الميزات تدريجيًا. بعض الوحدات جاهزة للاستخدام، والبعض الآخر قيد الإنشاء.

---

## ✨ الميزات الحالية

### ✅ جاهزة للاستخدام

- 🔐 **شاشة دخول آمنة** — Supabase Auth + حفظ الجلسة.
- 🎨 **تصميم عربي RTL** — خطوط Tajawal/Cairo، ألوان زيتية/ذهبية.
- 📱 **متجاوب بالكامل** — حاسوب، تابلت، هاتف.
- 👥 **إدارة المستخدمين** — 4 أدوار، صلاحيات RLS.
- 🏢 **جهات العمل** — CRUD كامل + بحث + فلترة.
- 🏛️ **جهات الخصم** — CRUD كامل + بحث + فلترة.
- 💰 **الاشتراكات** — تسجيل، دفع، بحث، فلترة، تصدير Excel.
- 🎯 **لوحة تحكم** — إحصائيات فورية، تنبيهات، أنشطة حديثة.
- 🔄 **نشر تلقائي** — كل تعديل يظهر على الموقع مباشرة.

### 🚧 قيد الإنشاء

- 📋 **دفعات الخصم** — توليد خطابات جماعية لجهات الخصم.
- 📊 **التقارير** — تقارير مالية متقدمة + تصدير PDF.
- 🌳 **شؤون العضوية** — منتسبون، طلبات، أنواع عضوية.
- 🔔 **التنبيهات والرسائل** — بين المستخدمين.
- ⚙️ **الإعدادات المتقدمة** — ضبط إداري شامل.

---

## 🏗️ البنية التقنية

| الطبقة | التقنية |
|---|---|
| **الواجهة الأمامية** | HTML5, CSS3, JavaScript (ES Modules) |
| **التصميم** | Tailwind CSS + Font Awesome |
| **الخطوط** | Tajawal, Cairo (Google Fonts) |
| **قاعدة البيانات** | PostgreSQL (Supabase) |
| **المصادقة** | Supabase Auth |
| **الأمان** | Row Level Security (RLS) |
| **الاستضافة** | GitHub Pages (تلقائي) |
| **الأتمتة** | GitHub Actions |
| **Excel** | SheetJS |
| **PDF** | jsPDF + AutoTable |

---

## 🏛️ معمارية المشروع

هذا المستودع **نسخة النشر العام** — يُحدَّث **تلقائيًا** من مستودع تطوير خاص عبر GitHub Actions.

```
المستودع الخاص (التطوير)
        ↓
   GitHub Actions
        ↓
المستودع العام (النشر) ← هذا المستودع
        ↓
   GitHub Pages
        ↓
https://engzaidy2-pixl.github.io/baraka-public/
```

**النتيجة**: كود نظيف، بدون ملفات تجريبية، وبدون أسرار تطوير.

---

## 📂 البنية

```
baraka-public/
├── docs/                    ← التطبيق (يُخدَم على GitHub Pages)
│   ├── index.html           ← شاشة الدخول
│   ├── dashboard.html       ← الصفحة الرئيسية
│   ├── style.css            ← التنسيقات
│   ├── supabase.js          ← إعداد الاتصال بـ Supabase
│   ├── auth.js              ← المصادقة
│   ├── ui.js                ← عناصر الواجهة
│   ├── modules.js           ← طبقة البيانات
│   ├── app.js               ← منطق التطبيق
│   └── modules/
│       └── membership/      ← وحدة شؤون العضوية
│           ├── membership.html
│           ├── membership.css
│           ├── membership.js
│           ├── schema.sql   ← بنية قاعدة البيانات
│           └── README.md
├── LICENSE                  ← رخصة MIT
└── README.md                ← هذا الملف
```

---

## 🚀 التثبيت (للاستخدام الخاص)

### 1. Supabase

```sql
-- 1. نفّذ schema الأساسي
-- docs/schema.sql

-- 2. نفّذ schema وحدة العضوية
-- docs/modules/membership/schema.sql
```

### 2. الاتصال بـ Supabase

عدّل `docs/supabase.js`:

```javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```

### 3. GitHub Pages

- Fork هذا المستودع.
- Settings → Pages → Branch: `main` + Folder: `/docs`.
- افتح الرابط.

---

## 🤝 المساهمة

المشروع مفتوح للمساهمات. قبل إرسال Pull Request:

1. افتح Issue لمناقشة الفكرة.
2. اتبع نمط الكود الحالي.
3. اختبر التغييرات محليًا.

---

## 📄 الترخيص

هذا المشروع مرخّص تحت **MIT License** — راجع ملف [LICENSE](LICENSE).

---

## 📬 التواصل

• العرض الحي: engzaidy2-pixl.github.io/baraka-public
• Issues والاقتراحات: github.com/engzaidy2-pixl/baraka-public/issues
• البريد الإلكتروني: Engzaidy2@gmail.com
• المشرف:AlZaidy
- **العرض الحي**: [engzaidy2-pixl.github.io/baraka-public](https://engzaidy2-pixl.github.io/baraka-public/)
- **Issues**: [github.com/engzaidy2-pixl/baraka-public/issues](https://github.com/engzaidy2-pixl/baraka-public/issues)

---

<div align="center">

**صُنع بـ ❤️ لخدمة الجمعيات الأهلية**

⭐ إذا أعجبك المشروع، لا تنسَ النجمة!

</div>