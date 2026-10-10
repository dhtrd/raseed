import { doc, onSnapshot, writeBatch, type Unsubscribe } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { addAudit } from "../../../shared/firebase/audit";
import { parseRoleNames, type RoleNames } from "../core/users";
import { effectiveIdleMinutes } from "../../auth/core/sessionSettings";

export function watchRoleNames(onData: (n: RoleNames) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(doc(db, "settings", "roleNames"), (s) => onData(parseRoleNames(s.data())), onError);
}

export function watchIdleMinutes(onData: (m: number) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(doc(db, "settings", "session"), (s) => onData(effectiveIdleMinutes(s.data()?.idleMinutes)), onError);
}

export async function saveRoleNames(names: RoleNames, before: RoleNames, actorUid: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, {
    actor: actorUid,
    action: "renameRoles",
    entity: "settings",
    entityId: "roleNames",
    before: { ...before },
    after: { ...names },
  });
  batch.set(doc(db, "settings", "roleNames"), { ...names, auditId });
  await batch.commit();
}

export async function saveIdleMinutes(minutes: number, before: number, actorUid: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, {
    actor: actorUid,
    action: "setIdleMinutes",
    entity: "settings",
    entityId: "session",
    before: { idleMinutes: before },
    after: { idleMinutes: minutes },
  });
  batch.set(doc(db, "settings", "session"), { idleMinutes: minutes, auditId });
  await batch.commit();
}

