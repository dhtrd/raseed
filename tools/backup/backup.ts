/**
 * النسخ الاحتياطي اليومي (يُشغَّل من .github/workflows/backup.yml الساعة 11:30 بتوقيت الرياض):
 * 1) يقرأ Firestore كاملة وحسابات الدخول بلا كلمات مرور، 2) يشفّر ملف البيانات وملف Excel بعبارة السر،
 * 3) يرفعهما إلى مجلد تطبيق Dropbox، 4) يحذف ما تجاوز سياسة الاحتفاظ، 5) يكتب الحالة في settings/backup
 * (نجاحاً أو فشلاً) فيظهرها جرس الإشعارات للمالك والإدارة.
 *
 *   RASEED_PROJECT_ID=raseed-dhtrd GOOGLE_APPLICATION_CREDENTIALS=… BACKUP_PASSPHRASE=… \
 *   DROPBOX_APP_KEY=… DROPBOX_APP_SECRET=… DROPBOX_REFRESH_TOKEN=… npm run backup
 *
 * BACKUP_OUT_DIR (اختياري): يكتب الملفين محلياً بدل Dropbox (للتجربة على المحاكي).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { checkEnv } from "../admin/lib.ts";
import { checkPassphrase, encryptData, encryptXlsx } from "./crypto.ts";
import { credsFromEnv, Dropbox } from "./dropbox.ts";
import { dumpFirestore } from "./firestore.ts";
import { fileNames, manifestOf, riyadhDay, safeError, toPrune } from "./model.ts";
import { buildBackupWorkbook } from "./workbook.ts";

const env = checkEnv(process.env, { auth: false });
if (!env.ok) {
  console.error(`✗ ${env.error}`);
  process.exit(1);
}
initializeApp({
  projectId: env.projectId,
  ...(env.emulator ? {} : { credential: applicationDefault() }),
});
const db = getFirestore();
const status = db.doc("settings/backup");
const started = Date.now();
const runDay = riyadhDay(new Date(started));
// سجل تشغيل لكل يوم (نافذة «متابعة النسخ»، DECISIONS 2026-10-12): التشغيل الثاني في اليوم نفسه يحل محل الأول
const run = db.doc(`backupRuns/${runDay}`);
const withAuth = !env.emulator || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

try {
  const passphrase = checkPassphrase(process.env.BACKUP_PASSPHRASE);
  const outDir = process.env.BACKUP_OUT_DIR?.trim();
  const dropbox = outDir ? null : new Dropbox(credsFromEnv(process.env));

  const takenAt = new Date(started);
  const day = runDay;
  const dump = await dumpFirestore(
    db,
    { projectId: env.projectId, takenAt, day },
    withAuth ? getAuth() : null,
  );
  const manifest = manifestOf(dump);
  const names = fileNames(day);
  const data = encryptData(JSON.stringify(dump), passphrase);
  const xlsx = encryptXlsx(Buffer.from(await buildBackupWorkbook(dump).xlsx.writeBuffer()), passphrase);

  let pruned: string[] = [];
  let kept: string[] = [names.data, names.sheet];
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, names.data), data);
    writeFileSync(join(outDir, names.sheet), xlsx);
  } else if (dropbox) {
    await dropbox.upload(names.data, data);
    await dropbox.upload(names.sheet, xlsx);
    const all = await dropbox.list();
    pruned = toPrune(all, day);
    for (const n of pruned) await dropbox.remove(n);
    kept = all
      .filter((n) => !pruned.includes(n))
      .sort()
      .reverse();
  }

  await status.set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastStatus: "ok",
    lastError: "",
    lastFile: names.data,
    lastDay: day,
    counts: manifest.collections,
    authUsers: manifest.authUsers,
    bytes: data.length + xlsx.length,
  });
  await run.set({
    day,
    at: FieldValue.serverTimestamp(),
    status: "ok",
    error: "",
    durationMs: Date.now() - started,
    bytes: data.length + xlsx.length,
    counts: manifest.collections,
    authUsers: manifest.authUsers,
    files: kept.slice(0, 120),
  });
  console.log(
    `✓ نسخة ${day}: ${names.data} و${names.sheet} (${Math.round((data.length + xlsx.length) / 1024)} ك.ب)`,
  );
  for (const [n, c] of Object.entries(manifest.collections)) console.log(`  ${n}: ${c}`);
  if (manifest.authUsers !== null) console.log(`  حسابات الدخول: ${manifest.authUsers}`);
  if (pruned.length) console.log(`  حُذف حسب سياسة الاحتفاظ: ${pruned.join("، ")}`);
  process.exit(0);
} catch (e) {
  const msg = safeError(e);
  console.error(`✗ فشل النسخ الاحتياطي: ${msg}`);
  try {
    await status.set(
      { lastRunAt: FieldValue.serverTimestamp(), lastStatus: "failed", lastError: msg },
      { merge: true },
    );
    await run.set({
      day: runDay,
      at: FieldValue.serverTimestamp(),
      status: "failed",
      error: msg,
      durationMs: Date.now() - started,
    });
  } catch (w) {
    console.error(`✗ وتعذّر تسجيل الفشل في settings/backup: ${safeError(w)}`);
  }
  process.exit(1);
}
