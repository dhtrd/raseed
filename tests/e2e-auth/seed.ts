import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** بيانات وهمية فقط. يعمل على المحاكي حصراً (يرفض بلا متغيرات المحاكي). */
export const OWNER = { email: "owner@example.com", password: "Tq7#mLx9!pR2vZ", name: "صاحب المنشأة" };
export const ADMIN = { email: "maha@example.com", password: "Ad7#mLx9!pR2vQ", name: "مها" };
export const ENTRY = { email: "salem@example.com", password: "En7#mLx9!pR2vW", name: "سالم" };

/** حركات وهمية للأرصدة والكشف (المبالغ بالهللات). الأرقام المتوقعة محسوبة يدوياً في ledger.spec.ts. */
type SeedEntry = {
  id: string;
  sup: string;
  date: string;
  kind: "inv" | "misc" | "note" | "untyped";
  ref?: string;
  debit?: number;
  credit?: number;
  reversed?: boolean;
  fix?: boolean;
  deleted?: boolean;
  note?: string;
  details?: string;
  voucher?: string;
};
const ENTRIES: SeedEntry[] = [
  {
    id: "e101",
    sup: "s1",
    date: "2026-06-20",
    kind: "inv",
    ref: "10001",
    credit: 100000,
    voucher: "305",
    details: "فاتورة مشتريات",
  },
  {
    id: "e102",
    sup: "s1",
    date: "2026-07-05",
    kind: "misc",
    ref: "0501",
    debit: 100000,
    details: "سداد الفاتورة 10001",
  },
  {
    id: "e103",
    sup: "s1",
    date: "2026-10-02",
    kind: "inv",
    ref: "10002",
    credit: 250050,
    details: "فاتورة مشتريات",
  },
  { id: "e104", sup: "s1", date: "2026-10-03", kind: "note", note: "اتصال لتأكيد موعد التوريد" },
  {
    id: "e105",
    sup: "s1",
    date: "2026-10-04",
    kind: "inv",
    ref: "10003",
    debit: 30000,
    reversed: true,
    details: "مرتجع بضاعة",
  },
  { id: "e106", sup: "s1", date: "2026-10-05", kind: "inv", ref: "10009", credit: 99900, deleted: true },
  { id: "e107", sup: "s1", date: "2026-10-06", kind: "misc", ref: "0502", debit: 120000, fix: true },
  { id: "e108", sup: "s1", date: "2026-10-07", kind: "untyped", ref: "", credit: 5025, fix: true },
  { id: "e201", sup: "s2", date: "2026-09-15", kind: "inv", ref: "20001", credit: 400000 },
  { id: "e202", sup: "s2", date: "2026-10-08", kind: "misc", ref: "0601", debit: 150000 },
  { id: "e203", sup: "s2", date: "2026-10-09", kind: "misc", ref: "0602", credit: 20000, reversed: true },
  { id: "e301", sup: "s3", date: "2026-10-01", kind: "inv", ref: "30001", credit: 75000 },
  { id: "e501", sup: "s5", date: "2026-08-01", kind: "misc", ref: "0701", debit: 9999 },
  { id: "e901", sup: "s9", date: "2026-05-01", kind: "inv", ref: "90001", credit: 1000 },
];

function refNo(e: SeedEntry): string {
  if (e.kind === "inv") return `P${e.ref}`;
  if (e.kind === "misc") return `MISC/${e.date.slice(0, 4)}/${e.date.slice(5, 7)}/${e.ref}`;
  return "";
}

export default async function seed() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("e2e-auth يعمل على المحاكي فقط: شغّله بـ npm run test:e2e:auth");
  }
  if (!getApps().length) initializeApp({ projectId: "demo-raseed" });
  const auth = getAuth();
  const db = getFirestore();
  const existing = await auth.listUsers();
  if (existing.users.length) await auth.deleteUsers(existing.users.map((u) => u.uid));
  for (const c of ["users", "suppliers", "settings", "auditLog", "entries", "migrationIssues"]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const mk = async (p: typeof OWNER, role: string, assigned: string[] = []) => {
    const u = await auth.createUser({ email: p.email, password: p.password, displayName: p.name });
    await db.doc(`users/${u.uid}`).set({
      displayName: p.name,
      login: p.email,
      role,
      assigned,
      active: true,
      mustChangePassword: false,
      auditId: "seed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };
  await mk(OWNER, "owner");
  await mk(ADMIN, "admin");
  await mk(ENTRY, "entry", ["s2"]);
  const letters = ["أ", "ب", "ج", "د", "هـ"];
  for (const [i, l] of letters.entries()) {
    await db.doc(`suppliers/s${i + 1}`).set({ name: `المورد (${l})`, status: "active", auditId: "seed" });
  }
  await db.doc("suppliers/s9").set({ name: "المورد (ق)", status: "archived", auditId: "seed" });
  for (const e of ENTRIES) {
    await db.doc(`entries/${e.id}`).set({
      supplierId: e.sup,
      kind: e.kind,
      date: e.date,
      mainRef: e.ref ?? "",
      refNo: refNo(e),
      voucher: e.voucher ?? "",
      details: e.details ?? "",
      note: e.note ?? "",
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
      reversed: e.reversed === true,
      needsManualFix: e.fix === true,
      deleted: e.deleted === true,
      ...(e.kind === "inv"
        ? { odoo: e.id === "e301" ? { entered: true, by: "migration" } : { entered: false } }
        : {}),
      auditId: "seed",
      createdBy: "seed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const issue = (entryId: string, sup: string, code: string, resolved = false) =>
    db.doc(`migrationIssues/${entryId}`).set({
      entryId,
      supplierId: sup,
      supplierName: "وهمي",
      sheet: "وهمي",
      row: 1,
      issues: [{ code, text: "وهمي" }],
      resolved,
      createdAt: new Date(),
    });
  // فترة مقفلة حتى نهاية يونيو: الفاتورة e101 لا تتغير حالتها في Odoo
  await db.doc("settings/lock").set({ lockedThrough: "2026-06-30", auditId: "seed" });
  await issue("e107", "s1", "future_date");
  await issue("e108", "s1", "untyped");
  await issue("e201", "s2", "duplicate_ref", true);
}
