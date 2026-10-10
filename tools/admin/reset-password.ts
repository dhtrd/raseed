/**
 * كلمة مرور مؤقتة جديدة لصاحب اسم المستخدم (الخيار «ج. هجين»، DECISIONS 2026-10-10). يشغّله المالك:
 *   RASEED_PROJECT_ID=raseed-dhtrd GOOGLE_APPLICATION_CREDENTIALS=/path/outside/repo/key.json node tools/admin/reset-password.ts
 * يولّد كلمة مؤقتة تظهر مرة واحدة على الشاشة، ويُلزم صاحبها بتغييرها، ويُخرجه من كل أجهزته.
 * أصحاب البريد لا يحتاجونه: يستخدمون «نسيت كلمة المرور» في شاشة الدخول.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { ask, checkEnv, fail, generateTempPassword, identifierToEmail } from "./lib.ts";

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
const owner = owners.docs[0];
if (!owner) fail("لا يوجد حساب مالك. شغّل create-owner.ts أولاً.");

console.log(`المشروع: ${env.projectId}${env.emulator ? " (المحاكي)" : ""}`);
const login = (await ask("اسم المستخدم أو البريد: ")).trim().toLowerCase();
const id = identifierToEmail(login);
if (!id.ok) fail(id.error);

const user = await auth.getUserByEmail(id.email).catch(() => null);
if (!user) fail("لا يوجد حساب دخول بهذا الاسم.");
const ref = db.doc(`users/${user.uid}`);
const snap = await ref.get();
if (!snap.exists) fail("للحساب دخول بلا مستند مستخدم. راجع إدارة المستخدمين.");
if (snap.get("role") === "owner")
  fail("هذا السكربت لا يعيد كلمة مرور المالك. استخدم «نسيت كلمة المرور» ببريدك.");

const confirm = (
  await ask(`إعادة كلمة مرور «${snap.get("displayName")}» (${login})؟ اكتب نعم للمتابعة: `)
).trim();
if (confirm !== "نعم") fail("أُلغي. لم يتغير شيء.");

const temp = generateTempPassword();
await auth.updateUser(user.uid, { password: temp });
await auth.revokeRefreshTokens(user.uid);
const batch = db.batch();
const audit = db.collection("auditLog").doc();
batch.update(ref, { mustChangePassword: true, auditId: audit.id, updatedAt: FieldValue.serverTimestamp() });
batch.set(audit, {
  actor: owner.id,
  at: FieldValue.serverTimestamp(),
  action: "resetPassword",
  entity: "users",
  entityId: user.uid,
  reason: "سكربت المالك",
});
await batch.commit();

console.log("✓ أُعيدت كلمة المرور، وخرج المستخدم من كل أجهزته.");
console.log("  الكلمة المؤقتة (تظهر مرة واحدة، سلّمها له يداً بيد، ولا تُحفظ في أي مكان):");
console.log(`  ${temp}`);
console.log("  سيُطلب منه تغييرها عند أول دخول.");
process.exit(0);
