import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase, withSecondaryAuth } from "../../../shared/firebase/client";
import { addAudit } from "../../../shared/firebase/audit";
import { parseUser, type Role, type UserProfile } from "../core/users";

export function watchUsers(onData: (users: UserProfile[]) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  // أول لقطة قد تأتي من الذاكرة المحلية ناقصة (مستند المستخدم الحالي فقط): ننتظر الخادم أولاً
  let fromServer = false;
  return onSnapshot(
    collection(db, "users"),
    { includeMetadataChanges: true },
    (snap) => {
      if (!fromServer && snap.metadata.fromCache) return;
      fromServer = true;
      onData(snap.docs.map((d) => parseUser(d.id, d.data())).filter((x): x is UserProfile => x !== null));
    },
    onError,
  );
}

export interface NewUserInput {
  displayName: string;
  login: string;
  email: string;
  role: Exclude<Role, "owner">;
  tempPassword: string;
}

/**
 * إنشاء حساب دخول ومستند مستخدم (الخيار «ج. هجين»). الحساب يُنشأ بتطبيق ثانوي كي لا يخرج المدير.
 * إن فشلت كتابة المستند يُحذف حساب الدخول فوراً كي لا يبقى حساب يتيم، ويظهر الخطأ.
 */
export async function createUserAccount(input: NewUserInput, actorUid: string): Promise<string> {
  const { db } = firebase();
  return withSecondaryAuth(async (secondary) => {
    const cred = await createUserWithEmailAndPassword(secondary, input.email, input.tempPassword);
    const uid = cred.user.uid;
    try {
      const batch = writeBatch(db);
      const auditId = addAudit(batch, db, {
        actor: actorUid,
        action: "createUser",
        entity: "users",
        entityId: uid,
        after: { displayName: input.displayName, login: input.login, role: input.role },
      });
      batch.set(doc(db, "users", uid), {
        displayName: input.displayName,
        login: input.login,
        role: input.role,
        assigned: [],
        active: true,
        mustChangePassword: true,
        auditId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (e) {
      await cred.user.delete().catch((del: unknown) => console.error("تعذّر حذف حساب الدخول اليتيم", uid, del));
      throw e;
    } finally {
      await signOut(secondary).catch(() => undefined);
    }
    return uid;
  });
}

type UserPatch = Partial<Pick<UserProfile, "role" | "active">>;

/** تعديل الدور أو الحالة بسجل تدقيق يحفظ القيمة قبل وبعد. */
export async function updateUser(target: UserProfile, patch: UserPatch, actorUid: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as (keyof UserPatch)[]) before[k] = target[k];
  const auditId = addAudit(batch, db, {
    actor: actorUid,
    action: "role" in patch ? "changeRole" : patch.active ? "activateUser" : "deactivateUser",
    entity: "users",
    entityId: target.uid,
    before,
    after: { ...patch },
  });
  batch.update(doc(db, "users", target.uid), { ...patch, auditId, updatedAt: serverTimestamp() });
  await batch.commit();
}

export interface AssignChange {
  user: UserProfile;
  assigned: string[];
  added: string[];
  removed: string[];
}

/** حفظ الإسناد لكل من تغيّر في عملية واحدة، بسجل تدقيق لكل مستخدم يذكر المضاف والمزال. */
export async function saveAssignments(changes: AssignChange[], actorUid: string): Promise<void> {
  if (!changes.length) return;
  const { db } = firebase();
  const batch = writeBatch(db);
  for (const c of changes) {
    const auditId = addAudit(batch, db, {
      actor: actorUid,
      action: "assignSuppliers",
      entity: "users",
      entityId: c.user.uid,
      before: { assigned: c.user.assigned },
      after: { assigned: c.assigned, added: c.added, removed: c.removed },
    });
    batch.update(doc(db, "users", c.user.uid), { assigned: c.assigned, auditId, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
