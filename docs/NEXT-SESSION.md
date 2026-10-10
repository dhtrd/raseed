# استئناف «رصيد» في جلسة جديدة

> نقطة الاستئناف: 2026-10-10 مساءً. المرحلة 1 مكتملة ومعتمدة. الخطوة التالية: المرحلة 2.

## حالة المستودع
- `main` = نهاية المرحلة 1 (`85ec46d`). القواعد مرفوعة إلى `raseed-dhtrd` (Actions run 38081186815).
- فرع `claude/rasid-project-review-yl4mlo` متقدم على main بـ commits توثيقية فقط (PROGRESS/DECISIONS/هذا الملف).
- 6 PRs من Dependabot موجّهة لفرع Claude (أُنشئت قبل وجود main): لا تُدمج؛ تُراجع في المرحلة 2 (ترقيات كبرى: TypeScript 7، ESLint 10، jsdom 30).
- أسرار GitHub موجودة: `FIREBASE_SERVICE_ACCOUNT` و`VITE_FIREBASE_*` الخمسة (في Secrets لا Variables؛ اقرأها في CI بـ `secrets.`).

## ما لا يوجد في المستودع (عمداً)
- `private/` (البيانات الحقيقية) ليس في git والمستودع عام. لا تحتاجه المرحلة 2. المرحلة 3 (النقل) تحتاج المستخدم يرفع ملف الإكسل وKNOWN-ISSUES الأصلي من جهازه.

## صفحات مرجعية (Artifacts خاصة بالمستخدم)
- نماذج الحقول والإدخال السريع (الإصدار 3، معتمدة): https://claude.ai/artifact/81fL5SCNcWciRxQgnSQoti — نسختها في `proposals/2026-10-10-fields-excel-components.html`.
- إعداد Firebase: https://claude.ai/artifact/8jGJeU8bY5akm6s8mwEC64 و https://claude.ai/artifact/UU4cYbW6LQhkCpoRo4tpLn

## خطة المرحلة 2 (من BUILD-PROMPT.md)
1. نماذج تفاعلية (2–3 خيارات) لشاشة الدخول وإدارة المستخدمين، واعتماد المستخدم قبل أي كود.
2. الدخول: حقل واحد للبريد أو اسم المستخدم (`identifierToEmail` في `src/shared/fields/core/password.ts`)، سياسة كلمة مرور قوية (مفروضة في Firebase: Require enforcement، 12 حرفاً، الأنواع الأربعة)، إنهاء جلسة تلقائي.
3. الأدوار الثلاثة، حماية حساب المالك، مسميات أدوار قابلة للتعديل (`settings/roleNames`).
4. إدارة المستخدمين وإسناد الموردين (بلا Cloud Functions: إنشاء حساب Auth لمستخدم آخر من الواجهة يحتاج حلاً — اعرض الخيارات على المستخدم).
5. سجل التدقيق غير القابل للتعديل (القواعد جاهزة).
6. قبل أول دخول: إنشاء حساب المالك بسكربت إعداد يشغّله المستخدم.
7. في آخر المرحلة: PR إلى main يدمجه المستخدم.

## قواعد العمل المتفق عليها
- العربية RTL في كل الردود، والمصطلحات الإنجليزية معزولة. صفحات الإرشاد الطويلة كـ Artifact RTL مع أزرار نسخ.
- لا افتراض: اسأل، واذكر «افتراضات» و«يحتاج قرارك» في نهاية كل رد.
- لا بيانات حقيقية في git. لا عنصر بمظهر المتصفح الافتراضي.
- نموذج تفاعلي قبل أي شاشة أو مكوّن جديد.
- اقرأ أولاً: CLAUDE.md، DECISIONS.md، PROGRESS.md، ثم SPEC.md وFIELDS.md وCHOSEN.md وBUILD-PROMPT.md وdocs/firestore-schema.md.
