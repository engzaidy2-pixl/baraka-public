-- =====================================================
-- Baraka for Associations — Membership Module Schema
-- الوحدة: شؤون العضوية (Membership Affairs)
-- الملف: docs/modules/membership/schema.sql
-- Supabase: rlqklxmwlzhhexshnijc.supabase.co
-- الإصدار: v2.0 — المرحلة 0 (تسوية الانحراف) + المرحلة 1 (الربط المباشر 1:N)
-- تاريخ التسوية: 2026-09-25
-- ملف الترحيل المرافق: migrations/2026-10-01-entity-linkage.sql
--
-- المتطلبات المسبقة (تُنشأ في docs/schema.sql الأساسي):
--   - جدول profiles
--   - دالة current_user_role() (يُعاد تعريفها هنا دفاعيًا بنفس التعريف)
--
-- يشمل:
--   1) employers                   — جهات العمل (+scope +has_deduction_entities)
--   2) deduction_entities          — جهات الخصم (+employer_id +is_self → علاقة 1:N مباشرة)
--   3) دوال ومشغّلات الربط         — الصف الذاتي، حاوية الجهات المستقلة، تكامل العضو
--   4) تسوية البيانات              — ترحيل العلاقة القديمة وربط الأعضاء
--   5) employer_deduction_entities — VIEW توافقي (كان جدول many-to-many)
--   6) membership_types            — فئات العضوية
--   7) membership_fees             — سجل الأسعار التاريخي
--   8) members                     — الأعضاء (أساسيون وتابعون)
--   9) subscriptions               — الاشتراكات
--  10) fee_adjustments             — تسويات الأسعار (خصم الزيادة)
--  11) deduction_batches           — دفعات الخصم (+payment_method)
--  12) deduction_batch_items       — عناصر الدفعة
--   + RLS: القراءة لأي مستخدم مسجّل، الكتابة لرئيس المجلس/المدير المالي
--   + الفهارس + بيانات أولية (فئات العضوية، الأسعار، جهات تجريبية مترابطة)
--
-- التشغيل: Supabase → SQL Editor
-- الملف Idempotent: يمكن تنفيذه أكثر من مرة بأمان.
--
-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ 📌 سجل التغييرات — المرحلة 0: تسوية الانحراف مع membership.js ║
-- ╚═══════════════════════════════════════════════════════════════╝
-- الانحراف = فرق بين ما يعلنه المخطط وما ينفّذه الكود فعلًا. كل بند أدناه
-- رُصد بموضع محدد في docs/modules/membership/membership.js وصُحّح هنا.
--
-- ┌───┬──────────────────────────────────┬──────────────────────────────────────────────┐
-- │ # │ الانحراف                          │ المعالجة                                      │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D1 │ employers.scope مستخدم في الكود   │ أُضيف العمود + CHECK(internal,external)       │
-- │   │ (سطر 572/1106/1257/1808) وغير     │ + فهرس idx_employers_scope + تعليق.          │
-- │   │ معرَّف في المخطط → خطأ 42703      │ (كان يفشل تحميل قائمة جهات العمل بالكامل)     │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D2 │ deduction_batches.payment_method  │ أُضيف العمود + CHECK(salary_deduction,        │
-- │   │ مستخدم (سطر 3107/3640/3814/4575)  │ cash_demand) + استنباط قيم الصفوف القديمة    │
-- │   │ وغير معرَّف → خطأ 42703           │ + فهرس idx_deduction_batches_payment_method. │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D3 │ members.service_status: الكود     │ وُسِّع القيد إلى                              │
-- │   │ يكتب/يفلتر 'external'             │ (active, retired, external, other).          │
-- │   │ (سطر 1449/3583 + خيار في HTML)    │                                              │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D4 │ members.collection_method:        │ وُسِّع القيد إلى                              │
-- │   │ الواجهة تعرض 'bank_transfer'      │ (cash, salary_deduction, bank_transfer).     │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D5 │ subscriptions.payment_method:     │ وُسِّع القيد ليشمل 'bank_transfer'            │
-- │   │ الواجهة تعرض 'bank_transfer'      │ (كان الإدراج يفشل 23514).                    │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D6 │ deduction_batches.                │ أُسقط NOT NULL — دفعات «المطالبة النقدية»     │
-- │   │ deduction_entity_id NOT NULL      │ بلا جهة خصم (سطر 3815/4575 = null).          │
-- │   │ بينما الكود يُدرج NULL            │                                              │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D7 │ UNIQUE(period_year,period_month,  │ أُضيف فهرس فريد جزئي                          │
-- │   │ deduction_entity_id) لا يمنع      │ uq_deduction_batches_cash_period على          │
-- │   │ تكرار الدفعات النقدية (NULL)      │ (period_year, period_month) WHERE entity NULL │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D8 │ لا قيد يربط نوع الدفعة بجهتها     │ أُضيف CHECK: دفعة salary_deduction تتطلب      │
-- │   │ (منطق الكود سطر 4565 فقط)         │ جهة خصم غير فارغة.                           │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D9 │ تعليق batch_number يذكر الصيغة    │ صُحّح التعليق إلى الصيغة الفعلية المولَّدة    │
-- │   │ BAT-2026-01-MOF01                 │ في generateBatchNumber: B-2026-09-001.       │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D10│ members.deduction_entity_id       │ ✔ موجود أصلًا مع FK وفهرس — لا إضافة.        │
-- │   │                                   │ كان يُقرأ (سطر 3554) ولا يُكتب أبدًا؛ صار    │
-- │   │                                   │ يُملأ تلقائيًا بمشغّل الربط (المرحلة 1).     │
-- ├───┼──────────────────────────────────┼──────────────────────────────────────────────┤
-- │D11│ فهارس ناقصة لاستعلامات الكود      │ أُضيفت: employers(scope),                    │
-- │   │                                   │ members(service_status, collection_method),  │
-- │   │                                   │ deduction_batches(payment_method),           │
-- │   │                                   │ deduction_batches(period_year,period_month), │
-- │   │                                   │ deduction_entities(employer_id).             │
-- └───┴──────────────────────────────────┴──────────────────────────────────────────────┘
--
-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ 📌 سجل التغييرات — المرحلة 1: إعادة هيكلة الربط بين الجهتين  ║
-- ╚═══════════════════════════════════════════════════════════════╝
-- القرارات المعمارية المطبَّقة:
--   1) نموذج 1:N مباشرة — كل جهة خصم تابعة لجهة عمل واحدة فقط.
--   2) حل «الصف الذاتي» (Self Entity) — is_self boolean.
--   3) Checkbox «لها جهات استحقاق فرعية» في نافذة جهة العمل — has_deduction_entities.
--   4) Modal فرعي لإدارة جهات الخصم التابعة (المرحلة 2/3 — الواجهة).
--   5) نافذة العضو: Cascading Dropdown (المرحلة 2/3 — الواجهة؛ المشغّل هنا يضمن التكامل).
--   6) التجميع حسب deduction_entity_id (دفعات الخصم).
--   7) سياسة النقل: إبقاء الأعضاء على الصف الذاتي عند تغيّر جهة العمل.
--   8) الجهات المستقلة: جهة عمل حاوية باسم «جهات حكومية».
--
-- ┌───┬────────────────────────────────────────────────────────────────────────────────┐
-- │L1 │ employers.has_deduction_entities BOOLEAN DEFAULT false                         │
-- │L2 │ deduction_entities.employer_id INTEGER NOT NULL → employers(id) ON DELETE      │
-- │   │ CASCADE (+ فهرس). يُملأ تلقائيًا بالحاوية عند الإدراج بلا جهة.                 │
-- │L3 │ deduction_entities.is_self BOOLEAN NOT NULL DEFAULT false                      │
-- │   │ + فهرس فريد جزئي: صف ذاتي واحد فقط لكل جهة عمل.                                │
-- │L4 │ دوال: ensure_container_employer() / ensure_self_deduction_entity(id) /         │
-- │   │ ensure_all_self_deduction_entities() / sync_employer_deduction_flags()         │
-- │   │ + مشغّلات: ضمان الصف الذاتي عند إنشاء/تعديل جهة العمل، وتعيين الحاوية          │
-- │   │ لجهة الخصم اليتيمة، ونقل الأعضاء إلى الصف الذاتي عند حذف جهة خصم.              │
-- │L5 │ مشغّل تكامل العضو trg_members_link_deduction_entity:                           │
-- │   │  • بلا جهة عمل ← بلا جهة خصم                                                   │
-- │   │  • جهة خصم صريحة ومتسقة ← تُقبل كما هي (أساس الـ Cascading Dropdown)           │
-- │   │  • جهة خصم صريحة وغير متسقة ← استثناء 23514                                    │
-- │   │  • جهة خصم غائبة/قديمة ← الصف الذاتي لجهة العمل (قرار 7)                       │
-- │L6 │ إسقاط جدول employer_deduction_entities واستبداله بـ VIEW توافقي بنفس الاسم      │
-- │   │ والأعمدة (id, employer_id, deduction_entity_id, is_default, notes, created_at)  │
-- │   │ حتى لا ينكسر resolveDeductionEntity في membership.js (سطر 3695) قبل المرحلة 2. │
-- │L7 │ ترحيل البيانات: علاقات الجدول الوسيط ← deduction_entities.employer_id،          │
-- │   │ إنشاء الصفوف الذاتية، ضم الجهات المستقلة للحاوية، وربط أعضاء كل جهة            │
-- │   │ عمل بصفها الذاتي.                                                              │
-- └───┴────────────────────────────────────────────────────────────────────────────────┘
--
-- ╔═══════════════════════════════════════════════════════════════╗
-- ║ 📌 أعمدة/جداول محفوظة عمدًا (لا يستخدمها membership.js بعد)   ║
-- ╚═══════════════════════════════════════════════════════════════╝
-- لم تُحذف لأنها مزايا موثَّقة في README وعلى خارطة الطريق، وحذفها يعني
-- كسر مراحل تالية — لكنها مُعلَّمة هنا بوضوح حتى لا تُحسب انحرافًا صامتًا:
--   • التابعون/الهرمية:  members.parent_member_id, relationship, date_of_birth,
--                        gender, whatsapp, email, address, salary,
--                        membership_types.can_be_dependent/max_dependents/covers_dependents
--   • قفل التحصيل:       members.collection_frequency, collection_method_locked,
--                        collection_frequency_locked, max_dependents_override
--   • تسويات الأسعار:    جدول fee_adjustments كاملًا (+ deduction_batches.total_adjustments,
--                        deduction_batch_items.adjustments_amount)
--   • خطابات الخصم:      deduction_entities.letter_template,
--                        deduction_batches.sent_at/completed_at/letter_file_url,
--                        deduction_batches.total_dependents
--   • تدقيق:             *.created_by
-- ما حُذف فعلًا في هذه المرحلة: جدول employer_deduction_entities (استُبدل بـ VIEW) —
-- لأنه يتعارض مع نموذج 1:N المقرَّر، ولا يستخدمه الكود إلا قراءةً واحدة قابلة للتعويض.
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

-- 0.2) تحديث عمود updated_at تلقائيًا (يُربَك بمشغّلات في القسم 13)
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
-- scope:                  internal = جهة داخلية معتمدة لخصم الرواتب،
--                         external = جهة خارجية (عضو يعمل لديها بلا خصم راتب).
--                         [D1] كان يستخدمه membership.js دون تعريف في المخطط.
-- has_deduction_entities: [L1/قرار 3] checkbox «لها جهات استحقاق فرعية».
--                         false = الجهة نفسها هي جهة الخصم (صف ذاتي فقط)،
--                         true  = لها جهات خصم فرعية تُدار من modal فرعي.
-- =====================================================
CREATE TABLE IF NOT EXISTS employers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'internal',
  has_deduction_entities BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.1) ترقية التنصيبات القائمة [D1] — عمود scope
ALTER TABLE employers ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'internal';
UPDATE employers SET scope = 'internal' WHERE scope IS NULL OR scope NOT IN ('internal', 'external');
ALTER TABLE employers ALTER COLUMN scope SET DEFAULT 'internal';
ALTER TABLE employers ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employers_scope_check') THEN
    ALTER TABLE employers ADD CONSTRAINT employers_scope_check CHECK (scope IN ('internal', 'external'));
  END IF;
END $$;

-- 1.2) ترقية التنصيبات القائمة [L1] — عمود has_deduction_entities
ALTER TABLE employers ADD COLUMN IF NOT EXISTS has_deduction_entities BOOLEAN DEFAULT false;
ALTER TABLE employers ALTER COLUMN has_deduction_entities SET DEFAULT false;

COMMENT ON COLUMN employers.scope IS 'نطاق الجهة: internal = داخلية معتمدة لخصم الرواتب، external = خارجية بلا خصم';
COMMENT ON COLUMN employers.has_deduction_entities IS 'هل لهذه الجهة فروع خصم؟ false = الجهة نفسها هي جهة الخصم';

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
-- employer_id:     [L2/قرار 1] العلاقة المباشرة 1:N — كل جهة خصم تتبع جهة عمل واحدة.
--                  اليتيمة تُضمّ تلقائيًا للحاوية «جهات حكومية» (قرار 8).
-- is_self:         [L3/قرار 2] الصف الذاتي — يمثل جهة العمل نفسها كجهة خصم
--                  (الخيار الافتراضي عند has_deduction_entities = false،
--                   والمرساة التي يبقى عليها الأعضاء عند النقل — قرار 7).
-- letter_template: قالب خطاب الخصم المُرسل للجهة (محفوظ لمرحلة الخطابات).
-- =====================================================
CREATE TABLE IF NOT EXISTS deduction_entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  employer_id INTEGER NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  is_self BOOLEAN NOT NULL DEFAULT false,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  letter_template TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.1) ترقية التنصيبات القائمة [L2] — يُضاف قابلًا للفراغ أولًا، ثم يُملأ في
--      القسم 4، ثم يُشدَّد إلى NOT NULL بعد التأكد من خلوّ البيانات من اليتامى.
ALTER TABLE deduction_entities ADD COLUMN IF NOT EXISTS employer_id INTEGER REFERENCES employers(id) ON DELETE CASCADE;

-- 2.2) ترقية التنصيبات القائمة [L3]
ALTER TABLE deduction_entities ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN deduction_entities.employer_id IS 'جهة العمل المالكة (علاقة 1:N مباشرة) — الصفوف الذاتية تتبع جهتها، والمستقلة تتبع حاوية «جهات حكومية»';
COMMENT ON COLUMN deduction_entities.is_self IS 'صف ذاتي: الجهة نفسها هي جهة الخصم (واحد فقط لكل جهة عمل)';

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

-- 2.3) صف ذاتي واحد فقط لكل جهة عمل [L3]
CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_entities_self_per_employer
  ON deduction_entities (employer_id)
  WHERE is_self;

CREATE INDEX IF NOT EXISTS idx_deduction_entities_employer ON deduction_entities(employer_id);

-- =====================================================
-- 3) دوال ومشغّلات الربط (Entity Linkage)
-- =====================================================

-- 3.1) الحاوية: جهة عمل «جهات حكومية» للجهات المستقلة (قرار 8)
--      تُنشأ عند الحاجة ويُعاد معرفها — آمنة للتكرار.
CREATE OR REPLACE FUNCTION ensure_container_employer()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM employers WHERE name = 'جهات حكومية' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO employers (name, code, scope, has_deduction_entities, status)
  VALUES ('جهات حكومية', 'GOV-000', 'internal', true, 'active')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION ensure_container_employer() IS 'يعيد معرف جهة العمل الحاوية «جهات حكومية» (قرار 8) وينشئها إن لم توجد';

-- 3.2) ضمان الصف الذاتي لجهة عمل (قرار 2)
--      الأولوية: صف ذاتي قائم ← مطالبة بجهة يتيمة بنفس الاسم ← إنشاء جديد.
CREATE OR REPLACE FUNCTION ensure_self_deduction_entity(p_employer_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_emp     RECORD;
  v_self    INTEGER;
  v_claim   INTEGER;
  v_name    TEXT;
  v_code    TEXT;
BEGIN
  IF p_employer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_self
    FROM deduction_entities
   WHERE employer_id = p_employer_id AND is_self
   ORDER BY id
   LIMIT 1;
  IF v_self IS NOT NULL THEN
    RETURN v_self;
  END IF;

  SELECT id, name, code INTO v_emp FROM employers WHERE id = p_employer_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- مطالبة بجهة خصم يتيمة تحمل نفس الاسم (نموذج قديم) بدل إنشاء مكرَّر
  SELECT id INTO v_claim
    FROM deduction_entities
   WHERE lower(name) = lower(v_emp.name) AND employer_id IS NULL
   ORDER BY id
   LIMIT 1;
  IF v_claim IS NOT NULL THEN
    UPDATE deduction_entities
       SET employer_id = p_employer_id,
           is_self     = true
     WHERE id = v_claim;
    RETURN v_claim;
  END IF;

  -- تفادي تصادم الاسم/الرمز الفريدين قبل الإدراج
  v_name := v_emp.name;
  IF EXISTS (SELECT 1 FROM deduction_entities WHERE lower(name) = lower(v_name)) THEN
    v_name := v_emp.name || ' — الصف الذاتي';
  END IF;

  v_code := v_emp.code;
  IF v_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM deduction_entities WHERE code = v_code
  ) THEN
    v_code := NULL;
  END IF;

  BEGIN
    INSERT INTO deduction_entities (name, code, employer_id, is_self, status)
    VALUES (v_name, v_code, p_employer_id, true, 'active')
    RETURNING id INTO v_self;
  EXCEPTION WHEN unique_violation THEN
    -- آخر محاولة باسم مضمون التميّز
    INSERT INTO deduction_entities (name, code, employer_id, is_self, status)
    VALUES (v_emp.name || ' — الصف الذاتي (' || p_employer_id || ')', NULL, p_employer_id, true, 'active')
    RETURNING id INTO v_self;
  END;

  RETURN v_self;
END;
$$;

COMMENT ON FUNCTION ensure_self_deduction_entity(INTEGER) IS 'يعيد معرف الصف الذاتي (is_self=true) لجهة العمل، وينشئه إن لم يوجد';

-- 3.3) ضمان الصف الذاتي لكل جهات العمل القائمة (صيانة/ترحيل)
CREATE OR REPLACE FUNCTION ensure_all_self_deduction_entities()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  r     RECORD;
  v_cnt INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM employers ORDER BY id LOOP
    PERFORM ensure_self_deduction_entity(r.id);
    v_cnt := v_cnt + 1;
  END LOOP;
  RETURN v_cnt;
END;
$$;

COMMENT ON FUNCTION ensure_all_self_deduction_entities() IS 'ينشئ الصف الذاتي لكل جهة عمل تفتقده، ويعيد عدد جهات العمل المعالَجة';

-- 3.4) مواءمة علم «لها جهات استحقاق فرعية» مع الواقع (قرار 3)
--      رفع أحادي الاتجاه: يرفع العلم للجهات التي لها فروع فعلًا ولا يخفضه أبدًا
--      حتى لا يتعارض مع اختيار المستخدم في الواجهة.
CREATE OR REPLACE FUNCTION sync_employer_deduction_flags()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt INTEGER;
BEGIN
  UPDATE employers e
     SET has_deduction_entities = true
   WHERE COALESCE(e.has_deduction_entities, false) = false
     AND EXISTS (
       SELECT 1 FROM deduction_entities d
        WHERE d.employer_id = e.id AND NOT d.is_self
     );
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END;
$$;

COMMENT ON FUNCTION sync_employer_deduction_flags() IS 'يرفع employers.has_deduction_entities للجهات التي لها جهات خصم فرعية فعلًا (لا يخفضه أبدًا)';

-- 3.5) مشغّل: كل جهة عمل جديدة/محدَّثة يكون لها صف ذاتي (قرار 2)
CREATE OR REPLACE FUNCTION employers_ensure_self_entity_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ensure_self_deduction_entity(NEW.id);
  RETURN NULL; -- مشغّل AFTER: القيمة المُعادة غير مستخدمة
END;
$$;

DROP TRIGGER IF EXISTS trg_employers_ensure_self_entity ON employers;
CREATE TRIGGER trg_employers_ensure_self_entity
  AFTER INSERT OR UPDATE OF name, has_deduction_entities ON employers
  FOR EACH ROW
  EXECUTE FUNCTION employers_ensure_self_entity_trigger();

-- 3.6) مشغّل: جهة الخصم اليتيمة تُضمّ للحاوية «جهات حكومية» (قرار 8)
--      يسمح للواجهة الحالية (التي لا ترسل employer_id بعد) بالاستمرار دون كسر،
--      وتنتقل الجهة لاحقًا لجهتها الحقيقية من الـ Modal الفرعي (المرحلة 2/3).
CREATE OR REPLACE FUNCTION deduction_entities_assign_container_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employer_id IS NULL THEN
    NEW.employer_id := ensure_container_employer();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduction_entities_assign_employer ON deduction_entities;
CREATE TRIGGER trg_deduction_entities_assign_employer
  BEFORE INSERT OR UPDATE OF employer_id ON deduction_entities
  FOR EACH ROW
  EXECUTE FUNCTION deduction_entities_assign_container_trigger();

-- 3.7) مشغّل: سياسة النقل — عند حذف جهة خصم يُنقل أعضاؤها للصف الذاتي (قرار 7)
CREATE OR REPLACE FUNCTION deduction_entities_reassign_members_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_self INTEGER;
BEGIN
  IF to_regclass('public.members') IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id INTO v_self
    FROM deduction_entities
   WHERE employer_id = OLD.employer_id
     AND is_self
     AND id <> OLD.id
   ORDER BY id
   LIMIT 1;

  IF v_self IS NOT NULL THEN
    UPDATE members
       SET deduction_entity_id = v_self
     WHERE deduction_entity_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduction_entities_reassign_members ON deduction_entities;
CREATE TRIGGER trg_deduction_entities_reassign_members
  BEFORE DELETE ON deduction_entities
  FOR EACH ROW
  EXECUTE FUNCTION deduction_entities_reassign_members_trigger();

-- =====================================================
-- 4) تسوية البيانات (Data Normalization) — آمنة للتكرار
-- تُنفَّذ في كل تشغيل للمخطط حتى يتطابق أي تنصيب قائم مع نموذج 1:N:
--   أ) ضمان حاوية «جهات حكومية».
--   ب) ترحيل علاقات employer_deduction_entities (إن كان الجدول قائمًا) إلى
--      deduction_entities.employer_id — الأولوية للجهة الافتراضية is_default.
--   ج) ضمان الصف الذاتي لكل جهة عمل.
--   د) ضم جهات الخصم اليتيمة إلى الحاوية ثم تشديد NOT NULL.
--   هـ) ربط أعضاء كل جهة عمل بصفها الذاتي (قرار 7) — إن كان جدول members قائمًا.
--   و) مواءمة has_deduction_entities.
-- =====================================================
DO $$
DECLARE
  v_container   INTEGER;
  v_junction    REGCLASS;
  v_junction_is_table BOOLEAN;
  v_orphans     INTEGER;
  r             RECORD;
BEGIN
  -- (أ) الحاوية
  v_container := ensure_container_employer();

  -- (ب) ترحيل الجدول الوسيط القديم (يُتخطى إن كان VIEW من تشغيل سابق)
  v_junction := to_regclass('public.employer_deduction_entities');
  v_junction_is_table := v_junction IS NOT NULL
    AND (SELECT relkind FROM pg_class WHERE oid = v_junction) = 'r';

  IF v_junction_is_table THEN
    FOR r IN
      SELECT ede.deduction_entity_id,
             ede.employer_id
        FROM (
          SELECT j.deduction_entity_id,
                 j.employer_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY j.deduction_entity_id
                   ORDER BY j.is_default DESC, j.id ASC
                 ) AS rn
            FROM employer_deduction_entities j
        ) ede
       WHERE ede.rn = 1
    LOOP
      UPDATE deduction_entities d
         SET employer_id = r.employer_id
       WHERE d.id = r.deduction_entity_id
         AND d.employer_id IS NULL
         AND NOT d.is_self;
    END LOOP;
  END IF;

  -- (ج) الصفوف الذاتية
  PERFORM ensure_all_self_deduction_entities();

  -- (د) اليتامى → الحاوية
  UPDATE deduction_entities
     SET employer_id = v_container
   WHERE employer_id IS NULL;
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  IF v_orphans > 0 THEN
    RAISE NOTICE '[entity-linkage] ضُمّت % جهة خصم مستقلة إلى الحاوية «جهات حكومية»', v_orphans;
  END IF;

  -- (هـ) ربط الأعضاء بالصف الذاتي (إن كان الجدول قائمًا — التنصيبات القديمة)
  IF to_regclass('public.members') IS NOT NULL THEN
    -- أعضاء بلا جهة عمل ← بلا جهة خصم
    UPDATE members
       SET deduction_entity_id = NULL
     WHERE employer_id IS NULL
       AND deduction_entity_id IS NOT NULL;

    -- أعضاء بجهة عمل ← الصف الذاتي، أو تصحيح جهة خصم لا تتبع جهة عملهم
    UPDATE members m
       SET deduction_entity_id = s.id
      FROM deduction_entities s
     WHERE m.employer_id IS NOT NULL
       AND s.employer_id = m.employer_id
       AND s.is_self
       AND NOT EXISTS (
             SELECT 1 FROM deduction_entities d
              WHERE d.id = m.deduction_entity_id
                AND d.employer_id = m.employer_id
           );
  END IF;

  -- (و) مواءمة العلم
  PERFORM sync_employer_deduction_flags();
END $$;

-- تشديد NOT NULL بعد التأكد من خلوّ العمود من القيم الفارغة [L2]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'deduction_entities'
       AND column_name  = 'employer_id'
       AND is_nullable  = 'YES'
  ) AND NOT EXISTS (SELECT 1 FROM deduction_entities WHERE employer_id IS NULL) THEN
    ALTER TABLE deduction_entities ALTER COLUMN employer_id SET NOT NULL;
  END IF;
END $$;

-- =====================================================
-- 5) employer_deduction_entities — VIEW توافقي [L6]
-- كان جدول many-to-many؛ صار عرضًا مشتقًا من نموذج 1:N حتى لا ينكسر
-- resolveDeductionEntity في membership.js (سطر 3695) قبل تحديث الواجهة.
--   is_default ← is_self  (الصف الذاتي هو الجهة الافتراضية لخصم رواتب جهتها)
-- security_invoker = true ← تُطبَّق صلاحيات/RLS المستدعي على الجداول الأساسية
--                            (يتطلب PostgreSQL 15+ — وهو إصدار Supabase الحالي).
-- =====================================================
-- إسقاط الكائن القديم بحسب نوعه: DROP VIEW على جدول (أو العكس) يُطلق خطأً في
-- Postgres، لذا يُفحص relkind أولًا. بيانات الجدول رُحِّلت في القسم 4 أعلاه.
DO $$
DECLARE
  v_oid  REGCLASS;
  v_kind CHAR;
BEGIN
  v_oid := to_regclass('public.employer_deduction_entities');
  IF v_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT relkind INTO v_kind FROM pg_class WHERE oid = v_oid;

  IF v_kind = 'v' THEN
    DROP VIEW public.employer_deduction_entities;
  ELSE
    DROP TABLE public.employer_deduction_entities CASCADE;
  END IF;
END $$;

CREATE VIEW employer_deduction_entities
WITH (security_invoker = true)
AS
SELECT
  de.id          AS id,
  de.employer_id AS employer_id,
  de.id          AS deduction_entity_id,
  de.is_self     AS is_default,
  ''::text       AS notes,
  de.created_at  AS created_at
FROM deduction_entities de
WHERE de.employer_id IS NOT NULL;

COMMENT ON VIEW employer_deduction_entities IS 'عرض توافقي (كان جدول many-to-many): صف لكل جهة خصم مع is_default = is_self — سيُحذف بعد تحديث membership.js في المرحلة 2/3';

-- منح القراءة للأدوار الموجودة فعلًا (يتفاوت وجودها بين تنصيبة وأخرى)
DO $$
DECLARE
  v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('GRANT SELECT ON public.employer_deduction_entities TO %I', v_role);
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- 6) فئات العضوية (Membership Types)
-- can_be_primary:   تصلح كعضوية أساسية (رئيس أسرة)
-- can_be_dependent: تصلح كعضوية تابِع (محفوظة لمرحلة التابعين)
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
-- 7) سجل الأسعار التاريخي (Membership Fees)
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
-- 8) الأعضاء (Members) — أساسيون وتابعون
--   - التابع: parent_member_id يشير للعضو الأساسي + relationship (مرحلة التابعين)
--   - service_status: [D3] active (على رأس العمل) / retired (متقاعد) /
--                     external (خارج نطاق جهات العمل) / other
--   - employer_id + deduction_entity_id: ربط متسلسل (قرار 5) — المشغّل في 8.b
--                     يضمن أن جهة الخصم تتبع جهة عمل العضو، ويملأ الصف الذاتي
--                     تلقائيًا عند غيابها أو عند النقل (قرار 7).
--   - collection_method: [D4] cash / salary_deduction / bank_transfer
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

-- 8.1) ترقية التنصيبات القائمة — توسيع القيود [D3][D4]
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_service_status_check;
ALTER TABLE members ADD CONSTRAINT members_service_status_check
  CHECK (service_status IN ('active', 'retired', 'external', 'other'));

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_collection_method_check;
ALTER TABLE members ADD CONSTRAINT members_collection_method_check
  CHECK (collection_method IN ('cash', 'salary_deduction', 'bank_transfer'));

-- 8.2) ترقية التنصيبات القائمة — عمود جهة الخصم [D10]
ALTER TABLE members ADD COLUMN IF NOT EXISTS deduction_entity_id INTEGER REFERENCES deduction_entities(id) ON DELETE SET NULL;

COMMENT ON COLUMN members.employer_id IS 'جهة العمل — تُملأ إلزاميًا لخدمة active/external وتُترك فارغة للمتقاعدين';
COMMENT ON COLUMN members.deduction_entity_id IS 'جهة الخصم التابعة لجهة عمل العضو (مفتاح التجميع في دفعات الخصم — قرار 6)؛ يُملأ تلقائيًا بالصف الذاتي';

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
-- 9) الاشتراكات (Subscriptions)
-- صف لكل عضو لكل فترة؛ frequency = monthly → period_month مطلوب،
-- frequency = annual → يُسجَّل عادة بـ period_month = 1.
-- payment_method: [D5] cash / salary_deduction / bank_transfer
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
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'salary_deduction', 'bank_transfer')),
  paid_at TIMESTAMP WITH TIME ZONE,
  receipt_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (member_id, period_year, period_month, frequency)
);

-- 9.1) ترقية التنصيبات القائمة — توسيع القيد [D5]
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_method_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'salary_deduction', 'bank_transfer'));

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
-- 10) تسويات الأسعار — خصم الزيادة (Fee Adjustments)
-- عند رفع السعر: يُنشأ تسوية تعوّض الفارق على الأشهر المتأثرة،
-- ثم تُطبَّق على اشتراك محدد عبر applied_in_subscription_id.
-- (محفوظة لمرحلة التسويات — لا يستخدمها membership.js بعد)
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
-- 11) دفعات الخصم (Deduction Batches)
-- دفعة شهرية لكل جهة خصم؛ batch_number يُولَّد في التطبيق بالصيغة
-- B-{year}-{month}-{seq} (مثال: B-2026-09-001) — انظر generateBatchNumber [D9].
-- payment_method: [D2] salary_deduction (خصم رواتب — بجهة خصم إلزامية)
--                        cash_demand     (مطالبة نقدية — بلا جهة خصم)
-- القيد UNIQUE يمنع تكرار الدفعة لنفس (السنة، الشهر، الجهة)، والفهرس الجزئي
-- uq_deduction_batches_cash_period يمنع تكرار المطالبة النقدية لنفس الفترة [D7].
-- =====================================================
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

-- 11.1) ترقية التنصيبات القائمة [D2] — عمود نوع الدفعة + استنباط قيم الصفوف القديمة
ALTER TABLE deduction_batches ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'salary_deduction';
UPDATE deduction_batches
   SET payment_method = CASE WHEN deduction_entity_id IS NULL THEN 'cash_demand' ELSE 'salary_deduction' END;

ALTER TABLE deduction_batches DROP CONSTRAINT IF EXISTS deduction_batches_payment_method_check;
ALTER TABLE deduction_batches ADD CONSTRAINT deduction_batches_payment_method_check
  CHECK (payment_method IN ('salary_deduction', 'cash_demand'));

-- 11.2) ترقية التنصيبات القائمة [D6] — دفعات المطالبة النقدية بلا جهة خصم
ALTER TABLE deduction_batches ALTER COLUMN deduction_entity_id DROP NOT NULL;

-- 11.3) ترقية التنصيبات القائمة [D8] — ربط النوع بالجهة
ALTER TABLE deduction_batches DROP CONSTRAINT IF EXISTS deduction_batches_salary_requires_entity;
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_bad
    FROM deduction_batches
   WHERE payment_method = 'salary_deduction' AND deduction_entity_id IS NULL;

  IF v_bad = 0 THEN
    ALTER TABLE deduction_batches ADD CONSTRAINT deduction_batches_salary_requires_entity
      CHECK (payment_method <> 'salary_deduction' OR deduction_entity_id IS NOT NULL);
  ELSE
    RAISE NOTICE '[drift-fix] تعذّر إضافة قيد deduction_batches_salary_requires_entity — توجد % دفعة خصم رواتب بلا جهة خصم؛ صحّحها ثم أعد التشغيل', v_bad;
  END IF;
END $$;

COMMENT ON COLUMN deduction_batches.payment_method IS 'نوع الدفعة: salary_deduction = خصم رواتب (بجهة خصم إلزامية)، cash_demand = مطالبة نقدية (بلا جهة خصم)';
COMMENT ON COLUMN deduction_batches.deduction_entity_id IS 'جهة الخصم المستهدفة — مفتاح التجميع (قرار 6)، وتُترك فارغة في المطالبات النقدية';

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
-- 12) عناصر الدفعة (Deduction Batch Items)
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
-- 13) المشغّلات (Triggers)
-- =====================================================

-- 13.1) updated_at
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

-- 13.2) تكامل ربط العضو بجهة الخصم [L5]
-- القواعد (بالترتيب):
--   1. بلا جهة عمل            ← deduction_entity_id = NULL
--   2. جهة خصم صريحة ومتسقة   ← تُقبل كما هي (يدعم الـ Cascading Dropdown — قرار 5)
--   3. جهة خصم صريحة ومتعارضة ← استثناء 23514 (يظهر كخطأ تحقق في الواجهة)
--   4. جهة خصم غائبة/قديمة    ← الصف الذاتي لجهة العمل (يشمل النقل — قرار 7)
CREATE OR REPLACE FUNCTION members_link_deduction_entity_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner    INTEGER;
  v_explicit BOOLEAN;
BEGIN
  -- هل جاءت قيمة جهة الخصم من الكتابة نفسها (وليست بقية صف قديم)؟
  v_explicit := (TG_OP = 'INSERT' AND NEW.deduction_entity_id IS NOT NULL)
             OR (TG_OP = 'UPDATE' AND NEW.deduction_entity_id IS DISTINCT FROM OLD.deduction_entity_id);

  -- (1) بلا جهة عمل ← بلا جهة خصم
  IF NEW.employer_id IS NULL THEN
    NEW.deduction_entity_id := NULL;
    RETURN NEW;
  END IF;

  -- (2)/(3) جهة خصم محددة: تُقبل إن كانت تتبع جهة العمل نفسها
  IF NEW.deduction_entity_id IS NOT NULL THEN
    SELECT employer_id INTO v_owner
      FROM deduction_entities
     WHERE id = NEW.deduction_entity_id;

    IF v_owner IS NOT DISTINCT FROM NEW.employer_id THEN
      RETURN NEW;
    END IF;

    IF v_explicit THEN
      RAISE EXCEPTION 'جهة الخصم (%) لا تتبع جهة عمل العضو (%) — اختر جهة خصم تابعة لجهة العمل نفسها',
        NEW.deduction_entity_id, NEW.employer_id
        USING ERRCODE = '23514';
    END IF;

    -- قيمة قديمة غير متسقة ← تُصحَّح إلى الصف الذاتي أدناه
    NEW.deduction_entity_id := NULL;
  END IF;

  -- (4) الصف الذاتي لجهة العمل (قرار 7 — يُنشأ إن لم يوجد)
  NEW.deduction_entity_id := ensure_self_deduction_entity(NEW.employer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_link_deduction_entity ON members;
CREATE TRIGGER trg_members_link_deduction_entity
  BEFORE INSERT OR UPDATE OF employer_id, deduction_entity_id ON members
  FOR EACH ROW
  EXECUTE FUNCTION members_link_deduction_entity_trigger();

-- =====================================================
-- 14) الفهارس (Indexes)
-- ملاحظة: national_id / member_number لهما فهرس تلقائي من قيد
-- UNIQUE، والفهارس أدناه تُنشأ كما وردت في المواصفات صراحةً.
-- =====================================================

-- employers / deduction_entities [D11][L2]
CREATE INDEX IF NOT EXISTS idx_employers_scope          ON employers(scope);
CREATE INDEX IF NOT EXISTS idx_employers_status         ON employers(status);
CREATE INDEX IF NOT EXISTS idx_deduction_entities_status ON deduction_entities(status);

-- members
CREATE INDEX IF NOT EXISTS idx_members_employer         ON members(employer_id);
CREATE INDEX IF NOT EXISTS idx_members_deduction_entity ON members(deduction_entity_id);
CREATE INDEX IF NOT EXISTS idx_members_parent           ON members(parent_member_id);
CREATE INDEX IF NOT EXISTS idx_members_status           ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_service_status   ON members(service_status);
CREATE INDEX IF NOT EXISTS idx_members_collection_method ON members(collection_method);
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
CREATE INDEX IF NOT EXISTS idx_deduction_batches_period  ON deduction_batches(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_deduction_batches_payment_method ON deduction_batches(payment_method);
CREATE INDEX IF NOT EXISTS idx_membership_fees_type      ON membership_fees(membership_type_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_status        ON deduction_batch_items(status);

-- 14.1) فهرس فريد جزئي يمنع تكرار المطالبة النقدية للفترة نفسها [D7]
--       (قيد UNIQUE المركّب لا يغطي صفوف deduction_entity_id IS NULL لأن
--        قيم NULL تُعدّ متميزة في Postgres). يُتخطى مع تنبيه إن وُجد تكرار قائم.
DO $$
DECLARE
  v_dup INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup
    FROM (
      SELECT period_year, period_month
        FROM deduction_batches
       WHERE deduction_entity_id IS NULL
       GROUP BY period_year, period_month
      HAVING COUNT(*) > 1
    ) d;

  IF v_dup = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_batches_cash_period
      ON deduction_batches (period_year, period_month)
      WHERE deduction_entity_id IS NULL;
  ELSE
    RAISE NOTICE '[drift-fix] تعذّر إنشاء uq_deduction_batches_cash_period — توجد % فترة لها أكثر من مطالبة نقدية؛ دمجهما ثم أعد التشغيل', v_dup;
  END IF;
END $$;

-- =====================================================
-- 15) البيانات الأولية (Seed Data)
-- =====================================================

-- 15.1) فئات العضوية الأربع
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

-- 15.2) الأسعار الافتراضية (سجل تاريخي بتاريخ سريان بداية السنة المالية)
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

-- 15.3) جهات العمل التجريبية — توضح الحالات الثلاث للنموذج الجديد
--   أ) جهة داخلية لها فروع خصم          → has_deduction_entities = true
--   ب) جهة خارجية بلا فروع               → الصف الذاتي فقط
--   ج) الحاوية «جهات حكومية» (قرار 8)    → تضم الجهات المستقلة
INSERT INTO employers (name, code, address, phone, contact_person, scope, has_deduction_entities, status)
VALUES
  ('وزارة التربية',     'EDU-001', 'الرياض، المملكة العربية السعودية', '', '', 'internal', true,  'active'),
  ('شركة النيل للمقاولات', 'EXT-001', 'الجيزة، مصر',                    '', '', 'external', false, 'active'),
  ('جهات حكومية',       'GOV-000', '',                                   '', '', 'internal', true,  'active')
ON CONFLICT (name) DO UPDATE
  SET code                   = EXCLUDED.code,
      address                = EXCLUDED.address,
      scope                  = EXCLUDED.scope,
      has_deduction_entities = EXCLUDED.has_deduction_entities,
      status                 = EXCLUDED.status;

-- 15.4) جهات الخصم التجريبية المرتبطة
--   الصف الذاتي يُنشئه المشغّل تلقائيًا مع جهة العمل؛ الإدراج الصريح أدناه
--   بـ ON CONFLICT يوحّد النتيجة سواء عمل المشغّل أم لا.
INSERT INTO deduction_entities (name, code, employer_id, is_self, address, phone, email, contact_person, letter_template, status)
SELECT
  e.name,
  e.code,
  e.id,
  true,
  e.address,
  '',
  '',
  '',
  '',
  'active'
FROM employers e
WHERE e.name IN ('وزارة التربية', 'شركة النيل للمقاولات', 'جهات حكومية')
ON CONFLICT (name) DO UPDATE
  SET code        = EXCLUDED.code,
      employer_id = EXCLUDED.employer_id,
      is_self     = true,
      status      = EXCLUDED.status;

-- فرع خصم تابع لوزارة التربية (قرار 3/4) + جهة مستقلة تحت الحاوية (قرار 8)
INSERT INTO deduction_entities (name, code, employer_id, is_self, address, phone, email, contact_person, letter_template, status)
SELECT
  x.name,
  x.code,
  e.id,
  false,
  x.address,
  '',
  x.email,
  '',
  x.letter_template,
  'active'
FROM (VALUES
  ('إدارة استحقاقات وزارة التربية', 'EDU-001-BEN', 'الرياض — الإدارة العامة للاستحقاقات',
   '', 'نرجو خصم اشتراكات أعضاء الجمعية من رواتبهم الشهريــة لصالح جمعية البركة الأهلية، وإيداع المبلغ في حساب الجمعية.'),
  ('وزارة المالية', 'MOF-001', 'الرياض، المملكة العربية السعودية',
   'benefits@mof.gov.example', 'نرجو التعميم على إدارات الاستحقاقات بخصم اشتراكات الجمعية من رواتب الموظفين أعضاء الجمعية.')
) AS x(name, code, address, email, letter_template)
JOIN employers e ON e.name = CASE WHEN x.code = 'MOF-001' THEN 'جهات حكومية' ELSE 'وزارة التربية' END
ON CONFLICT (name) DO UPDATE
  SET code            = EXCLUDED.code,
      employer_id     = EXCLUDED.employer_id,
      is_self         = false,
      address         = EXCLUDED.address,
      email           = EXCLUDED.email,
      letter_template = EXCLUDED.letter_template,
      status          = EXCLUDED.status;

-- 15.5) ضمان اتساق النموذج بعد الإدراج (صف ذاتي لكل جهة + مواءمة الأعلام)
SELECT ensure_all_self_deduction_entities();
SELECT sync_employer_deduction_flags();

-- =====================================================
-- نهاية schema.sql — وحدة شؤون العضوية v2.0
-- (المرحلة 0: تسوية الانحراف D1–D11 | المرحلة 1: الربط المباشر L1–L7)
-- الترحيل التشغيلي المقابل: migrations/2026-10-01-entity-linkage.sql
-- =====================================================
