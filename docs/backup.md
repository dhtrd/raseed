# النسخ الاحتياطي اليومي إلى Dropbox

> القرارات: DECISIONS 2026-10-11. السير: `.github/workflows/backup.yml`. الأدوات: `tools/backup`.

## ماذا يحدث كل يوم
- الساعة **11:30 بتوقيت الرياض** (08:30 UTC) يعمل سير GitHub Actions. GitHub قد يؤخر المهام المجدولة دقائق في أوقات الضغط.
- يقرأ Firestore كاملة (كل المجموعات) وحسابات الدخول (البريد والمعرّف والحالة والدور، **بلا كلمات مرور**).
- يرفع ملفين إلى مجلد التطبيق في Dropbox (`Apps/<اسم التطبيق>`):
  - `raseed-YYYY-MM-DD.json.gz.enc`: النسخة الكاملة للاسترجاع، مضغوطة ومشفّرة (AES-256-GCM بمفتاح من عبارة السر).
  - `raseed-YYYY-MM-DD.xlsx`: ملف Excel مقروء (ورقة «الأرصدة» وكشف لكل مورد، بلا المحذوف)، محمي بكلمة مرور هي عبارة السر نفسها.
- **الاحتفاظ:** آخر 30 يوماً، وأول نسخة من كل شهر تبقى دائماً. لا يُحذف أي ملف آخر في المجلد.
- يكتب النتيجة في `settings/backup`، فيظهر في جرس الإشعارات للمالك والإدارة: الفشل خطأ، وأكثر من 26 ساعة بلا نسخة تنبيه.
- القراءة اليومية نحو عدد المستندات كلها (قرابة 6–8 آلاف)، ضمن حد خطة Spark (50 ألف قراءة يومياً).

## الإعداد (مرة واحدة، على جهازك)

### 1) تطبيق Dropbox بأقل صلاحية
1. افتح https://www.dropbox.com/developers/apps ← **Create app**.
2. **Scoped access** ← **App folder** (لا يرى غير مجلده) ← اسم مثل `raseed-backup`.
3. في تبويب **Permissions** فعّل: `files.metadata.read`، `files.content.write`، `files.content.read` ثم **Submit**.
4. من تبويب **Settings** انسخ **App key** و**App secret**.

### 2) رمز التجديد (refresh token)
1. افتح في المتصفح (ضع App key مكان `APP_KEY`):
   `https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline`
2. وافق، وانسخ الرمز الذي يظهر (صالح دقائق).
3. في الطرفية على جهازك:
   ```
   curl https://api.dropboxapi.com/oauth2/token -d code=الرمز -d grant_type=authorization_code -u APP_KEY:APP_SECRET
   ```
4. من الناتج انسخ قيمة `refresh_token` فقط. لا تلصقه في أي محادثة أو ملف.

### 3) عبارة السر
- 16 حرفاً على الأقل (يُفضّل 5–6 كلمات عشوائية أو 24 حرفاً).
- **احفظها في مدير كلمات المرور أو مكان آمن خارج GitHub.** إن ضاعت فلا سبيل لفتح أي نسخة.

### 4) الأسرار في GitHub
المستودع ← Settings ← Environments ← **production** ← Add secret (البيئة نفسها التي فيها `FIREBASE_SERVICE_ACCOUNT`):

| الاسم | القيمة |
|---|---|
| `DROPBOX_APP_KEY` | App key |
| `DROPBOX_APP_SECRET` | App secret |
| `DROPBOX_REFRESH_TOKEN` | refresh_token |
| `BACKUP_PASSPHRASE` | عبارة السر |

### 5) تجربة فورية
Actions ← **Daily backup to Dropbox** ← **Run workflow**. بعد نجاحه يظهر الملفان في Dropbox، ويختفي تنبيه «لم يُفعَّل بعد» من الجرس.

## فتح نسخة أو استرجاعها
- **Excel:** افتح الملف واكتب عبارة السر.
- **فك ملف البيانات للاطلاع** (الناتج غير مشفّر، احذفه بعدها):
  ```
  BACKUP_PASSPHRASE='…' npm run backup:restore -- raseed-2026-10-11.json.gz.enc --decrypt-to ~/raseed.json
  ```
- **الاسترجاع إلى مشروع Firebase فارغ** (تجريبي للتحقق، أو بديل عند كارثة) ثم مطابقة الأعداد آلياً:
  ```
  RASEED_PROJECT_ID=مشروع-فارغ GOOGLE_APPLICATION_CREDENTIALS=~/مفتاح-خارج-المستودع.json \
  BACKUP_PASSPHRASE='…' npm run backup:restore -- raseed-2026-10-11.json.gz.enc
  ```
  - يرفض أي مشروع فيه بيانات (لا دمج فوق القائم).
  - الإنتاج `raseed-dhtrd` يحتاج `RASEED_RESTORE_CONFIRM=raseed-dhtrd` صراحةً.
  - حسابات الدخول تعود بمعرّفاتها وبكلمات عشوائية لا تُعرض؛ كل مستخدم يدخل برابط «نسيت كلمة المرور».

## تنبيه GitHub
GitHub يوقف المهام المجدولة في المستودعات العامة بعد 60 يوماً بلا أي نشاط (commit). إن توقف النسخ، يظهر ذلك في الجرس بعد 26 ساعة؛ أعد تفعيله من Actions.
