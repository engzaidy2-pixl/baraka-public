-- =====================================================
-- شؤون العضوية — schema.sql v2.1
-- المرحلة 0 + 1 + 3A مدمجة — C7 / C8 / C10 / N5
-- تثبيت جديد على Supabase، وإعادة تشغيل آمنة لنفس الإصدار.
-- ليس ترحيلاً لمخطط قديم؛ لا ينشئ أي VIEW توافقي [N5].
-- يفترض وجود auth.users وauth.uid() وأدوار Supabase القياسية فقط.
-- لا تُستبدل بيانات المستخدمين عند إعادة تشغيل البيانات الأولية.
-- =====================================================
BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- متطلب المنصة: يُنشأ فقط إذا كانت قاعدة التطبيق فارغة تماماً.
-- إدارة الأدوار من SQL Editor/الخادم الموثوق حصراً، لا من العميل.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT DEFAULT '',
  username TEXT UNIQUE,
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cashier',
  workspace_id INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1) جهات العمل [D1، C10]
CREATE TABLE IF NOT EXISTS employers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  email TEXT DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'external')),
  has_deduction_entities BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جهات الخصم: ارتباط مباشر 1:N
CREATE TABLE IF NOT EXISTS deduction_entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE RESTRICT,
  is_self BOOLEAN NOT NULL DEFAULT false,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  letter_template TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (employer_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_entities_self
  ON deduction_entities (employer_id) WHERE is_self = true;
CREATE INDEX IF NOT EXISTS idx_deduction_entities_employer
  ON deduction_entities (employer_id);

-- فئات العضوية
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

-- سجل الأسعار
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

-- الأعضاء
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
  service_status TEXT DEFAULT 'active' CHECK (service_status IN ('active', 'retired', 'external', 'other')),
  salary NUMERIC(12,2) CHECK (salary IS NULL OR salary >= 0),

  -- العضوية
  membership_type_id INTEGER REFERENCES membership_types(id) ON DELETE RESTRICT,
  membership_date DATE,
  parent_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  relationship TEXT DEFAULT '',

  -- التحصيل
  collection_method TEXT DEFAULT 'cash' CHECK (collection_method IN ('cash', 'salary_deduction', 'bank_transfer')),
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

-- عداد ذري خاص لا يمكن للعميل قراءته أو تعديله [C10].
CREATE TABLE IF NOT EXISTS member_counters (
  counter_key TEXT PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);
ALTER TABLE member_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE member_counters FROM PUBLIC, anon, authenticated;

-- الاشتراكات [C8]
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 1900 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'annual')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'waived', 'cancelled')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'salary_deduction', 'bank_transfer')),
  paid_at TIMESTAMP WITH TIME ZONE,
  receipt_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (member_id, period_year, period_month, frequency)
);

-- تسويات الأسعار [C8]
CREATE TABLE IF NOT EXISTS fee_adjustments (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
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

-- دفعات الخصم [D2]
CREATE TABLE IF NOT EXISTS deduction_batches (
  id SERIAL PRIMARY KEY,
  batch_number TEXT UNIQUE,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 1900 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  payment_method TEXT NOT NULL DEFAULT 'salary_deduction',
  deduction_entity_id INTEGER REFERENCES deduction_entities(id) ON DELETE RESTRICT,
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
  UNIQUE (period_year, period_month, deduction_entity_id),
  CONSTRAINT deduction_batches_payment_method_check
    CHECK (payment_method IN ('salary_deduction', 'cash_demand')),
  CONSTRAINT deduction_batches_salary_requires_entity
    CHECK (payment_method <> 'salary_deduction' OR deduction_entity_id IS NOT NULL)
);

-- عناصر الدفعة ولقطات البيانات التاريخية
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

-- دور المستخدم النشط؛ لا يُؤخذ الدور من بيانات يحررها العميل.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role FROM public.profiles
  WHERE id = auth.uid() AND status = 'active';
$$;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

-- إعادة حساب المجاميع من العناصر الفعلية [C7].
-- SECURITY DEFINER لا يعفي المستدعي من فحص صلاحية الكتابة.
-- العدد يشمل اللقطات التاريخية حتى إذا أصبح member_id فارغاً.
CREATE OR REPLACE FUNCTION public.recalc_batch_totals(p_batch_id INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND COALESCE(public.current_user_role(), '') NOT IN ('chairman', 'finance_manager') THEN
    RAISE EXCEPTION 'غير مصرح بإعادة حساب الدفعة' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.deduction_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الدفعة غير موجودة' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.deduction_batches b
  SET total_members = t.n,
      total_dependents = t.dependents,
      total_amount = t.amount,
      total_adjustments = t.adjustments
  FROM (
    SELECT COUNT(*)::INTEGER AS n,
           COALESCE(SUM(dependents_count), 0)::INTEGER AS dependents,
           COALESCE(SUM(total_amount), 0) AS amount,
           COALESCE(SUM(adjustments_amount), 0) AS adjustments
    FROM public.deduction_batch_items WHERE batch_id = p_batch_id
  ) t
  WHERE b.id = p_batch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recalc_batch_totals(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_batch_totals(INTEGER) TO authenticated, service_role;

-- أرقام العضوية: زيادة ذرية آمنة عند الإدراج المتزامن [C10].
-- الرقم ثابت بعد تعيينه؛ تقبل أرقام الاستيراد بنفس الصيغة وتقدم العداد.
-- خمسة أرقام كحد أدنى، بدون اقتطاع عند تجاوز 99999.
CREATE OR REPLACE FUNCTION public.members_assign_member_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_number BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' AND NULLIF(BTRIM(OLD.member_number), '') IS NOT NULL THEN
    IF NEW.member_number IS DISTINCT FROM OLD.member_number THEN
      RAISE EXCEPTION 'لا يمكن تغيير رقم العضوية بعد تعيينه' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NULLIF(BTRIM(NEW.member_number), '') IS NULL THEN
    INSERT INTO public.member_counters AS c (counter_key, last_value)
    VALUES ('members', 1)
    ON CONFLICT (counter_key) DO UPDATE SET last_value = c.last_value + 1
    RETURNING last_value INTO v_number;
    NEW.member_number := 'M-' || LPAD(v_number::TEXT, GREATEST(5, LENGTH(v_number::TEXT)), '0');
  ELSE
    IF NEW.member_number !~ '^M-[0-9]{5,19}$' THEN
      RAISE EXCEPTION 'صيغة رقم العضوية غير صحيحة' USING ERRCODE = '23514';
    END IF;
    v_number := SUBSTRING(NEW.member_number FROM 3)::BIGINT;
    IF v_number < 1 OR NEW.member_number <>
       'M-' || LPAD(v_number::TEXT, GREATEST(5, LENGTH(v_number::TEXT)), '0') THEN
      RAISE EXCEPTION 'رقم العضوية غير قياسي' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.member_counters AS c (counter_key, last_value)
    VALUES ('members', v_number)
    ON CONFLICT (counter_key) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.members_assign_member_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_members_assign_member_number ON members;
CREATE TRIGGER trg_members_assign_member_number
  BEFORE INSERT OR UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION public.members_assign_member_number();

-- دوال مشغلات الربط؛ تُحل أسماء الدوال المساعدة عند التنفيذ بعد اكتمال الملف.
CREATE OR REPLACE FUNCTION public.employers_ensure_self_entity_trigger()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.ensure_self_deduction_entity(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduction_entities_assign_employer_trigger()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.employer_id IS NULL THEN
    NEW.employer_id := public.ensure_container_employer();
  END IF;
  -- منع نقل جهة خصم مرتبطة بأعضاء إلى جهة عمل أخرى.
  IF TG_OP = 'UPDATE' AND NEW.employer_id IS DISTINCT FROM OLD.employer_id
     AND EXISTS (SELECT 1 FROM public.members WHERE deduction_entity_id = OLD.id) THEN
    RAISE EXCEPTION 'انقل الأعضاء أولاً قبل نقل جهة الخصم' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_self
     AND (NOT NEW.is_self OR NEW.employer_id IS DISTINCT FROM OLD.employer_id) THEN
    RAISE EXCEPTION 'لا يمكن نقل الصف الذاتي أو تحويله إلى فرع' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.members_link_deduction_entity_trigger()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner INTEGER;
  v_explicit BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_explicit := NEW.deduction_entity_id IS NOT NULL;
  ELSE
    v_explicit := NEW.deduction_entity_id IS DISTINCT FROM OLD.deduction_entity_id;
  END IF;
  IF NEW.employer_id IS NULL THEN
    NEW.deduction_entity_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.deduction_entity_id IS NOT NULL THEN
    SELECT employer_id INTO v_owner FROM public.deduction_entities
    WHERE id = NEW.deduction_entity_id FOR SHARE;
    IF v_owner = NEW.employer_id THEN
      RETURN NEW;
    END IF;
    IF v_explicit THEN
      RAISE EXCEPTION 'جهة الخصم لا تتبع جهة عمل العضو' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.deduction_entity_id := public.ensure_self_deduction_entity(NEW.employer_id);
  RETURN NEW;
END;
$$;

-- PostgreSQL لا يدعم IF NOT EXISTS للمشغلات والسياسات: إسقاط ثم إنشاء.
DROP TRIGGER IF EXISTS trg_employers_ensure_self_entity ON employers;
CREATE TRIGGER trg_employers_ensure_self_entity
  AFTER INSERT OR UPDATE ON employers
  FOR EACH ROW EXECUTE FUNCTION public.employers_ensure_self_entity_trigger();
DROP TRIGGER IF EXISTS trg_deduction_entities_assign_employer ON deduction_entities;
CREATE TRIGGER trg_deduction_entities_assign_employer
  BEFORE INSERT OR UPDATE ON deduction_entities
  FOR EACH ROW EXECUTE FUNCTION public.deduction_entities_assign_employer_trigger();
DROP TRIGGER IF EXISTS trg_members_link_deduction_entity ON members;
CREATE TRIGGER trg_members_link_deduction_entity
  BEFORE INSERT OR UPDATE OF employer_id, deduction_entity_id ON members
  FOR EACH ROW EXECUTE FUNCTION public.members_link_deduction_entity_trigger();

-- المساعدات تعمل بصلاحيات المستدعي وتخضع لـ RLS، وليست منفذاً لتجاوزه.
CREATE OR REPLACE FUNCTION public.ensure_container_employer()
RETURNS INTEGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM public.employers WHERE name = 'جهات حكومية';
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO public.employers (name, code, scope, has_deduction_entities)
  VALUES ('جهات حكومية', 'GOV-000', 'internal', true)
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_self_deduction_entity(p_employer_id INTEGER)
RETURNS INTEGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id INTEGER;
  v_name TEXT;
BEGIN
  IF p_employer_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.deduction_entities
  WHERE employer_id = p_employer_id AND is_self;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT name INTO v_name FROM public.employers WHERE id = p_employer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جهة العمل غير موجودة' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.deduction_entities (employer_id, name, is_self)
  VALUES (p_employer_id, v_name, true)
  ON CONFLICT (employer_id) WHERE is_self = true
  DO UPDATE SET is_self = true
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- تحديث الطوابع الزمنية.
CREATE OR REPLACE FUNCTION public.membership_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION public.membership_set_updated_at();
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.membership_set_updated_at();

-- تحصين صلاحيات الدوال؛ المشغلات لا تحتاج منحة EXECUTE للمستخدم.
REVOKE ALL ON FUNCTION public.employers_ensure_self_entity_trigger(),
  public.deduction_entities_assign_employer_trigger(),
  public.members_link_deduction_entity_trigger(),
  public.membership_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_container_employer(),
  public.ensure_self_deduction_entity(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_container_employer(),
  public.ensure_self_deduction_entity(INTEGER) TO authenticated, service_role;

-- سياسات RLS: قراءة للمسجلين، كتابة لرئيس المجلس والمدير المالي النشطين.
-- العداد مستثنى عمداً: RLS بلا سياسات ولا منح للعميل.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
DROP POLICY IF EXISTS membership_read_own_profile ON public.profiles;
CREATE POLICY membership_read_own_profile ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DO $$
DECLARE
  t TEXT;
  seq_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employers', 'deduction_entities', 'membership_types', 'membership_fees',
    'members', 'subscriptions', 'fee_adjustments', 'deduction_batches', 'deduction_batch_items'
  ] LOOP
    EXECUTE FORMAT('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE FORMAT('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE FORMAT('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE FORMAT('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE FORMAT('DROP POLICY IF EXISTS membership_read ON public.%I', t);
    EXECUTE FORMAT('CREATE POLICY membership_read ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE FORMAT('DROP POLICY IF EXISTS membership_manage ON public.%I', t);
    EXECUTE FORMAT(
      'CREATE POLICY membership_manage ON public.%I FOR ALL TO authenticated
       USING (public.current_user_role() IN (''chairman'', ''finance_manager''))
       WITH CHECK (public.current_user_role() IN (''chairman'', ''finance_manager''))', t);
    seq_name := pg_get_serial_sequence(FORMAT('public.%I', t), 'id');
    EXECUTE FORMAT('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', seq_name);
    EXECUTE FORMAT('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq_name);
    EXECUTE FORMAT('GRANT ALL ON SEQUENCE %s TO service_role', seq_name);
  END LOOP;
END;
$$;
REVOKE ALL ON TABLE public.member_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.member_counters TO service_role;

-- فهارس الاستعلامات ومنع تكرار دفعات المطالبة النقدية.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_batches_cash_period
  ON deduction_batches (period_year, period_month) WHERE deduction_entity_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_employers_scope ON employers(scope);
CREATE INDEX IF NOT EXISTS idx_members_employer ON members(employer_id);
CREATE INDEX IF NOT EXISTS idx_members_deduction_entity ON members(deduction_entity_id);
CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_member_id);
CREATE INDEX IF NOT EXISTS idx_members_type ON members(membership_type_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_service_status ON members(service_status);
CREATE INDEX IF NOT EXISTS idx_members_collection_method ON members(collection_method);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(full_name);
CREATE INDEX IF NOT EXISTS idx_members_employee_number ON members(employee_number);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_member ON fee_adjustments(member_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_subscription ON fee_adjustments(applied_in_subscription_id);
CREATE INDEX IF NOT EXISTS idx_deduction_batches_entity ON deduction_batches(deduction_entity_id);
CREATE INDEX IF NOT EXISTS idx_deduction_batches_payment_method ON deduction_batches(payment_method);
CREATE INDEX IF NOT EXISTS idx_deduction_batch_items_batch ON deduction_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_deduction_batch_items_member ON deduction_batch_items(member_id);

-- بيانات أولية: تحفظ الأسماء المستخدمة في الواجهة (عامل، منتسب، فخري، داعم).
INSERT INTO membership_types
  (name, description, can_be_primary, can_be_dependent, max_dependents, covers_dependents, sort_order)
VALUES
  ('عامل', 'عضو عامل، تشمل عضويته التابعين', true, false, 0, true, 1),
  ('منتسب', 'عضو منتسب', true, false, 0, false, 2),
  ('فخري', 'عضو فخري بلا اشتراكات', true, false, 0, false, 3),
  ('داعم', 'عضو داعم لأنشطة الجمعية', true, false, 0, false, 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO membership_fees (membership_type_id, monthly_fee, annual_fee, effective_from, notes)
SELECT t.id, f.monthly_fee, f.annual_fee, DATE '2026-01-01', 'السعر الافتراضي'
FROM (VALUES
  ('عامل', 5.00, 60.00), ('منتسب', 5.00, 60.00),
  ('فخري', 0.00, 0.00), ('داعم', 50.00, 600.00)
) AS f(name, monthly_fee, annual_fee)
JOIN membership_types t ON t.name = f.name
ON CONFLICT (membership_type_id, effective_from) DO NOTHING;

-- الحاوية ثم جهات تجريبية؛ ينشئ المشغل الصف الذاتي تلقائياً.
SELECT public.ensure_container_employer();
INSERT INTO employers (name, code, address, scope, has_deduction_entities)
VALUES
  ('وزارة التربية', 'EDU-001', 'الرياض، المملكة العربية السعودية', 'internal', true),
  ('شركة النيل للمقاولات', 'EXT-001', 'الجيزة، مصر', 'external', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO deduction_entities (name, code, employer_id, is_self, address)
SELECT x.name, x.code, e.id, false, x.address
FROM (VALUES
  ('إدارة استحقاقات وزارة التربية', 'EDU-001-BEN', 'وزارة التربية', 'الرياض'),
  ('وزارة المالية', 'MOF-001', 'جهات حكومية', 'الرياض')
) AS x(name, code, employer_name, address)
JOIN employers e ON e.name = x.employer_name
ON CONFLICT (employer_id, name) DO NOTHING;

COMMIT;
-- =====================================================
-- نهاية schema.sql v2.1 — المرحلة 0 + 1 + 3A
-- لا يوجد جدول وسيط أو VIEW توافقي [N5].
-- =====================================================