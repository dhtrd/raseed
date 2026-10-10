# PROGRESS.md
**آخر نقطة (2026-10-10، جلسة Claude Code السحابية):** المرحلة 1 «الأساس» مكتملة ومعتمدة. القواعد مرفوعة إلى `raseed-dhtrd`، والفرع الافتراضي `main`.
- الهيكل: React + Vite + TypeScript، مقسّم حسب الميزة (`src/app`، `src/shared/fields`، `src/shared/domain`، `src/shared/design`، `src/dev`).
- مكتبة الحقول (`src/shared/fields`): المنطق النقي في `core/` ومكونات مخصصة لكل نوع حقل في FIELDS.md، ومعرض `/__fields` للتطوير.
- Firestore: `firestore.rules` + `docs/firestore-schema.md` + اختبارات المحاكي (`tests/rules`).
- CI: `.github/workflows/ci.yml` (lint، typecheck، unit، build، rules، e2e على 3 متصفحات، audit، gitleaks) و`codeql.yml`.
- النماذج المعتمدة: `proposals/2026-10-10-fields-excel-components.html` (الإصدار 3).

**جلسة جديدة؟** اقرأ `docs/NEXT-SESSION.md` أولاً (حالة المستودع، الروابط، خطة المرحلة 2).

**المرحلة 2 (جارية، فرع `claude/rasid-phase-2-87189q`):** نماذج الدخول والمستخدمين والإسناد وخيارات إنشاء الحسابات منشورة: https://claude.ai/artifact/2GHbnzdf9UoxUVpkWZNPab (نسختها `proposals/2026-10-10-phase2-auth-users.html`).

**الخطوة التالية:** انتظار إجابات المستخدم (11 سؤالاً في قسم الإجابات)، ثم تسجيلها في DECISIONS، ثم التنفيذ. لا كود قبلها. ثم PR إلى main.

**مفتوح:** 6 PRs من Dependabot موجّهة لفرع Claude (أُنشئت قبل main) — تُراجع وتُعاد إلى main.

**معلّق:**
- نماذج الشاشات الناقصة قبل المرحلة 4 (فهرس القيود، الدخول، المستخدمون، قفل الفترات، التدقيق، الإشعارات، التحميل والفراغ، بطاقة الإدخال السريع على الجوال).
- الملخصات لتقليل القراءات (المرحلة 4).
- أسئلة بيانات (6227، 0339) تُحسم داخل النظام؛ مطابقة رمز الريال مع الملف الرسمي.
- تنبيهات: المستودع عام — لا بيانات حقيقية في git؛ الأصل في `private/` على جهاز المستخدم.
