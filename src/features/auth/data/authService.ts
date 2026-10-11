import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { addAudit } from "../../../shared/firebase/audit";
import { identifierToEmail } from "../../../shared/fields/core/password";

export async function signIn(identifier: string, password: string): Promise<void> {
  const id = identifierToEmail(identifier);
  if (!id.ok) throw Object.assign(new Error(id.error), { code: "auth/invalid-email" });
  await signInWithEmailAndPassword(firebase().auth, id.email, password);
}

export function signOutNow(): Promise<void> {
  return signOut(firebase().auth);
}

/**
 * «نسيت كلمة المرور»: البريد يستلم رابطاً، واسم المستخدم يُوجَّه إلى المالك (الخيار «هجين»).
 * النتيجة لا تكشف وجود البريد: «user-not-found» يُعامَل كنجاح.
 */
export async function requestPasswordReset(identifier: string): Promise<"emailSent" | "askOwner"> {
  const v = identifier.trim();
  if (!v.includes("@")) return "askOwner";
  const id = identifierToEmail(v);
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
  const { auth, db } = firebase();
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("لا جلسة"), { code: "auth/requires-recent-login" });
  await updatePassword(user, newPassword);
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, {
    actor: user.uid,
    action: "passwordChanged",
    entity: "users",
    entityId: user.uid,
  });
  batch.update(doc(db, "users", user.uid), { mustChangePassword: false, auditId, updatedAt: serverTimestamp() });
  await batch.commit();
}

/** رابط تعيين كلمة المرور لصاحب البريد، يطلبه المالك أو الإدارة من صفحة المستخدم. */
export async function sendResetLinkTo(email: string): Promise<void> {
  await sendPasswordResetEmail(firebase().auth, email);
}
