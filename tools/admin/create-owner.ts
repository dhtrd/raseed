/**
 * إنشاء حساب المالك قبل أول دخول (SPEC، DECISIONS 2026-10-10). يُشغَّل مرة واحدة على جهاز المالك:
 *   RASEED_PROJECT_ID=raseed-dhtrd GOOGLE_APPLICATION_CREDENTIALS=/path/outside/repo/key.json node tools/admin/create-owner.ts
 * يرفض التشغيل إن وُجد مالك. دور «المالك» لا يُمنح من الواجهة أبداً.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { ask, askHidden, checkEnv, fail, identifierToEmail, isStrongPassword } from "./lib.ts";

const env = checkEnv(process.env);
if (!env.ok) fail(env.error);
initializeApp(
  env.emulator
    ? { projectId: env.projectId }
    : { projectId: env.projectId, credential: applicationDefault() },
);
const auth = getAuth();
const db = getFirestore();

const owners = await db.collection("users").where("role", "==", "owner").limit(1).get();
if (!owners.empty) fail("يوجد حساب مالك بالفعل. لا يُنشأ مالك ثانٍ.");

console.log(`المشروع: ${env.projectId}${env.emulator ? " (المحاكي)" : ""}`);
const login = (await ask("بريد المالك أو اسم المستخدم: ")).trim().toLowerCase();
const id = identifierToEmail(login);
if (!id.ok) fail(id.error);
const displayName = (await ask("الاسم الظاهر: ")).trim();
if (!displayName || displayName.length > 80) fail("الاسم الظاهر مطلوب وحتى 80 حرفاً.");
const pw = await askHidden("كلمة المرور (لن تظهر): ");
if (!isStrongPassword(pw, [login, displayName])) {
  fail(
    "كلمة المرور ضعيفة: 12 حرفاً على الأقل تجمع حروفاً لاتينية كبيرة وصغيرة وأرقاماً ورموزاً، ولا تحوي الاسم.",
  );
}
if ((await askHidden("أعد كتابتها: ")) !== pw) fail("الكلمتان غير متطابقتين.");

const user = await auth.createUser({ email: id.email, password: pw, displayName });
try {
  const batch = db.batch();
  const audit = db.collection("auditLog").doc();
  batch.set(db.doc(`users/${user.uid}`), {
    displayName,
    login,
    role: "owner",
    assigned: [],
    active: true,
    mustChangePassword: false,
    auditId: audit.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit, {
    actor: user.uid,
    at: FieldValue.serverTimestamp(),
    action: "bootstrapOwner",
    entity: "users",
    entityId: user.uid,
    reason: "سكربت الإعداد",
  });
  await batch.commit();
} catch (e) {
  // لا حساب دخول يتيم بلا مستند: يُحذف ويُبلَّغ بالخطأ
  await auth.deleteUser(user.uid);
  throw e;
}
console.log(`✓ أُنشئ حساب المالك (${login}). ادخل به من صفحة «رصيد».`);
process.exit(0);
