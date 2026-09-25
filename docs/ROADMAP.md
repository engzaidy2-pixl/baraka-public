# خارطة الطريق — بركة | منصة الجمعيات

> **آخر تحديث**: 21 سبتمبر 2026
> **الحالة**: الهيكل العظمي مكتمل — بدء بناء الميزات
> **الهدف**: إطلاق للجمعية خلال 6-8 أسابيع

---

## 📊 نظرة عامة

### السياق الحقيقي
- **الجمعية**: جمعية البركة الأهلية (قائمة ونشطة).
- **عدد الأعضاء**: ~2000 عضو.
- **عدد المستخدمين للنظام**: 5 (رئيس المجلس، المدير المالي، أمين الصندوق، المراجع، + مستخدم احتياطي).
- **الاستخدام**: إدارة خزينة الجمعية، الاشتراكات، التبرعات، المصروفات.
- **الهدف**: نظام بديل عن Excel/الورق.

### حالة المشروع الحالية

| العنصر | الحالة |
|---|---|
| البنية التحتية (GitHub Pages + Supabase) | ✅ مكتمل |
| قاعدة البيانات (14 جدول) | ✅ مكتمل |
| Auth (Supabase Auth) | ✅ يعمل |
| fetchSettings / fetchUsers / fetchMatrix | ✅ يعمل |
| شاشة التحميل | ✅ مكتمل |
| Mobile UX | ✅ مكتمل |
| أزرار الدخول السريع | ✅ مكتمل |
| **الميزات الأساسية** | ❌ **لم تبدأ** |

---

## 🔴 المرحلة 0: تأمين الأساس (الأسبوع الحالي)

### الهدف
تأمين التطبيق قبل إدخال بيانات حقيقية.

### المهام

- [ ] **كلمات مرور قوية** لكل مستخدم.
- [ ] **تفعيل RLS** على كل الجداول (14).
- [ ] **تفعيل 2FA** على حساب Supabase.
- [ ] **نسخ احتياطي يدوي أسبوعي** (Database → Backups).
- [ ] **إضافة فهارس** على الحقول المهمة (لأداء 2000 عضو):
  ```sql
  CREATE INDEX IF NOT EXISTS idx_members_full_name ON members(full_name);
  CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
  CREATE INDEX IF NOT EXISTS idx_members_national_id ON members(national_id);
  CREATE INDEX IF NOT EXISTS idx_members_membership_type ON members(membership_type);
  CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
