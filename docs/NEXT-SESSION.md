# استئناف «رصيد» في جلسة جديدة

> نقطة الاستئناف: 2026-10-11. المراحل 1–3 مدموجة في `main` ومنشورة على https://dhtrd.github.io/raseed/. المرحلة 4 بدأت للتو.

## اقرأ أولاً (بالترتيب)
CLAUDE.md ← DECISIONS.md ← PROGRESS.md ← هذا الملف ← SPEC.md (v1.2) ← FIELDS.md ← CHOSEN.md ← docs/firestore-schema.md ← docs/migration.md.

## حالة المستودع والإنتاج
- Firebase `raseed-dhtrd`: القواعد مرفوعة. **البيانات الحقيقية منقولة**: 19 مورداً، 2,602 حركة، 2,575 فهرس مرجع، 58 حركة في `migrationIssues` للتعديل اليدوي، 299 فاتورة «دخلت Odoo»، علامة `settings/migration`. مفتاح النقل أُبطل.
- حساب المالك يعمل (دخول بالبريد فقط). الوضع النهاري دائماً (`data-theme="light"` في index.html).
- أسرار GitHub: `FIREBASE_SERVICE_ACCOUNT` و`VITE_FIREBASE_*` (في Secrets).
- 6 PRs من Dependabot (dhtrd/raseed#1–#6) ترقيات كبرى ما زالت مفتوحة.
- حماية الفرع `main`: أُعطي المستخدم الخطوات، ولم يؤكد التنفيذ.

## المرحلة 4 — ما أُنجز (غير مستعمل بعد في الواجهة)
- `src/features/ledger/core/ledger.ts` + اختباراته (6): `parseEntry`، `formatMoney`، `balanceState`، `withRunningBalance`، `sumBalances`، `currentQuarter`، `kindLabel` (فاتورة مدينة = مرتجع، قيد دائن = استرداد).
- `src/features/ledger/data/ledgerRepo.ts`: `listVisibleSuppliers` (الكل للمدير، المسنَدون لمدخل البيانات)، `supplierBalance`/`balancesFor` بتجميع `sum()` (السابق + الفترة)، `openingBalance`، `watchStatement` (مستمع مرتب بالتاريخ ثم المعرف)، `reviewCounts` (من `migrationIssues`)، `ledgerStats` (`count()`).
- `firestore.indexes.json`: فهرس (supplierId، deleted، date). يُرفع تلقائياً مع القواعد عبر `deploy-rules.yml` بعد الدمج في main.

## المرحلة 4 — الخطوة التالية مباشرة
1. `DashboardPage` (لوحة الأرصدة) حسب النموذج المعتمد `rased-mockups/direction-1/dashboard.html`: جدول كل الموردين (السابق/مدين/دائن/النهائي) + صف إجمالي، فلترة `PeriodFilter` (افتراضي الربع الحالي)، ترتيب الأعمدة، لوحة جانبية بتنبيهات المراجعة والإحصاءات (للمدير فقط)، بطاقات على الجوال، زر تحديث.
2. `StatementPage` على `statement/:sid?` حسب `statement.html`: اختيار المورد، «كل الحركات» أو فترة، رصيد افتتاحي ورصيد جارٍ، وسوم النوع (مرتجع/استرداد/بلا نوع)، علامة «للمراجعة».
3. المسارات والتبويبات في `src/app/App.tsx` و`AppShell.tsx`: «الأرصدة» على `/` بدل Home، و«كشف الحساب».
4. بذرة المحاكي `tests/e2e-auth/seed.ts` بحركات وهمية + اختبارات e2e للوحة والكشف، ثم lint/typecheck/unit/rules/e2e، ثم PR إلى main.
5. بعدها: تصدير الكشف Excel/PDF وطباعة A4، فهرس الفواتير وحالة Odoo (إرجاعها بسبب إلزامي)، فهرس القيود، إضافة حركة والإدخال السريع، مركز المراجعة، قفل الفترات، شاشة التدقيق.
6. **نماذج ناقصة قبل بنائها** (2–3 خيارات واعتماد): فهرس القيود، قفل الفترات، التدقيق، الإشعارات، التحميل والفراغ، بطاقة الإدخال السريع على الجوال.

## صفحات مرجعية (Artifacts)
- نماذج المرحلة 2 المعتمدة: https://claude.ai/artifact/2GHbnzdf9UoxUVpkWZNPab
- دليل مفتاح المالك: https://claude.ai/artifact/18DkupUkhDZmrF8nuhrCCP
- نماذج الحقول والإدخال السريع: https://claude.ai/artifact/81fL5SCNcWciRxQgnSQoti
- نماذج الواجهة 1 «الدفتر» في المستودع: `rased-mockups/direction-1/` (dashboard، statement، invoices، add-entry، review).

## تشغيل محلي
- e2e على المحاكي: `npm run test:e2e:auth` (يحتاج Java). متصفح محلي: `PW_CHROMIUM=/opt/pw-browsers/chromium`.
- التطوير على المحاكي: `VITE_USE_EMULATORS=true npx vite` مع `npx firebase emulators:start --only auth,firestore --project demo-raseed`.

## قواعد العمل المتفق عليها
- العربية RTL والمصطلحات الإنجليزية معزولة. صفحات الإرشاد الطويلة كـ Artifact.
- لا افتراض: اسأل، واختم بـ «افتراضات» و«يحتاج قرارك».
- لا بيانات حقيقية في git (المستودع عام). لا عنصر بمظهر المتصفح الافتراضي.
- المستخدم لا يتعامل مع Node/Git: Claude ينفّذ ويرفع، والمستخدم يدمج PR من GitHub.
- حدّث PROGRESS.md وأضف إلى DECISIONS.md (إلحاقي) في نهاية كل جلسة.
