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

## المرحلة 4 — ما أُنجز في الواجهة (2026-10-11)
- `DashboardPage` على `/` و`StatementPage` على `/statement/:sid?` في `src/features/ledger/ui` (تخطيط مشترك `Ledger.module.css`، ترتيب `core/sort.ts`، `buildStatement` في `core/ledger.ts`، خطافات `useKeyedLoad/useKeyedWatch`).
- بذرة المحاكي `tests/e2e-auth/seed.ts` فيها حركات وهمية ومستخدم «مدخل بيانات» (سالم، مسند له s2)، واختبارات `tests/e2e-auth/ledger.spec.ts`.
- بانتظار مراجعة المستخدم: انظر آخر قيد في DECISIONS.md (التواريخ يوم/شهر/سنة، الأحدث أولاً، إلخ).

## المرحلة 4 — الخطوة التالية مباشرة
1. ~~تصدير الكشف~~ أُنجز (`src/features/ledger/export`): Excel الخيار أ وطباعة A4 الخيار أ، والنماذج في `proposals/2026-10-11-statement-export.html`.
2. ~~فهرس الفواتير وحالة Odoo~~ أُنجز (`InvoicesPage` + `data/invoicesRepo.ts` + `export/invoicesXlsx.ts`). المؤجل: استثناء المالك في الفترة المقفلة بسبب مكتوب (`odoo.lockReason`) مع شاشة قفل الفترات.
3. ~~إضافة حركة~~ و~~الإدخال السريع (حاسوب ولوحي)~~ أُنجزا (`AddEntryPage`، `QuickEntryPage`، `core/batch.ts`، `addEntriesChunked`). و~~بطاقة الجوال~~ (الخيار ج، `QuickEntryMobile.tsx`). و~~مركز المراجعة~~ (`ReviewPage`، `core/review.ts`، `data/reviewRepo.ts`). و~~نافذة تعديل الحركة~~ (الخيار أ، `EditEntryDialog`). و~~قفل الفترات~~ (الخيار ب، `LockPage`). **التالي:** فتح نافذة التعديل من الكشف، والحذف الناعم، واستثناء Odoo المقفل للمالك. تنبيه: المحاكي لا يفرض الفهارس؛ أي استعلام تجميع جديد يحتاج فهرساً يضم الحقل المجموع. حد تقني: أقصى عملية ذرّية 7 حركات (DECISIONS 2026-10-11). الشريط السفلي للجوال بعد اكتمال الأقسام الخمسة.
4. ~~مركز المراجعة وتحويل تنبيهات اللوحة إلى روابط~~ أُنجز. التالي فيه: «تعديل» عبر النافذة المعتمدة.
5. شريط التنقل السفلي على الجوال حين تكتمل أقسامه الخمسة.
6. **نماذج ناقصة قبل بنائها** (2–3 خيارات واعتماد): فهرس القيود، قفل الفترات، التدقيق، الإشعارات، التحميل والفراغ، والبحث داخل الكشف.

## صفحات مرجعية (Artifacts)
- نموذج موضع «تعديل» في كشف المورد (بانتظار الاختيار): https://claude.ai/artifact/5MDY3dYSyxPTZDwAB2WmcP
- نموذج شاشة قفل الفترات (اختير ب): https://claude.ai/artifact/5DzaZDQ5aKdGv3DnhatDxf
- نموذج نافذة تعديل الحركة (اختير أ): https://claude.ai/artifact/Mfm4sagPcN1AfY4LypSSzf
- نموذج بطاقة الإدخال السريع على الجوال (اختير ج): https://claude.ai/artifact/4wKpL3YreNN65WemWG7Dfd
- نماذج تصدير الكشف (بانتظار الاختيار): https://claude.ai/artifact/HW1mbhy6a3d2aTSjMrz6WQ
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
