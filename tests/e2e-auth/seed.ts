import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** بيانات وهمية فقط. يعمل على المحاكي حصراً (يرفض بلا متغيرات المحاكي). */
export const OWNER = { email: "owner@example.com", password: "Tq7#mLx9!pR2vZ", name: "صاحب المنشأة" };
export const ADMIN = { email: "maha@example.com", password: "Ad7#mLx9!pR2vQ", name: "مها" };

export default async function seed() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("e2e-auth يعمل على المحاكي فقط: شغّله بـ npm run test:e2e:auth");
  }
  if (!getApps().length) initializeApp({ projectId: "demo-raseed" });
  const auth = getAuth();
  const db = getFirestore();
  const existing = await auth.listUsers();
  if (existing.users.length) await auth.deleteUsers(existing.users.map((u) => u.uid));
  for (const c of ["users", "suppliers", "settings", "auditLog"]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const mk = async (p: typeof OWNER, role: string) => {
    const u = await auth.createUser({ email: p.email, password: p.password, displayName: p.name });
    await db.doc(`users/${u.uid}`).set({
      displayName: p.name,
      login: p.email,
      role,
      assigned: [],
      active: true,
      mustChangePassword: false,
      auditId: "seed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };
  await mk(OWNER, "owner");
  await mk(ADMIN, "admin");
  const letters = ["أ", "ب", "ج", "د", "هـ"];
  for (const [i, l] of letters.entries()) {
    await db.doc(`suppliers/s${i + 1}`).set({ name: `المورد (${l})`, status: "active", auditId: "seed" });
  }
  await db.doc("suppliers/s9").set({ name: "المورد (ق)", status: "archived", auditId: "seed" });
}
