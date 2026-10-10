# سكربتات المالك — «رصيد»

> تعمل على جهاز المالك فقط، لا في CI ولا في المتصفح. لا تُكتب كلمة مرور في سطر الأوامر ولا في السجل.
> القرار: DECISIONS 2026-10-10 (إنشاء الحسابات «ج. هجين»).

## المتطلبات
1. Node.js 22 أو أحدث، ونسخة من المستودع، و`npm ci`.
2. **مفتاح حساب خدمة خاص بالمالك** (غير مفتاح CI الحالي `raseed-ci-deployer`، فذاك لا يملك صلاحية الحسابات):
   - Google Cloud Console ← IAM ← Service Accounts ← Create: الاسم `raseed-owner-admin`.
   - الأدوار: **Firebase Authentication Admin** و**Cloud Datastore User** فقط.
   - Keys ← Add key ← JSON. احفظ الملف **خارج مجلد المستودع** (المستودع عام)، مثلاً `~/keys/raseed-owner.json`.
   - احذف المفتاح من Console إن لم تعد تحتاجه، وأنشئ غيره عند الحاجة.

## إنشاء حساب المالك (مرة واحدة قبل أول دخول)
```
RASEED_PROJECT_ID=raseed-dhtrd GOOGLE_APPLICATION_CREDENTIALS=~/keys/raseed-owner.json npm run admin:create-owner
```
يسأل: البريد أو اسم المستخدم، والاسم الظاهر، وكلمة المرور مرتين (لا تظهر). يرفض إن وُجد مالك، أو كانت الكلمة أقل من «قوية».

## كلمة مرور مؤقتة لصاحب اسم مستخدم
```
RASEED_PROJECT_ID=raseed-dhtrd GOOGLE_APPLICATION_CREDENTIALS=~/keys/raseed-owner.json npm run admin:reset-password
```
يسأل عن اسم المستخدم ويطلب كتابة «نعم». ثم يولّد كلمة مؤقتة تظهر **مرة واحدة**، ويُخرج المستخدم من كل أجهزته، ويُلزمه بتغييرها عند أول دخول، ويسجّل العملية في التدقيق.
- أصحاب البريد لا يحتاجونه: «نسيت كلمة المرور» في شاشة الدخول.
- لا يعيد كلمة مرور المالك.

## التجربة على المحاكي
```
npx firebase emulators:exec --only auth,firestore --project demo-raseed "RASEED_PROJECT_ID=demo-raseed npm run admin:create-owner"
```
مع المحاكي لا يلزم مفتاح.
