import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { addAudit } from "../../../shared/firebase/audit";
import { normalizeEmail } from "../../../shared/fields/core/password";

export async function signIn(identifier: string, password: string): Promise<void> {
  const id = normalizeEmail(identifier);
  if (!id.ok) throw Object.assign(new Error(id.error), { code: "auth/invalid-email" });
  await signInWithEmailAndPassword(firebase().auth, id.email, password);
}

export function signOutNow(): Promise<void> {
  return signOut(firebase().auth);
}

/**
 * «نسيت كلمة المرور»: رابط إلى البريد (الدخول بالبريد فقط، DECISIONS 2026-10-11).
 * النتيجة لا تكشف وجود البريد: «user-not-found» يُعامَل كنجاح.
 */
export async function requestPasswordReset(identifier: string): Promise<"emailSent"> {
  const id = normalizeEmail(identifier);
  if (!id.ok) throw Object.assign(new Error(id.error), { code: "auth/invalid-email" });
  try {
    await sendPasswordResetEmail(firebase().auth, id.email);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
  return "emailSent";
}

/** أول دخول: كلمة جديدة، ثم إزالة علم «تغيير إلزامي» بسجل تدقيق (القواعد تسمح بهذا وحده). */
export async function replaceTemporaryPassword(newPassword: string): Promise<void> {
  const { auth } = firebase();
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("لا جلسة"), { code: "auth/requires-recent-login" });
  await updatePassword(user, newPassword);
  await clearTemporaryFlag(user.uid);
}

async function clearTemporaryFlag(uid: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, { actor: uid, action: "passwordChanged", entity: "users", entityId: uid });
  batch.update(doc(db, "users", uid), { mustChangePassword: false, auditId, updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * صفحة الرابط (DECISIONS 2026-10-12، الخيار ب): التحقق لا يستهلك الرابط، ويُستدعى بعد نقر المستخدم فقط
 * كي لا تُبطله ماسحات روابط البريد. يعيد البريد الذي ستتغير كلمته.
 */
export function checkResetLink(code: string): Promise<string> {
  return verifyPasswordResetCode(firebase().auth, code);
}

/**
 * يعيّن الكلمة الجديدة ثم يدخل تلقائياً (قرار المستخدم)، ويزيل علم الكلمة المؤقتة إن وُجد بسجل تدقيق.
 * إن نجح التعيين وفشل ما بعده يُرمى خطأ بالمرحلة كي لا يُظن أن الكلمة لم تتغير.
 */
export async function completeReset(code: string, email: string, newPassword: string): Promise<void> {
  await confirmPasswordReset(firebase().auth, code, newPassword);
  try {
    const { auth, db } = firebase();
    const cred = await signInWithEmailAndPassword(auth, email, newPassword);
    const me = await getDoc(doc(db, "users", cred.user.uid));
    if (me.get("mustChangePassword") === true) await clearTemporaryFlag(cred.user.uid);
  } catch (e) {
    throw Object.assign(new Error("تغيّرت الكلمة وتعذّر الدخول التلقائي"), { stage: "afterReset", cause: e });
  }
}

/** رابط تعيين كلمة المرور لصاحب البريد، يطلبه المالك أو الإدارة من صفحة المستخدم. */
export async function sendResetLinkTo(email: string): Promise<void> {
  await sendPasswordResetEmail(firebase().auth, email);
}
