/**
 * فك تشفير نسخة واسترجاعها والتحقق منها (يُشغَّل على جهاز المالك، لا في GitHub).
 *
 * فك التشفير فقط (للاطلاع، الناتج JSON خارج المستودع):
 *   BACKUP_PASSPHRASE=… npm run backup:restore -- raseed-2026-10-11.json.gz.enc --decrypt-to ~/raseed.json
 *
 * الاسترجاع إلى مشروع فارغ (تجريبي أو المحاكي)، ثم مطابقة الأعداد بالبيان:
 *   RASEED_PROJECT_ID=raseed-restore-test GOOGLE_APPLICATION_CREDENTIALS=… BACKUP_PASSPHRASE=… \
 *   npm run backup:restore -- raseed-2026-10-11.json.gz.enc
 *
 * الاسترجاع إلى الإنتاج raseed-dhtrd يحتاج RASEED_RESTORE_CONFIRM=raseed-dhtrd صراحةً، والهدف يجب أن يكون فارغاً دائماً.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { checkEnv, generateTempPassword } from "../admin/lib.ts";
import { checkPassphrase, decryptData } from "./crypto.ts";
import { assertEmptyTarget, countTarget, restoreAuth, restoreFirestore } from "./firestore.ts";
import { compareManifests, manifestOf, parseDump } from "./model.ts";

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args[0];
if (!file || file.startsWith("--")) fail("حدّد ملف النسخة (.json.gz.enc).");
const di = args.indexOf("--decrypt-to");
const decryptTo = di >= 0 ? args[di + 1] : undefined;
if (di >= 0 && !decryptTo) fail("حدّد مسار الناتج بعد --decrypt-to.");

let dump;
try {
  dump = parseDump(decryptData(readFileSync(file), checkPassphrase(process.env.BACKUP_PASSPHRASE)));
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
const expected = manifestOf(dump);
console.log(`نسخة ${dump.day} من ${dump.projectId}:`);
for (const [n, c] of Object.entries(expected.collections)) console.log(`  ${n}: ${c}`);
if (expected.authUsers !== null) console.log(`  حسابات الدخول: ${expected.authUsers}`);

if (decryptTo) {
  writeFileSync(decryptTo, JSON.stringify(dump, null, 1), { mode: 0o600 });
  console.log(`✓ فُك التشفير إلى ${decryptTo} (احذفه بعد الاطلاع؛ فيه البيانات كاملة بلا تشفير).`);
  process.exit(0);
}

const env = checkEnv(process.env);
if (!env.ok) fail(env.error);
if (env.projectId === "raseed-dhtrd" && process.env.RASEED_RESTORE_CONFIRM !== "raseed-dhtrd")
  fail("الهدف هو الإنتاج raseed-dhtrd: أضف RASEED_RESTORE_CONFIRM=raseed-dhtrd إن كان هذا مقصوداً فعلاً.");

initializeApp({ projectId: env.projectId, ...(env.emulator ? {} : { credential: applicationDefault() }) });
const db = getFirestore();
const auth = getAuth();
try {
  await assertEmptyTarget(db);
  const n = await restoreFirestore(db, dump, (done, total) => process.stdout.write(`\r  ${done}/${total}`));
  console.log(`\n✓ كُتب ${n} مستنداً.`);
  if (dump.authUsers) {
    const u = await restoreAuth(auth, dump.authUsers, () => generateTempPassword(20));
    console.log(`✓ أُعيد ${u} حساب دخول بكلمات عشوائية لا تُعرض: كل مستخدم يدخل برابط «نسيت كلمة المرور».`);
  }
  const diffs = compareManifests(
    expected,
    await countTarget(db, dump.authUsers ? auth : null, Object.keys(expected.collections)),
  );
  if (diffs.length) fail(`الأعداد لا تطابق النسخة:\n  ${diffs.join("\n  ")}`);
  console.log("✓ الأعداد تطابق النسخة في كل المجموعات.");
  process.exit(0);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
