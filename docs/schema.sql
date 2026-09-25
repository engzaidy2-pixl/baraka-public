-- =====================================================
-- Baraka for Associations — schema.sql
-- الإصدار: v3.0 (ترتيب مصحّح لتفادي 42P01: profiles)
-- يشمل: جدول profiles، دالة current_user_role، سياسات profiles،
--        المساحات، المجموعات، الوحدات، التبويبات الفرعية،
--        أيقونات الشريط العلوي، ضبط التطبيق، جداول الضبط الإداري،
--        فهرس التقارير، الصلاحيات، RLS مشدّد، UNIQUE constraints
-- =====================================================

-- =====================================================
-- 1) جدول المستخدمين (Profiles) — بدون سياسات أولاً
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT DEFAULT '',
  username TEXT UNIQUE,
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cashier',
  workspace_id INTEGER, -- يُربط لاحقًا أو يبقى معرف مساحة
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2) دالة مساعدة: دور المستخدم الحالي
-- =====================================================
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- =====================================================
-- 2.b) دالة تسجيل الدخول باسم المستخدم: username → email
-- تُستدعى من الواجهة عبر RPC (get_email_by_username) قبل signInWithPassword،
-- لأن الواجهة قبل الدخول بلا جلسة، وسياسات RLS تمنع قراءة profiles مباشرة.
-- ⚠️ SECURITY DEFINER مع تنفيذ متاح لـ anon: تكشف بريد مستخدم واحد فقط عند
--    معرفة اسم المستخدم (دون كلمة المرور) — لازمة لأن الدخول يبدأ بلا جلسة.
-- ملاحظة: الدالة مُنشأة في المشروع الفعلي؛ هذا القسم يعيد إنتاجها لتنصيبة جديدة.
-- =====================================================
CREATE OR REPLACE FUNCTION get_email_by_username(uname TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(uname) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_email_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon, authenticated;

-- =====================================================
-- 2.c) دالة الدخول السريع: أول مستخدم نشط لكل دور
-- تُستدعى من شاشة الدخول عبر RPC (get_quick_login_users) لبناء أزرار
-- الدخول السريع ديناميكيًا: كل زر يمثل دورًا ويعرض أول مستخدم نشط فيه
-- (بترتيب created_at تصاعديًا). تعمل قبل الجلسة بلا مصادقة لذا هي
-- SECURITY DEFINER — لأن سياسات RLS تمنع قراءة profiles مباشرة قبل الدخول.
-- =====================================================
CREATE OR REPLACE FUNCTION get_quick_login_users()
RETURNS TABLE(role TEXT, username TEXT, full_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT ON (p.role)
    p.role,
    p.username,
    p.full_name
  FROM profiles p
  WHERE p.role IN ('chairman', 'finance_manager', 'cashier', 'auditor')
    AND p.status = 'active'
    AND p.username IS NOT NULL
    AND p.username <> ''
  ORDER BY p.role, p.created_at ASC;
$$;

REVOKE ALL ON FUNCTION get_quick_login_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_quick_login_users() TO anon;
GRANT EXECUTE ON FUNCTION get_quick_login_users() TO authenticated;

-- =====================================================
-- 3) سياسات جدول profiles
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read profiles" ON profiles;
CREATE POLICY "Read profiles" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR current_user_role() IN ('chairman', 'finance_manager')
  );

DROP POLICY IF EXISTS "Update own profile" ON profiles;
DROP POLICY IF EXISTS "Update profiles" ON profiles;
CREATE POLICY "Update profiles" ON profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR current_user_role() IN ('chairman', 'finance_manager')
  )
  WITH CHECK (
    auth.uid() = id
    OR current_user_role() IN ('chairman', 'finance_manager')
  );

DROP POLICY IF EXISTS "Insert profiles" ON profiles;
CREATE POLICY "Insert profiles" ON profiles
  FOR INSERT
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

DROP POLICY IF EXISTS "Delete profiles" ON profiles;
CREATE POLICY "Delete profiles" ON profiles
  FOR DELETE
  USING (current_user_role() = 'chairman');

-- =====================================================
-- 4) جدول الإعدادات العامة (Settings)
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  association_name TEXT NOT NULL DEFAULT 'جمعية البركة الأهلية',
  logo_url TEXT,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  currency TEXT DEFAULT 'EGP',
  fiscal_year INTEGER DEFAULT 2026,
  allow_email_login BOOLEAN DEFAULT false,
  username_case_sensitive BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read settings" ON settings;
CREATE POLICY "Read settings" ON settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Update settings" ON settings;
CREATE POLICY "Update settings" ON settings
  FOR UPDATE
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

DROP POLICY IF EXISTS "Insert settings" ON settings;
CREATE POLICY "Insert settings" ON settings
  FOR INSERT
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

DROP POLICY IF EXISTS "Delete settings" ON settings;
CREATE POLICY "Delete settings" ON settings
  FOR DELETE
  USING (current_user_role() = 'chairman');

-- =====================================================
-- 5) جدول المساحات (Workspaces)
-- =====================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'under_construction'))
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read workspaces" ON workspaces;
CREATE POLICY "Read workspaces" ON workspaces
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage workspaces" ON workspaces;
CREATE POLICY "Manage workspaces" ON workspaces
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- إضافة Foreign Key لـ profiles.workspace_id إن وُجد
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_workspace_id_fkey'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- 6) جدول مجموعات الوحدات (Module Groups)
-- =====================================================
CREATE TABLE IF NOT EXISTS module_groups (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 1
);

ALTER TABLE module_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read module_groups" ON module_groups;
CREATE POLICY "Read module_groups" ON module_groups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage module_groups" ON module_groups;
CREATE POLICY "Manage module_groups" ON module_groups
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 7) جدول الوحدات (Modules)
-- =====================================================
CREATE TABLE IF NOT EXISTS modules (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES module_groups(id) ON DELETE SET NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 1,
  is_reports_hub BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'under_construction' CHECK (status IN ('active', 'under_construction'))
);

-- ترقية الجداول القديمة (إن وُجدت)
ALTER TABLE modules ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES module_groups(id) ON DELETE SET NULL;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_reports_hub BOOLEAN DEFAULT false;

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read modules" ON modules;
CREATE POLICY "Read modules" ON modules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage modules" ON modules;
CREATE POLICY "Manage modules" ON modules
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 8) جدول التبويبات الفرعية (Module Tabs)
-- =====================================================
CREATE TABLE IF NOT EXISTS module_tabs (
  id SERIAL PRIMARY KEY,
  module_key TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'under_construction' CHECK (status IN ('active', 'under_construction'))
);

ALTER TABLE module_tabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read module_tabs" ON module_tabs;
CREATE POLICY "Read module_tabs" ON module_tabs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage module_tabs" ON module_tabs;
CREATE POLICY "Manage module_tabs" ON module_tabs
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 9) جدول أيقونات الشريط العلوي (Topbar Icons)
-- =====================================================
CREATE TABLE IF NOT EXISTS topbar_icons (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  url TEXT,
  show_badge BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'under_construction'))
);

ALTER TABLE topbar_icons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read topbar_icons" ON topbar_icons;
CREATE POLICY "Read topbar_icons" ON topbar_icons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage topbar_icons" ON topbar_icons;
CREATE POLICY "Manage topbar_icons" ON topbar_icons
  FOR ALL
  USING (current_user_role() = 'chairman')
  WITH CHECK (current_user_role() = 'chairman');

-- =====================================================
-- 10) جدول ضبط التطبيق (App Settings)
-- =====================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('display', 'print', 'notifications', 'advanced', 'general')),
  scope TEXT DEFAULT 'system' CHECK (scope IN ('system', 'user')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read app_settings" ON app_settings;
CREATE POLICY "Read app_settings" ON app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage app_settings" ON app_settings;
CREATE POLICY "Manage app_settings" ON app_settings
  FOR ALL
  USING (
    scope = 'user'
    OR current_user_role() IN ('chairman', 'finance_manager')
  )
  WITH CHECK (
    scope = 'user'
    OR current_user_role() IN ('chairman', 'finance_manager')
  );

-- =====================================================
-- 11) جداول الضبط الإداري (للتفعيل المستقبلي)
-- =====================================================

-- 11.1) جدول المخازن (Warehouses)
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  manager_name TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read warehouses" ON warehouses;
CREATE POLICY "Read warehouses" ON warehouses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage warehouses" ON warehouses;
CREATE POLICY "Manage warehouses" ON warehouses
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- 11.2) جدول الفروع (Branches)
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read branches" ON branches;
CREATE POLICY "Read branches" ON branches
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage branches" ON branches;
CREATE POLICY "Manage branches" ON branches
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- 11.3) جدول الأقسام (Departments)
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  manager_name TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read departments" ON departments;
CREATE POLICY "Read departments" ON departments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage departments" ON departments;
CREATE POLICY "Manage departments" ON departments
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- 11.4) جدول المشاريع (Projects)
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  budget NUMERIC(15,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read projects" ON projects;
CREATE POLICY "Read projects" ON projects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage projects" ON projects;
CREATE POLICY "Manage projects" ON projects
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 12) جدول الصلاحيات (Permissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  module_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'add', 'edit', 'delete'))
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read permissions" ON permissions;
CREATE POLICY "Read permissions" ON permissions
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage permissions" ON permissions;
CREATE POLICY "Manage permissions" ON permissions
  FOR ALL
  USING (current_user_role() = 'chairman')
  WITH CHECK (current_user_role() = 'chairman');

-- =====================================================
-- 13) جدول فهرس التقارير (Reports Catalog)
-- =====================================================
CREATE TABLE IF NOT EXISTS reports_catalog (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  module_key TEXT,
  report_type TEXT DEFAULT 'financial'
    CHECK (report_type IN ('financial', 'statistical', 'administrative')),
  parameters JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'under_construction'
    CHECK (status IN ('active', 'under_construction'))
);

ALTER TABLE reports_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read reports_catalog" ON reports_catalog;
CREATE POLICY "Read reports_catalog" ON reports_catalog
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage reports_catalog" ON reports_catalog;
CREATE POLICY "Manage reports_catalog" ON reports_catalog
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 14) الفهارس (Indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_modules_key ON modules(key);
CREATE INDEX IF NOT EXISTS idx_modules_group_id ON modules(group_id);
CREATE INDEX IF NOT EXISTS idx_modules_workspace_id ON modules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_permissions_role ON permissions(role);
CREATE INDEX IF NOT EXISTS idx_permissions_module_key ON permissions(module_key);
CREATE INDEX IF NOT EXISTS idx_reports_catalog_key ON reports_catalog(key);
CREATE INDEX IF NOT EXISTS idx_reports_catalog_module_key ON reports_catalog(module_key);

-- فهارس الجداول الجديدة
CREATE INDEX IF NOT EXISTS idx_module_tabs_module_key ON module_tabs(module_key);
CREATE INDEX IF NOT EXISTS idx_topbar_icons_key ON topbar_icons(key);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
CREATE INDEX IF NOT EXISTS idx_warehouses_status ON warehouses(status);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- =====================================================
-- 15) قيود UNIQUE (لتمكين ON CONFLICT)
-- =====================================================

-- UNIQUE على modules.key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'modules_key_unique'
  ) THEN
    ALTER TABLE modules ADD CONSTRAINT modules_key_unique UNIQUE (key);
  END IF;
END $$;

-- UNIQUE مركّب على module_tabs(module_key, key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'module_tabs_module_key_key_unique'
  ) THEN
    ALTER TABLE module_tabs
      ADD CONSTRAINT module_tabs_module_key_key_unique
      UNIQUE (module_key, key);
  END IF;
END $$;

-- UNIQUE مركّب على permissions(role, module_key, action)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'permissions_role_module_action_unique'
  ) THEN
    ALTER TABLE permissions
      ADD CONSTRAINT permissions_role_module_action_unique
      UNIQUE (role, module_key, action);
  END IF;
END $$;

-- =====================================================
-- نهاية schema.sql v3.0
-- =====================================================
