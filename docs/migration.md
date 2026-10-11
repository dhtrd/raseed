# نقل البيانات من الإكسل — «رصيد» (المرحلة 3)

> يعمل على جهاز المالك فقط. كلمة مرور الإكسل تُطلب عند التشغيل ولا تُحفظ. البيانات تُنقل **كما هي**، وكل شاذ يُعلَّم «للتعديل اليدوي» ويظهر في مركز المراجعة.

## ما يفعله
- يقرأ أوراق الموردين (بين «نوع المستند» و«تقرير_التكرار»)، والصف 3 رأس الجدول.
- ينشئ: `suppliers/s01..` · `entries/m-sXX-rNNNN` (معرّفات ثابتة) · `refs/…` · `migrationIssues/…` · سجل تدقيق واحد · `settings/migration` (علامة الاكتمال تمنع نقلاً ثانياً).
- يطابق المجاميع لكل مورد مع رأس ورقته، ولفترة ورقة «الرئيسية»، ويكتب تقرير RTL في `migration-reports/` (خارج git).
- الفاتورة المعبأة بالأصفر في خلية المرجع = «دخلت Odoo».
- لا يكتب شيئاً إن وُجد مانع أو فرق في المطابقة.

## التقرير فقط (لا يكتب شيئاً)
```
npm run migrate -- --file "C:\path\to\file.xlsm"
```

## النقل إلى الإنتاج
يحتاج مفتاح حساب خدمة بدور **Cloud Datastore User** (مثل `raseed-owner-admin`) خارج مجلد المستودع، وحساب المالك موجوداً.
```
$env:RASEED_PROJECT_ID="raseed-dhtrd"; $env:GOOGLE_APPLICATION_CREDENTIALS="$HOME\keys\raseed-owner.json"; npm run migrate -- --file "C:\path\to\file.xlsm" --write
```
يطلب كتابة «انقل» للتأكيد. بعد النجاح احذف المفتاح من جهازك.

## التجربة على المحاكي
```
npx firebase emulators:exec --only firestore --project demo-raseed "RASEED_PROJECT_ID=demo-raseed npm run migrate -- --file private/source.xlsm --write"
```
