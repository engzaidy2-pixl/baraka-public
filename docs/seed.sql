-- =====================================================
-- Baraka for Associations — seed.sql
-- الإصدار: v3.1 (v3.0 + مرجع بيانات وحدة شؤون العضوية)
-- يشمل: المساحة، المجموعتين، 9 وحدات، 9 تبويبات فرعية،
--        3 أيقونات للشريط العلوي، 8 إعدادات تطبيق،
--        7 تقارير، ومصفوفة الصلاحيات المحدثة
--
-- 📌 نطاق هذا الملف: بيانات المنصة الأساسية فقط (لا جداول تشغيلية).
--    بيانات وحدة شؤون العضوية (جهات العمل/الخصم، فئات العضوية، الأسعار)
--    مضمّنة في docs/modules/membership/schema.sql §15 — انظر القسم 10 أدناه.
-- =====================================================

-- =====================================================
-- 1) المساحة (Workspace)
-- =====================================================
INSERT INTO workspaces (key, name, icon, sort_order, status)
VALUES ('treasury', 'الخزينة', 'fa-vault', 1, 'active')
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order,
      status = EXCLUDED.status;

-- =====================================================
-- 2) مجموعات الوحدات (Module Groups)
-- =====================================================
INSERT INTO module_groups (key, name, icon, sort_order)
VALUES
  ('operations', 'الخزينة والعمليات', 'fa-vault', 1),
  ('administration', 'النظام والإدارة', 'fa-gear', 2)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order;

-- =====================================================
-- 3) الوحدات (Modules) — 9 وحدات
-- =====================================================

-- تنظيف المفاتيح القديمة والمنقولة/المحذوفة
DELETE FROM modules WHERE key IN ('backup', 'reports', 'settings', 'members', 'reports_hub');

-- داخل مجموعة operations (6 وحدات)
INSERT INTO modules (workspace_id, group_id, key, name, icon, sort_order, is_reports_hub, status)
SELECT
  w.id,
  g.id,
  m.key, m.name, m.icon, m.sort_order, false, m.status
FROM (VALUES
  ('dashboard',        'لوحة التحكم',           'fa-gauge',               1, 'under_construction'),
  ('collection',       'التحصيل / الإيرادات',    'fa-hand-holding-dollar', 2, 'under_construction'),
  ('expenses',         'الصرف / المصروفات',      'fa-money-bill-transfer', 3, 'under_construction'),
  ('vouchers',         'سندات القبض والصرف',     'fa-file-invoice',        4, 'under_construction'),
  ('treasury_ledger',  'دفتر الخزينة',           'fa-book',                5, 'under_construction'),
  ('treasury_reports', 'تقارير الخزينة',         'fa-chart-pie',           6, 'under_construction')
) AS m(key, name, icon, sort_order, status)
JOIN workspaces w ON w.key = 'treasury'
JOIN module_groups g ON g.key = 'operations'
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order,
      group_id = EXCLUDED.group_id,
      workspace_id = EXCLUDED.workspace_id,
      is_reports_hub = false,
      status = EXCLUDED.status;

-- داخل مجموعة administration (3 وحدات)
INSERT INTO modules (workspace_id, group_id, key, name, icon, sort_order, is_reports_hub, status)
SELECT
  w.id,
  g.id,
  m.key, m.name, m.icon, m.sort_order, false, m.status
FROM (VALUES
  ('membership_affairs',   'شؤون العضوية',          'fa-id-card',     7, 'under_construction'),
  ('settings_maintenance', 'الإعدادات والصيانة',    'fa-gear',        8, 'active'),
  ('users',                'المستخدمون والصلاحيات', 'fa-user-shield', 9, 'active')
) AS m(key, name, icon, sort_order, status)
JOIN workspaces w ON w.key = 'treasury'
JOIN module_groups g ON g.key = 'administration'
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order,
      group_id = EXCLUDED.group_id,
      workspace_id = EXCLUDED.workspace_id,
      is_reports_hub = false,
      status = EXCLUDED.status;

-- =====================================================
-- 4) التبويبات الفرعية (Module Tabs) — 9 تبويبات
-- =====================================================
INSERT INTO module_tabs (module_key, key, name, sort_order, status)
VALUES
  -- تحت membership_affairs (4 تبويبات)
  ('membership_affairs', 'members',          'الأعضاء',         1, 'under_construction'),
  ('membership_affairs', 'applications',     'طلبات الانتساب',  2, 'under_construction'),
  ('membership_affairs', 'subscriptions',    'الاشتراكات',      3, 'under_construction'),
  ('membership_affairs', 'membership_types', 'أنواع العضوية',   4, 'under_construction'),

  -- تحت settings_maintenance (5 تبويبات)
  ('settings_maintenance', 'association_profile', 'بيانات المنشأة',  1, 'active'),
  ('settings_maintenance', 'backup',              'النسخ الاحتياطي', 2, 'under_construction'),
  ('settings_maintenance', 'activation',          'التفعيل',          3, 'under_construction'),
  ('settings_maintenance', 'admin_settings',      'الضبط الإداري',   4, 'under_construction'),
  ('settings_maintenance', 'app_settings',        'ضبط التطبيق',     5, 'under_construction')
ON CONFLICT (module_key, key) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      status = EXCLUDED.status;

-- =====================================================
-- 5) أيقونات الشريط العلوي (Topbar Icons) — 3 أيقونات
-- =====================================================
INSERT INTO topbar_icons (key, name, icon, url, show_badge, sort_order, status)
VALUES
  ('reports_hub',   'مركز التقارير العام', 'fa-chart-line', 'reports.html', true, 1, 'under_construction'),
  ('notifications', 'الإشعارات',           'fa-bell',       NULL,         true, 2, 'under_construction'),
  ('messages',      'الرسائل',             'fa-envelope',   NULL,         true, 3, 'under_construction')
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      url = EXCLUDED.url,
      show_badge = EXCLUDED.show_badge,
      sort_order = EXCLUDED.sort_order,
      status = EXCLUDED.status;

-- =====================================================
-- 6) ضبط التطبيق (App Settings) — 8 إعدادات
-- =====================================================
INSERT INTO app_settings (key, value, category, scope)
VALUES
  ('theme',                 'light', 'display',       'system'),
  ('language',              'ar',    'display',       'system'),
  ('direction',             'rtl',   'display',       'system'),
  ('print_size',            'A4',    'print',         'system'),
  ('print_header',          'true',  'print',         'system'),
  ('print_footer',          'true',  'print',         'system'),
  ('notifications_enabled', 'true',  'notifications', 'system'),
  ('auto_backup',           'false', 'advanced',      'system')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      category = EXCLUDED.category,
      scope = EXCLUDED.scope,
      updated_at = NOW();

-- =====================================================
-- 7) الإعدادات العامة (Settings)
-- =====================================================
INSERT INTO settings (
  association_name, address, phone, email, currency, fiscal_year,
  allow_email_login, username_case_sensitive
)
VALUES (
  'جمعية البركة الأهلية',
  'الرياض، حي العليا، شارع الملك فهد',
  '+966 50 123 4567',
  'info@baraka.org',
  'EGP',
  2026,
  false,
  false
);

-- =====================================================
-- 8) فهرس التقارير (Reports Catalog) — 7 تقارير
-- =====================================================
INSERT INTO reports_catalog (key, title, description, module_key, report_type, sort_order, status)
VALUES
  ('collection_monthly', 'تقرير التحصيل الشهري',
   'ملخص الإيرادات والتحصيلات خلال شهر محدد.',
   'collection', 'financial', 1, 'under_construction'),

  ('expenses_monthly', 'تقرير الصرف الشهري',
   'ملخص المصروفات والمدفوعات خلال شهر محدد.',
   'expenses', 'financial', 2, 'under_construction'),

  ('balances', 'تقرير الأرصدة',
   'أرصدة الخزينة والحسابات في تاريخ محدد.',
   'treasury_ledger', 'financial', 3, 'under_construction'),

  ('vouchers', 'تقرير سندات القبض والصرف',
   'كشف بجميع السندات الصادرة خلال فترة.',
   'vouchers', 'financial', 4, 'under_construction'),

  ('members', 'تقرير الأعضاء',
   'قائمة الأعضاء مع بياناتهم الأساسية وحالاتهم.',
   'membership_affairs', 'statistical', 5, 'under_construction'),

  ('membership_status', 'تقرير حالة العضوية',
   'ملخص اشتراكات الأعضاء وحالات السداد.',
   'membership_affairs', 'statistical', 6, 'under_construction'),

  ('audit_log', 'تقرير سجل التدقيق',
   'سجل بجميع العمليات الإدارية والتغييرات الحساسة.',
   NULL, 'administrative', 7, 'under_construction')
ON CONFLICT (key) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      module_key = EXCLUDED.module_key,
      report_type = EXCLUDED.report_type,
      sort_order = EXCLUDED.sort_order,
      status = EXCLUDED.status;

-- =====================================================
-- 9) مصفوفة الصلاحيات (Permissions) — 50 صفًا
-- =====================================================

-- تنظيف الصلاحيات القديمة لإعادة الإدراج النظيف
DELETE FROM permissions;

-- -----------------------------------------------------
-- chairman (رئيس مجلس الإدارة) — 24 صلاحية
-- -----------------------------------------------------
-- view على كل الوحدات الـ9
INSERT INTO permissions (role, module_key, action)
SELECT 'chairman', key, 'view' FROM modules;

-- add/edit/delete على: users, settings_maintenance, membership_affairs (9 صلاحيات)
INSERT INTO permissions (role, module_key, action)
VALUES
  ('chairman', 'users', 'add'),
  ('chairman', 'users', 'edit'),
  ('chairman', 'users', 'delete'),
  ('chairman', 'settings_maintenance', 'add'),
  ('chairman', 'settings_maintenance', 'edit'),
  ('chairman', 'settings_maintenance', 'delete'),
  ('chairman', 'membership_affairs', 'add'),
  ('chairman', 'membership_affairs', 'edit'),
  ('chairman', 'membership_affairs', 'delete');

-- add/edit على: collection, expenses, vouchers (6 صلاحيات)
INSERT INTO permissions (role, module_key, action)
VALUES
  ('chairman', 'collection', 'add'),
  ('chairman', 'collection', 'edit'),
  ('chairman', 'expenses', 'add'),
  ('chairman', 'expenses', 'edit'),
  ('chairman', 'vouchers', 'add'),
  ('chairman', 'vouchers', 'edit');

-- -----------------------------------------------------
-- finance_manager (المدير المالي) — 18 صلاحية
-- -----------------------------------------------------
-- view على كل الوحدات الـ9 (9 صلاحيات)
INSERT INTO permissions (role, module_key, action)
SELECT 'finance_manager', key, 'view' FROM modules;

-- add/edit على: membership_affairs, collection, expenses, vouchers (8 صلاحيات)
INSERT INTO permissions (role, module_key, action)
VALUES
  ('finance_manager', 'membership_affairs', 'add'),
  ('finance_manager', 'membership_affairs', 'edit'),
  ('finance_manager', 'collection', 'add'),
  ('finance_manager', 'collection', 'edit'),
  ('finance_manager', 'expenses', 'add'),
  ('finance_manager', 'expenses', 'edit'),
  ('finance_manager', 'vouchers', 'add'),
  ('finance_manager', 'vouchers', 'edit');

-- edit على settings_maintenance (صلاحية واحدة)
INSERT INTO permissions (role, module_key, action)
VALUES
  ('finance_manager', 'settings_maintenance', 'edit');

-- -----------------------------------------------------
-- cashier (أمين الصندوق) — 10 صلاحيات
-- -----------------------------------------------------
-- view على 7 وحدات
INSERT INTO permissions (role, module_key, action)
VALUES
  ('cashier', 'dashboard', 'view'),
  ('cashier', 'collection', 'view'),
  ('cashier', 'expenses', 'view'),
  ('cashier', 'vouchers', 'view'),
  ('cashier', 'treasury_ledger', 'view'),
  ('cashier', 'treasury_reports', 'view'),
  ('cashier', 'membership_affairs', 'view');

-- add على 3 وحدات
INSERT INTO permissions (role, module_key, action)
VALUES
  ('cashier', 'collection', 'add'),
  ('cashier', 'expenses', 'add'),
  ('cashier', 'vouchers', 'add');

-- -----------------------------------------------------
-- auditor (المراجع) — 7 صلاحيات
-- -----------------------------------------------------
-- view على 7 وحدات (لا صلاحيات add/edit/delete)
INSERT INTO permissions (role, module_key, action)
VALUES
  ('auditor', 'dashboard', 'view'),
  ('auditor', 'collection', 'view'),
  ('auditor', 'expenses', 'view'),
  ('auditor', 'vouchers', 'view'),
  ('auditor', 'treasury_ledger', 'view'),
  ('auditor', 'treasury_reports', 'view'),
  ('auditor', 'membership_affairs', 'view');

-- =====================================================
-- 10) بيانات وحدة شؤون العضوية (مرجع — تُدرج في مخطط الوحدة لا هنا)
-- =====================================================
-- تُدرج بيانات الوحدة داخل docs/modules/membership/schema.sql (§15) حتى تبقى
-- الوحدة مكتفية بذاتها (مخطط + بيانات) ويمكن فصلها كتطبيق مستقل.
--
-- مجموعة البيانات التجريبية بعد إعادة الهيكلة (2026-10-01 — نموذج 1:N):
--
--   employers (3):
--     • وزارة التربية          scope=internal   has_deduction_entities=true   ← لها فرع خصم
--     • شركة النيل للمقاولات    scope=external   has_deduction_entities=false  ← صف ذاتي فقط
--     • جهات حكومية            scope=internal   has_deduction_entities=true   ← حاوية (قرار 8)
--
--   deduction_entities (5):
--     • وزارة التربية                    is_self=true   ← الصف الذاتي (قرار 2)
--     • إدارة استحقاقات وزارة التربية     is_self=false  ← فرع تابع (قرار 3/4)
--     • شركة النيل للمقاولات              is_self=true
--     • جهات حكومية                      is_self=true
--     • وزارة المالية                    is_self=false  ← مستقلة تحت الحاوية (قرار 8)
--
--   membership_types (4): عامل / منتسب / فخري / داعم
--   membership_fees  (4): 5/60 — 5/60 — 0/0 — 50/600 (سريان 2026-01-01)
--
-- ترتيب التشغيل للتنصيبة الجديدة:
--   1) docs/schema.sql
--   2) docs/seed.sql                        ← هذا الملف
--   3) docs/modules/membership/schema.sql    ← الجداول + البيانات أعلاه
-- وللقواعد القائمة (ترحيل بدل تنصيب):
--   migrations/2026-10-01-entity-linkage.sql
--   migrations/2026-10-01-entity-linkage.verify.sql   (35 فحص تحقق)

-- =====================================================
-- نهاية seed.sql v3.1
-- =====================================================
