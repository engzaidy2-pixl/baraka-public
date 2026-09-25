-- =====================================================
-- Baraka for Associations — Membership Module Schema
-- الوحدة: شؤون العضوية (Membership Affairs)
-- الملف: docs/modules/membership/schema.sql
-- Supabase: rlqklxmwlzhhexshnijc.supabase.co
-- الإصدار: v1.0
--
-- المتطلبات المسبقة (تُنشأ في docs/schema.sql الأساسي):
--   - جدول profiles
--   - دالة current_user_role() (يُعاد تعريفها هنا دفاعيًا بنفس التعريف)
--
-- يشمل:
--   1) employers                   — جهات العمل
--   2) deduction_entities          — جهات الخصم (إدارات الاستحقاقات)
--   3) employer_deduction_entities — ربط many-to-many
--   4) membership_types            — فئات العضوية
--   5) membership_fees             — سجل الأسعار التاريخي
--   6) members                     — الأعضاء (أساسيون وتابعون)
--   7) subscriptions               — الاشتراكات
--   8) fee_adjustments             — تسويات الأسعار (خصم الزيادة)
--   9) deduction_batches           — دفعات الخصم
--  10) deduction_batch_items       — عناصر الدفعة
--   + RLS: القراءة لأي مستخدم مسجّل، الكتابة لرئيس المجلس/المدير المالي
--   + الفهارس + بيانات أولية (فئات العضوية، الأسعار، جهات تجريبية)
--
-- التشغيل: Supabase → SQL Editor
-- الملف Idempotent: يمكن تنفيذه أكثر من مرة بأمان.
-- =====================================================

-- =====================================================
-- 0) دوال مساعدة
-- =====================================================

-- 0.1) دور المستخدم الحالي
-- إعادة تعريف دفاعية مطابقة لتعريف docs/schema.sql حتى يعمل الملف مستقلًا
-- بعد تنفيذ الأساسي. تحذفها إن أردت الاعتماد على النسخة الأصلية فقط.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- 0.2) تحديث عمود updated_at تلقائيًا (يُربَك بمشغّلات في القسم 11)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- =====================================================
-- 1) جهات العمل (Employers)
-- =====================================================
CREATE TABLE IF NOT EXISTS employers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE employers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read employers" ON employers;
CREATE POLICY "Read employers" ON employers
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage employers" ON employers;
CREATE POLICY "Manage employers" ON employers
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 2) جهات الخصم — إدارات الاستحقاقات (Deduction Entities)
-- letter_template: قالب خطاب الخصم المُرسل للجهة
-- =====================================================
CREATE TABLE IF NOT EXISTS deduction_entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  letter_template TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deduction_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read deduction_entities" ON deduction_entities;
CREATE POLICY "Read deduction_entities" ON deduction_entities
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage deduction_entities" ON deduction_entities;
CREATE POLICY "Manage deduction_entities" ON deduction_entities
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 3) ربط جهات العمل بجهات الخصم (Many-to-Many)
-- is_default: الجهة الافتراضية لخصم رواتب هذه الجهة
-- =====================================================
CREATE TABLE IF NOT EXISTS employer_deduction_entities (
  id SERIAL PRIMARY KEY,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  deduction_entity_id INTEGER NOT NULL REFERENCES deduction_entities(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (employer_id, deduction_entity_id)
);

-- جهة خصم افتراضية واحدة فقط لكل جهة عمل
CREATE UNIQUE INDEX IF NOT EXISTS uq_employer_deduction_entities_default
  ON employer_deduction_entities (employer_id)
  WHERE is_default;

ALTER TABLE employer_deduction_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read employer_deduction_entities" ON employer_deduction_entities;
CREATE POLICY "Read employer_deduction_entities" ON employer_deduction_entities
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage employer_deduction_entities" ON employer_deduction_entities;
CREATE POLICY "Manage employer_deduction_entities" ON employer_deduction_entities
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 4) فئات العضوية (Membership Types)
-- can_be_primary:   تصلح كعضوية أساسية (رئيس أسرة)
-- can_be_dependent: تصلح كعضوية تابِع
-- max_dependents:   أقصى عدد تابعين (0 = بلا حد)
-- covers_dependents: هل تغطي الفئة التابعين أصلًا
-- =====================================================
CREATE TABLE IF NOT EXISTS membership_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  can_be_primary BOOLEAN DEFAULT true,
  can_be_dependent BOOLEAN DEFAULT false,
  max_dependents INTEGER DEFAULT 0 CHECK (max_dependents >= 0),
  covers_dependents BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE membership_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read membership_types" ON membership_types;
CREATE POLICY "Read membership_types" ON membership_types
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage membership_types" ON membership_types;
CREATE POLICY "Manage membership_types" ON membership_types
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 5) سجل الأسعار التاريخي (Membership Fees)
-- صف لكل تغيير سعر؛ effective_to يُحدَّث عند إضافة سعر جديد.
-- =====================================================
CREATE TABLE IF NOT EXISTS membership_fees (
  id SERIAL PRIMARY KEY,
  membership_type_id INTEGER NOT NULL REFERENCES membership_types(id) ON DELETE CASCADE,
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  annual_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (annual_fee >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (membership_type_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE membership_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read membership_fees" ON membership_fees;
CREATE POLICY "Read membership_fees" ON membership_fees
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage membership_fees" ON membership_fees;
CREATE POLICY "Manage membership_fees" ON membership_fees
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 6) الأعضاء (Members) — أساسيون وتابعون
--   - التابع: parent_member_id يشير للعضو الأساسي + relationship
--   - service_status: active (عامل حاليًا) / retired (متقاعد) / other
--   - collection_method_locked / collection_frequency_locked:
--       منع تغيير طريقة/دورية التحصيل (مثلًا لعضو خصم رواتب مفعّل)
--   - max_dependents_override: تجاوز حد التابعين الخاص بالفئة
--   - status: active / suspended (موقوف) / hidden (مخفي)
--   - relationship (نص حر): زوج / زوجة / ابن / ابنة / أب / أم / آخر
-- =====================================================
CREATE TABLE IF NOT EXISTS members (
  -- المعلومات الأساسية
  id SERIAL PRIMARY KEY,
  member_number TEXT UNIQUE,
  full_name TEXT NOT NULL,
  national_id TEXT UNIQUE,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female')),

  -- التواصل
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',

  -- الوظيفة
  employee_number TEXT DEFAULT '',
  employer_id INTEGER REFERENCES employers(id) ON DELETE SET NULL,
  deduction_entity_id INTEGER REFERENCES deduction_entities(id) ON DELETE SET NULL,
  service_status TEXT DEFAULT 'active' CHECK (service_status IN ('active', 'retired', 'other')),
  salary NUMERIC(12,2) CHECK (salary IS NULL OR salary >= 0),

  -- العضوية
  membership_type_id INTEGER REFERENCES membership_types(id) ON DELETE RESTRICT,
  membership_date DATE,
  parent_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  relationship TEXT DEFAULT '',

  -- التحصيل
  collection_method TEXT DEFAULT 'cash' CHECK (collection_method IN ('cash', 'salary_deduction')),
  collection_frequency TEXT DEFAULT 'monthly' CHECK (collection_frequency IN ('monthly', 'annual')),
  collection_method_locked BOOLEAN DEFAULT false,
  collection_frequency_locked BOOLEAN DEFAULT false,
  max_dependents_override INTEGER CHECK (max_dependents_override IS NULL OR max_dependents_override >= 0),

  -- الحالة
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'hidden')),
  notes TEXT DEFAULT '',

  -- ميتا
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read members" ON members;
CREATE POLICY "Read members" ON members
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage members" ON members;
CREATE POLICY "Manage members" ON members
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 7) الاشتراكات (Subscriptions)
-- صف لكل عضو لكل فترة؛ frequency = monthly → period_month مطلوب،
-- frequency = annual → يُسجَّل عادة بـ period_month = 1.
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 1900 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'annual')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'waived', 'cancelled')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'salary_deduction')),
  paid_at TIMESTAMP WITH TIME ZONE,
  receipt_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (member_id, period_year, period_month, frequency)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read subscriptions" ON subscriptions;
CREATE POLICY "Read subscriptions" ON subscriptions
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage subscriptions" ON subscriptions;
CREATE POLICY "Manage subscriptions" ON subscriptions
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 8) تسويات الأسعار — خصم الزيادة (Fee Adjustments)
-- عند رفع السعر: يُنشأ تسوية تعوّض الفارق على الأشهر المتأثرة،
-- ثم تُطبَّق على اشتراك محدد عبر applied_in_subscription_id.
-- =====================================================
CREATE TABLE IF NOT EXISTS fee_adjustments (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reason TEXT DEFAULT '',
  old_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (old_fee >= 0),
  new_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (new_fee >= 0),
  months_affected INTEGER DEFAULT 0 CHECK (months_affected >= 0),
  adjustment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_in_subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE fee_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read fee_adjustments" ON fee_adjustments;
CREATE POLICY "Read fee_adjustments" ON fee_adjustments
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage fee_adjustments" ON fee_adjustments;
CREATE POLICY "Manage fee_adjustments" ON fee_adjustments
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 9) دفعات الخصم (Deduction Batches)
-- دفعة شهرية لكل جهة خصم؛ batch_number يُولَّد في التطبيق
-- (مثال: BAT-2026-01-MOF01). القيد UNIQUE يمنع تكرار الدفعة
-- لنفس (السنة، الشهر، الجهة).
-- =====================================================
CREATE TABLE IF NOT EXISTS deduction_batches (
  id SERIAL PRIMARY KEY,
  batch_number TEXT UNIQUE,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 1900 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  deduction_entity_id INTEGER NOT NULL REFERENCES deduction_entities(id) ON DELETE RESTRICT,
  total_members INTEGER DEFAULT 0 CHECK (total_members >= 0),
  total_dependents INTEGER DEFAULT 0 CHECK (total_dependents >= 0),
  total_amount NUMERIC(12,2) DEFAULT 0 CHECK (total_amount >= 0),
  total_adjustments NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'completed', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  letter_file_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (period_year, period_month, deduction_entity_id)
);

ALTER TABLE deduction_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read deduction_batches" ON deduction_batches;
CREATE POLICY "Read deduction_batches" ON deduction_batches
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage deduction_batches" ON deduction_batches;
CREATE POLICY "Manage deduction_batches" ON deduction_batches
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 10) عناصر الدفعة (Deduction Batch Items)
-- سطر لكل عضو داخل الدفعة. حقول employee_number / full_name /
-- employer_name لقطعة (Snapshot) تبقى صحيحة حتى بعد تعديل بيانات
-- العضو أو حذفه (member_id يُترك NULL عند حذف العضو).
-- dependents_list (JSONB): [{member_id, name, relationship, amount}, ...]
-- =====================================================
CREATE TABLE IF NOT EXISTS deduction_batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES deduction_batches(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  employee_number TEXT DEFAULT '',
  full_name TEXT DEFAULT '',
  employer_name TEXT DEFAULT '',
  primary_amount NUMERIC(12,2) DEFAULT 0 CHECK (primary_amount >= 0),
  dependents_amount NUMERIC(12,2) DEFAULT 0 CHECK (dependents_amount >= 0),
  adjustments_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  dependents_count INTEGER DEFAULT 0 CHECK (dependents_count >= 0),
  dependents_list JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'deducted', 'failed')),
  notes TEXT DEFAULT ''
);

ALTER TABLE deduction_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read deduction_batch_items" ON deduction_batch_items;
CREATE POLICY "Read deduction_batch_items" ON deduction_batch_items
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Manage deduction_batch_items" ON deduction_batch_items;
CREATE POLICY "Manage deduction_batch_items" ON deduction_batch_items
  FOR ALL
  USING (current_user_role() IN ('chairman', 'finance_manager'))
  WITH CHECK (current_user_role() IN ('chairman', 'finance_manager'));

-- =====================================================
-- 11) مشغّلات updated_at (Triggers)
-- =====================================================
DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 12) الفهارس (Indexes)
-- ملاحظة: national_id / member_number لهما فهرس تلقائي من قيد
-- UNIQUE، والفهارس أدناه تُنشأ كما وردت في المواصفات صراحةً.
-- =====================================================

-- members
CREATE INDEX IF NOT EXISTS idx_members_employer         ON members(employer_id);
CREATE INDEX IF NOT EXISTS idx_members_deduction_entity ON members(deduction_entity_id);
CREATE INDEX IF NOT EXISTS idx_members_parent           ON members(parent_member_id);
CREATE INDEX IF NOT EXISTS idx_members_status           ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_type             ON members(membership_type_id);
CREATE INDEX IF NOT EXISTS idx_members_name             ON members(full_name);
CREATE INDEX IF NOT EXISTS idx_members_phone            ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_national_id      ON members(national_id);
CREATE INDEX IF NOT EXISTS idx_members_employee_number  ON members(employee_number);

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_member ON subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- fee_adjustments
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_member ON fee_adjustments(member_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_status ON fee_adjustments(status);

-- deduction_batch_items
CREATE INDEX IF NOT EXISTS idx_deduction_batch_items_batch  ON deduction_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_deduction_batch_items_member ON deduction_batch_items(member_id);

-- فهارس مساعدة إضافية (استعلامات الدفعات والتقارير)
CREATE INDEX IF NOT EXISTS idx_deduction_batches_entity  ON deduction_batches(deduction_entity_id);
CREATE INDEX IF NOT EXISTS idx_deduction_batches_status  ON deduction_batches(status);
CREATE INDEX IF NOT EXISTS idx_membership_fees_type      ON membership_fees(membership_type_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_status        ON deduction_batch_items(status);

-- =====================================================
-- 13) البيانات الأولية (Seed Data)
-- =====================================================

-- 13.1) فئات العضوية الأربع
INSERT INTO membership_types (name, description, can_be_primary, can_be_dependent, max_dependents, covers_dependents, sort_order, status)
VALUES
  ('عامل',  'عضوية أساسية للعاملين، تشمل التابعين بلا حد أقصى', true, false, 0, true,  1, 'active'),
  ('منتسب', 'عضوية انتساب عام، لا تشمل التابعين',               true, false, 0, false, 2, 'active'),
  ('فخري',  'عضوية فخرية مجانية بلا اشتراكات',                  true, false, 0, false, 3, 'active'),
  ('داعم',  'عضوية داعم برسوم أعلى لدعم أنشطة الجمعية',          true, false, 0, false, 4, 'active')
ON CONFLICT (name) DO UPDATE
  SET description       = EXCLUDED.description,
      can_be_primary    = EXCLUDED.can_be_primary,
      can_be_dependent  = EXCLUDED.can_be_dependent,
      max_dependents    = EXCLUDED.max_dependents,
      covers_dependents = EXCLUDED.covers_dependents,
      sort_order        = EXCLUDED.sort_order,
      status            = EXCLUDED.status;

-- 13.2) الأسعار الافتراضية (سجل تاريخي بتاريخ سريان بداية السنة المالية)
-- عامل 5/60 — منتسب 5/60 — فخري 0/0 — داعم 50/600
INSERT INTO membership_fees (membership_type_id, monthly_fee, annual_fee, effective_from, notes)
SELECT
  t.id,
  f.monthly_fee,
  f.annual_fee,
  DATE '2026-01-01',
  f.notes
FROM (VALUES
  ('عامل',  5.00,  60.00,  'السعر الافتراضي'),
  ('منتسب', 5.00,  60.00,  'السعر الافتراضي'),
  ('فخري',  0.00,  0.00,   'عضوية مجانية'),
  ('داعم',  50.00, 600.00, 'السعر الافتراضي')
) AS f(type_name, monthly_fee, annual_fee, notes)
JOIN membership_types t ON t.name = f.type_name
ON CONFLICT (membership_type_id, effective_from) DO UPDATE
  SET monthly_fee = EXCLUDED.monthly_fee,
      annual_fee  = EXCLUDED.annual_fee,
      notes       = EXCLUDED.notes;

-- 13.3) جهة عمل تجريبية
INSERT INTO employers (name, code, address, phone, contact_person, status)
VALUES ('وزارة التربية', 'EDU-001', 'الرياض، المملكة العربية السعودية', '', '', 'active')
ON CONFLICT (name) DO UPDATE
  SET code           = EXCLUDED.code,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

-- 13.4) جهة خصم تجريبية
INSERT INTO deduction_entities (name, code, address, phone, email, contact_person, letter_template, status)
VALUES ('وزارة المالية', 'MOF-001', 'الرياض، المملكة العربية السعودية', '', '', '', '', 'active')
ON CONFLICT (name) DO UPDATE
  SET code    = EXCLUDED.code,
      address = EXCLUDED.address,
      status  = EXCLUDED.status;

-- =====================================================
-- نهاية schema.sql — وحدة شؤون العضوية v1.0
-- =====================================================
