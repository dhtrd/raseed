# مخطط Firestore — «رصيد»

> القواعد في `firestore.rules`، واختباراتها في `tests/rules/rules.test.ts` (`npm run test:rules`).
> كل كتابة على `entries` و`users` و`suppliers` و`settings` تُرفق في **الدفعة نفسها** بسجل جديد في `auditLog`، وإلا ترفضها القواعد.

| المجموعة | المعرّف | الحقول | من يقرأ | من يكتب |
|---|---|---|---|---|
| `users` | uid من Firebase Auth | `displayName`, `login`, `role` (owner/admin/entry), `assigned[]`, `active`, `mustChangePassword`, `auditId`, `createdAt`, `updatedAt` | صاحبه، والمالك والإدارة | المالك والإدارة (عدا حساب المالك)، والإنشاء بـ `mustChangePassword=true` إلزاماً. صاحب الحساب يزيل العلم عن نفسه فقط بسجل `passwordChanged`. دور «المالك» لا يُمنح من التطبيق؛ يُنشأ بـ `tools/admin/create-owner.ts` |
| `suppliers` | تلقائي | `name` (≤100), `status` (active/archived), `auditId` | المالك والإدارة؛ المدخل لمسنَديه فقط | المالك والإدارة |
| `entries` | تلقائي | `supplierId`, `kind` (inv/misc/note؛ untyped للمنقول فقط), `date` (YYYY-MM-DD), `mainRef`, `refNo`, `voucher`, `details`, `debit`, `credit` (هللات، عدد صحيح), `reversed`, `note`, `odoo` {entered, by, at, reason, reasonText} للفواتير فقط, `dup` {reason}, `needsManualFix`, `deleted`, `deletion` {by, at, reason} للمحذوفة فقط, `auditId`, `createdBy`, `createdAt`, `updatedAt` | المالك والإدارة؛ المدخل لمسنَديه وغير المحذوف | الإضافة للجميع (المدخل لمسنَديه)؛ التعديل للمالك والإدارة؛ الحذف الناعم والاسترجاع للمالك خارج الفترة المقفلة بسبب إلزامي في التدقيق، والمحذوفة لا تُعدَّل؛ لا حذف نهائي |
| `refs` | الرقم المرجعي مع استبدال `/` بـ `|` | `ids[]` معرّفات الحركات بهذا الرقم، و`places[]` {entryId, supplierId, supplierName} لعرض مكان التكرار لكل مستخدم | كل مستخدم نشط (لفحص التكرار) | يُكتب مع الحركة في الدفعة نفسها؛ وعند تعديل حركة إلى رقم آخر أو حذفها تُزال من فهرس رقمها في الدفعة نفسها (يتحرر الرقم)، وتعود إليه عند الاسترجاع. الفهرس الفارغ لا يُعدّ تكراراً |
| `settings/lock` | ثابت | `lockedThrough` (YYYY-MM-DD، لا بعد اليوم), `tempFrom` (أثناء الفتح المؤقت: التاريخ الذي يُعاد إليه، بعد `lockedThrough`), `auditId` | كل مستخدم نشط | المالك فقط، بسبب إلزامي في سجل التدقيق |
| `settings/session` | ثابت | `idleMinutes` (عدد صحيح 5–120، الافتراضي 30 إن غاب) | كل مستخدم نشط | المالك فقط |
| `settings/roleNames` | ثابت | `owner`, `admin`, `entry` (≤40) | كل مستخدم نشط | المالك فقط |
| `migrationIssues` | معرّف الحركة المنقولة | `entryId`, `supplierId`, `supplierName`, `sheet`, `row`, `issues[]` {code, text}, `resolved`, `createdAt`؛ وحقول الحل `resolution` (ignored/fixed، أو reopened مع resolved=false)، `resolutionNote` (≤300)، `resolvedBy`، `resolvedAt`، `auditId` | المالك والإدارة | ينشئها سكربت النقل وحده؛ المالك والإدارة يغيّرون حقول الحل فقط بسجل تدقيق (`entity = migrationIssues`)، ولا إنشاء ولا حذف من التطبيق |
| `settings/migration` | ثابت | `at`, `sha256`, `totals`, `auditId` | لا أحد من التطبيق | سكربت النقل (علامة اكتمال تمنع نقلاً ثانياً) |
| `settings/backup` | ثابت | `lastRunAt`, `lastStatus` (ok/failed), `lastError` | المالك والإدارة | سير النسخ الاحتياطي وحده |
| `backupRuns` | اليوم بتوقيت الرياض YYYY-MM-DD | `day`, `at`, `status` (ok/failed), `error`, `durationMs`؛ وعند النجاح `bytes`, `counts`, `authUsers`, `files[]` (≤120) | المالك والإدارة | سير النسخ الاحتياطي وحده (لا كتابة من التطبيق) |
| `auditLog` | تلقائي | `actor`, `at`, `action`, `entity`, `entityId`, `before?`, `after?`, `reason?` | المالك والإدارة | إضافة فقط باسم الكاتب نفسه؛ لا تعديل ولا حذف |

## الحساب النشط
- **نشط** = مستند `users` موجود و`active=true` و`mustChangePassword` ليس `true`. من عليه تغيير الكلمة المؤقتة يقرأ مستنده فقط ولا يصل لأي بيانات حتى يغيّرها (DECISIONS 2026-10-10).
- **ملاحظة:** القواعد لا ترى Firebase Auth، فلا تتحقق أن الكلمة تغيّرت فعلاً؛ الواجهة تزيل العلم بعد نجاح `updatePassword` مباشرة.

## ما تفرضه القواعد على الحركة
- **الاتجاه:** الفاتورة دائن والقيد مدين؛ `reversed=true` فقط يعكسه (مرتجع/استرداد). لا مدين ودائن معاً، ولا صفر، ولا كسور هللات.
- **المرجع:** الفاتورة 5 أرقام والقيد 4؛ المراجع ببادئة بلا طول. `refNo` = `P`+المرجع أو `MISC/السنة/الشهر/المرجع` من تاريخ الحركة.
- **التكرار:** إن كان للرقم المرجعي حركة سابقة، يُشترط `dup.reason` غير فارغ (تحذير صارم غير حاجب).
- **الفترة المقفلة:** لا إضافة ولا تعديل لحركة تاريخها ≤ `lockedThrough`، لأي دور.
- **Odoo في الفترة المقفلة:** المالك وحده، بسبب مكتوب في `odoo.lockReason`، ولا يتغير غير `odoo`.
- **Odoo:** للفواتير فقط، للمالك والإدارة، باسم من غيّر وفي وقت الطلب؛ الإرجاع بسبب من (wrong/cancelled/other)، و«other» بنص.
- **المنقول:** حركات `untyped` أو بمراجع مخالفة للطول تُعدَّل ما دام المرجع لم يتغير؛ التصنيف يتطلب شكلاً صحيحاً كاملاً.

## البيانات المنقولة (المرحلة 3)
- معرّفات ثابتة: الموردون `s01..s19` بترتيب أوراق الإكسل، والحركات `m-{مورد}-r{صف}`. `createdBy = "migration"`.
- الحركة بلا نوع `kind = "untyped"`؛ الفاتورة في المدين أو القيد في الدائن `reversed = true`؛ «دخلت Odoo» من التعبئة الصفراء (`odoo.by = "migration"`).
- سبب التعديل اليدوي لا يُخزَّن في الحركة (شكلها مقيد بالقواعد) بل في `migrationIssues/{entryId}`، و`needsManualFix = true` على الحركة.

## معلّق
- **الملخصات** (لتقليل القراءات ضمن 50 ألف قراءة يومياً): تُصمَّم مع لوحة الأرصدة في المرحلة 4، لأن تحديثها بلا Cloud Functions يحتاج تحققاً حسابياً في القواعد.
- صحة التاريخ في التقويم (31/02) تُفحص في التطبيق؛ القواعد تفحص الصيغة والمدى فقط.
