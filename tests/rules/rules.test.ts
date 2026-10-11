import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

/**
 * اختبارات المحاكي لكل بند في SPEC §3-ب وقرارات DECISIONS.md.
 * تفشل إن خُرقت أي صلاحية. بيانات وهمية فقط.
 */
let env: RulesTestEnvironment;
let auditSeq = 0;
const newAuditId = () => `a${Date.now()}_${auditSeq++}`;
const refKey = (refNo: string) => refNo.replace(/\//g, "|");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-raseed",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env.cleanup());

const ODOO_NEW = { entered: false, by: null, at: null, reason: null, reasonText: "" };
const NAMES: Record<string, string> = { s1: "المورد (أ)", s2: "المورد (ب)" };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = asDb(ctx.firestore());
    const user = (role: string, assigned: string[] = [], active = true) => ({
      displayName: role,
      login: `${role}@users.raseed.internal`,
      role,
      assigned,
      active,
      auditId: "seed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, "users/owner"), user("owner"));
    await setDoc(doc(db, "users/admin"), user("admin"));
    await setDoc(doc(db, "users/entry"), user("entry", ["s1"]));
    await setDoc(doc(db, "users/entry2"), user("entry", ["s1"]));
    await setDoc(doc(db, "users/inactive"), user("entry", ["s1"], false));
    await setDoc(doc(db, "suppliers/s1"), { name: "المورد (أ)", status: "active", auditId: "seed" });
    await setDoc(doc(db, "suppliers/s2"), { name: "المورد (ب)", status: "active", auditId: "seed" });
    await setDoc(doc(db, "settings/lock"), { lockedThrough: "2026-06-30", auditId: "seed" });
    // فاتورة قائمة P10590 في s1 وأخرى في s2
    await setDoc(doc(db, "entries/e0"), {
      ...invoice("s1", "10590"),
      createdBy: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      auditId: "seed",
    });
    await setDoc(doc(db, `refs/${refKey("P10590")}`), {
      ids: ["e0"],
      places: [{ entryId: "e0", supplierId: "s1", supplierName: "المورد (أ)" }],
    });
    // فاتورة في الفترة المقفلة
    await setDoc(doc(db, "entries/eL"), {
      ...invoice("s1", "10111", { date: "2026-05-10" }),
      createdBy: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      auditId: "seed",
    });
    await setDoc(doc(db, "entries/e2"), {
      ...invoice("s2", "20001"),
      createdBy: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      auditId: "seed",
    });
    // حركة منقولة بلا نوع ومرجع قديم مخالف للطول
    await setDoc(doc(db, "entries/legacy"), {
      supplierId: "s1",
      kind: "untyped",
      date: "2026-07-05",
      mainRef: "791",
      refNo: "791",
      voucher: "",
      details: "رصيد افتتاحي",
      debit: 50000,
      credit: 0,
      reversed: false,
      needsManualFix: true,
      deleted: false,
      createdBy: "migration",
      createdAt: new Date(),
      updatedAt: new Date(),
      auditId: "seed",
    });
  });
});

function invoice(supplierId: string, mainRef: string, over: Record<string, unknown> = {}) {
  return {
    supplierId,
    kind: "inv",
    date: "2026-08-15",
    mainRef,
    refNo: `P${mainRef}`,
    voucher: "",
    details: "فاتورة مشتريات",
    debit: 0,
    credit: 475000,
    reversed: false,
    odoo: ODOO_NEW,
    needsManualFix: false,
    deleted: false,
    ...over,
  };
}

function journal(supplierId: string, mainRef: string, over: Record<string, unknown> = {}) {
  return {
    supplierId,
    kind: "misc",
    date: "2026-08-15",
    mainRef,
    refNo: `MISC/2026/08/${mainRef}`,
    voucher: "6004",
    details: "دفعة",
    debit: 200000,
    credit: 0,
    reversed: false,
    needsManualFix: false,
    deleted: false,
    ...over,
  };
}

// rules-unit-testing يعيد نوع compat؛ الكائن نفسه يعمل مع الواجهة المعيارية
const asDb = (db: unknown) => db as Firestore;
const as = (uid: string) => asDb(env.authenticatedContext(uid).firestore());

/** ينشئ حركة كما سيفعل التطبيق: الحركة + سجل التدقيق + فهرس المرجع في دفعة واحدة. */
function createEntry(
  db: Firestore,
  uid: string,
  eid: string,
  data: Record<string, unknown>,
  opts: { refExists?: boolean; skipAudit?: boolean; skipRef?: boolean; wrongName?: boolean } = {},
) {
  const b = writeBatch(db);
  const aid = newAuditId();
  b.set(doc(db, `entries/${eid}`), {
    ...data,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    auditId: aid,
  });
  if (!opts.skipAudit)
    b.set(doc(db, `auditLog/${aid}`), {
      actor: uid,
      at: serverTimestamp(),
      action: "create",
      entity: "entries",
      entityId: eid,
    });
  if (data.kind !== "note" && !opts.skipRef) {
    const ref = doc(db, `refs/${refKey(String(data.refNo))}`);
    const sid = String(data.supplierId);
    const place = {
      entryId: eid,
      supplierId: sid,
      supplierName: opts.wrongName ? "اسم مزيف" : (NAMES[sid] ?? ""),
    };
    if (opts.refExists) b.update(ref, { ids: arrayUnion(eid), places: arrayUnion(place) });
    else b.set(ref, { ids: [eid], places: [place] });
  }
  return b.commit();
}

/** تعديل حركة مع سجل تدقيق. */
function updateEntry(
  db: Firestore,
  uid: string,
  eid: string,
  patch: Record<string, unknown>,
  opts: { skipAudit?: boolean; refSet?: string } = {},
) {
  const b = writeBatch(db);
  const aid = newAuditId();
  b.update(doc(db, `entries/${eid}`), { ...patch, updatedAt: serverTimestamp(), auditId: aid });
  if (!opts.skipAudit)
    b.set(doc(db, `auditLog/${aid}`), {
      actor: uid,
      at: serverTimestamp(),
      action: "update",
      entity: "entries",
      entityId: eid,
    });
  if (opts.refSet)
    b.set(doc(db, `refs/${refKey(opts.refSet)}`), {
      ids: [eid],
      places: [{ entryId: eid, supplierId: "s1", supplierName: "المورد (أ)" }],
    });
  return b.commit();
}

function writeWithAudit(
  db: Firestore,
  uid: string,
  path: string,
  entity: string,
  entityId: string,
  data: Record<string, unknown>,
  mode: "set" | "update" = "set",
) {
  const b = writeBatch(db);
  const aid = newAuditId();
  if (mode === "set") b.set(doc(db, path), { ...data, auditId: aid });
  else b.update(doc(db, path), { ...data, auditId: aid });
  b.set(doc(db, `auditLog/${aid}`), { actor: uid, at: serverTimestamp(), action: mode, entity, entityId });
  return b.commit();
}

describe("§3-ب: مدخل البيانات", () => {
  it("يقرأ المورد المسند إليه", () => assertSucceeds(getDoc(doc(as("entry"), "suppliers/s1"))));
  it("لا يقرأ مورداً غير مسند إليه", () => assertFails(getDoc(doc(as("entry"), "suppliers/s2"))));
  it("لا يقرأ حركات مورد غير مسند إليه", () => assertFails(getDoc(doc(as("entry"), "entries/e2"))));
  it("يستعلم عن حركات موردينه فقط", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(as("entry"), "entries"),
          where("supplierId", "in", ["s1"]),
          where("deleted", "==", false),
        ),
      ),
    );
    await assertFails(getDocs(collection(as("entry"), "entries")));
  });
  it("يضيف حركة لمورده", () =>
    assertSucceeds(createEntry(as("entry"), "entry", "n1", invoice("s1", "12292"))));
  it("يضيف ملاحظة لمورده", () =>
    assertSucceeds(
      createEntry(as("entry"), "entry", "n2", {
        supplierId: "s1",
        kind: "note",
        date: "2026-08-15",
        debit: 0,
        credit: 0,
        note: "اتصل المورد",
        needsManualFix: false,
        deleted: false,
      }),
    ));
  it("لا يضيف لمورد غير مسند إليه", () =>
    assertFails(createEntry(as("entry"), "entry", "n3", invoice("s2", "12292"))));
  it("لا يعدّل حركة", () => assertFails(updateEntry(as("entry"), "entry", "e0", { details: "تعديل" })));
  it("لا يغيّر حالة Odoo", () =>
    assertFails(
      updateEntry(as("entry"), "entry", "e0", {
        odoo: { entered: true, by: "entry", at: serverTimestamp(), reason: null, reasonText: "" },
      }),
    ));
  it("لا ينشئ فاتورة بحالة «دخلت»", () =>
    assertFails(
      createEntry(
        as("entry"),
        "entry",
        "n4",
        invoice("s1", "12293", { odoo: { ...ODOO_NEW, entered: true } }),
      ),
    ));
  it("لا يقرأ سجل التدقيق", () => assertFails(getDocs(collection(as("entry"), "auditLog"))));
  it("المستخدم الموقوف لا يقرأ شيئاً", () => assertFails(getDoc(doc(as("inactive"), "suppliers/s1"))));
  it("غير المسجّل لا يقرأ شيئاً", () =>
    assertFails(getDoc(doc(asDb(env.unauthenticatedContext().firestore()), "suppliers/s1"))));
});

describe("§3-ب: الفترة المقفلة", () => {
  it("لا إضافة بتاريخ داخل الفترة المقفلة، ولا للمالك", () =>
    assertFails(createEntry(as("owner"), "owner", "l1", invoice("s1", "12294", { date: "2026-06-15" }))));
  it("الإضافة بعد تاريخ القفل مسموحة", () =>
    assertSucceeds(createEntry(as("owner"), "owner", "l2", invoice("s1", "12295", { date: "2026-07-01" }))));
  it("لا نقل حركة إلى داخل الفترة المقفلة", () =>
    assertFails(updateEntry(as("admin"), "admin", "e0", { date: "2026-06-01" })));
  it("الإدارة لا تغيّر تاريخ القفل", () =>
    assertFails(
      writeWithAudit(as("admin"), "admin", "settings/lock", "settings", "lock", {
        lockedThrough: "2026-07-31",
      }),
    ));
  it("المالك يغيّر تاريخ القفل", () =>
    assertSucceeds(
      writeWithAudit(as("owner"), "owner", "settings/lock", "settings", "lock", {
        lockedThrough: "2026-07-31",
      }),
    ));
});

describe("§3-ب: حماية حساب المالك", () => {
  it("الإدارة لا تعدّل حساب المالك", () =>
    assertFails(
      writeWithAudit(as("admin"), "admin", "users/owner", "users", "owner", { active: false }, "update"),
    ));
  it("الإدارة تعدّل مستخدماً آخر", () =>
    assertSucceeds(
      writeWithAudit(
        as("admin"),
        "admin",
        "users/entry",
        "users",
        "entry",
        { assigned: ["s1", "s2"] },
        "update",
      ),
    ));
  it("لا أحد يمنح دور المالك", () =>
    assertFails(
      writeWithAudit(as("owner"), "owner", "users/entry", "users", "entry", { role: "owner" }, "update"),
    ));
  it("لا يُنشأ مستخدم بدور المالك", () =>
    assertFails(
      writeWithAudit(as("owner"), "owner", "users/x", "users", "x", {
        displayName: "x",
        login: "x@users.raseed.internal",
        role: "owner",
        assigned: [],
        active: true,
      }),
    ));
  it("المالك لا يوقف نفسه", () =>
    assertFails(
      writeWithAudit(as("owner"), "owner", "users/owner", "users", "owner", { active: false }, "update"),
    ));
  it("مدخل البيانات لا يعدّل حسابه ولا يقرأ غيره", async () => {
    await assertFails(
      writeWithAudit(
        as("entry"),
        "entry",
        "users/entry",
        "users",
        "entry",
        { assigned: ["s1", "s2"] },
        "update",
      ),
    );
    await assertFails(getDoc(doc(as("entry"), "users/entry2")));
    await assertSucceeds(getDoc(doc(as("entry"), "users/entry")));
  });
  it("لا حذف للمستخدمين", () => assertFails(deleteDoc(doc(as("owner"), "users/entry"))));
});

describe("§3-ب: سجل التدقيق ثابت", () => {
  it("يرفض التعديل", async () => {
    await createEntry(as("owner"), "owner", "t1", invoice("s1", "12296"));
    const logs = await getDocs(collection(as("owner"), "auditLog"));
    const first = logs.docs[0];
    if (!first) throw new Error("لا سجلات");
    await assertFails(updateDoc(first.ref, { action: "x" }));
  });
  it("يرفض الحذف", async () => {
    await createEntry(as("owner"), "owner", "t2", invoice("s1", "12297"));
    const logs = await getDocs(collection(as("owner"), "auditLog"));
    const first = logs.docs[0];
    if (!first) throw new Error("لا سجلات");
    await assertFails(deleteDoc(first.ref));
  });
  it("لا سجل باسم مستخدم آخر", () =>
    assertFails(
      setDoc(doc(as("admin"), "auditLog/fake"), {
        actor: "owner",
        at: serverTimestamp(),
        action: "x",
        entity: "entries",
        entityId: "e0",
      }),
    ));
  it("لا كتابة حركة بلا سجل تدقيق", () =>
    assertFails(createEntry(as("owner"), "owner", "t3", invoice("s1", "12298"), { skipAudit: true })));
  it("لا تعديل بلا سجل تدقيق", () =>
    assertFails(updateEntry(as("admin"), "admin", "e0", { details: "x" }, { skipAudit: true })));
});

describe("اتجاه المبلغ والمرجع (DECISIONS 2026-10-10)", () => {
  it("الفاتورة في المدين بلا عكس مرفوضة", () =>
    assertFails(createEntry(as("owner"), "owner", "d1", invoice("s1", "12301", { debit: 1000, credit: 0 }))));
  it("المرتجع (فاتورة معكوسة في المدين) مقبول", () =>
    assertSucceeds(
      createEntry(
        as("owner"),
        "owner",
        "d2",
        invoice("s1", "12302", { debit: 60000, credit: 0, reversed: true }),
      ),
    ));
  it("القيد في المدين مقبول، وفي الدائن بلا عكس مرفوض", async () => {
    await assertSucceeds(createEntry(as("owner"), "owner", "d3", journal("s1", "0396")));
    await assertFails(
      createEntry(as("owner"), "owner", "d4", journal("s1", "0397", { debit: 0, credit: 1000 })),
    );
  });
  it("لا مدين ودائن معاً", () =>
    assertFails(
      createEntry(as("owner"), "owner", "d5", invoice("s1", "12303", { debit: 100, reversed: true })),
    ));
  it("المبلغ صفر أو كسر أو سالب مرفوض", async () => {
    await assertFails(createEntry(as("owner"), "owner", "d6", invoice("s1", "12304", { credit: 0 })));
    await assertFails(createEntry(as("owner"), "owner", "d7", invoice("s1", "12305", { credit: 10.5 })));
    await assertFails(createEntry(as("owner"), "owner", "d8", invoice("s1", "12306", { credit: -100 })));
  });
  it("مرجع الفاتورة 4 أرقام مرفوض، والقيد 5 مرفوض", async () => {
    await assertFails(createEntry(as("owner"), "owner", "r1", invoice("s1", "0791")));
    await assertFails(createEntry(as("owner"), "owner", "r2", journal("s1", "03950")));
  });
  it("مراجع المرتجعات ببادئة مقبولة", () =>
    assertSucceeds(
      createEntry(
        as("owner"),
        "owner",
        "r3",
        invoice("s1", "OUT/00013", { refNo: "POUT/00013", debit: 1000, credit: 0, reversed: true }),
      ),
    ));
  it("رقم مرجعي لا يطابق المرجع مرفوض", () =>
    assertFails(createEntry(as("owner"), "owner", "r4", invoice("s1", "12307", { refNo: "P99999" }))));
  it("رقم القيد المرجعي من سنة التاريخ وشهره", () =>
    assertFails(
      createEntry(as("owner"), "owner", "r5", journal("s1", "0398", { refNo: "MISC/2026/07/0398" })),
    ));
});

describe("تكرار الرقم المرجعي: تحذير صارم غير حاجب", () => {
  it("المكرر بلا سبب مرفوض", () =>
    assertFails(createEntry(as("owner"), "owner", "u1", invoice("s1", "10590"), { refExists: true })));
  it("المكرر مع تأكيد وسبب مقبول", () =>
    assertSucceeds(
      createEntry(
        as("owner"),
        "owner",
        "u2",
        invoice("s1", "10590", { dup: { reason: "فاتورتان بالرقم نفسه من فرعين" } }),
        { refExists: true },
      ),
    ));
  it("لا حركة بلا فهرس للمرجع", () =>
    assertFails(createEntry(as("owner"), "owner", "u3", invoice("s1", "12308"), { skipRef: true })));
});

describe("حالة Odoo", () => {
  const entered = (uid: string) => ({
    odoo: { entered: true, by: uid, at: serverTimestamp(), reason: null, reasonText: "" },
  });
  it("الإدارة تحدد «دخلت»", () => assertSucceeds(updateEntry(as("admin"), "admin", "e0", entered("admin"))));
  it("الإرجاع بلا سبب مرفوض", async () => {
    await updateEntry(as("admin"), "admin", "e0", entered("admin"));
    await assertFails(
      updateEntry(as("admin"), "admin", "e0", {
        odoo: { entered: false, by: "admin", at: serverTimestamp(), reason: null, reasonText: "" },
      }),
    );
  });
  it("«أخرى» بلا نص مرفوض، وبنص مقبول", async () => {
    await updateEntry(as("admin"), "admin", "e0", entered("admin"));
    await assertFails(
      updateEntry(as("admin"), "admin", "e0", {
        odoo: { entered: false, by: "admin", at: serverTimestamp(), reason: "other", reasonText: "" },
      }),
    );
    await assertSucceeds(
      updateEntry(as("admin"), "admin", "e0", {
        odoo: { entered: false, by: "admin", at: serverTimestamp(), reason: "other", reasonText: "سبب" },
      }),
    );
  });
  it("الإرجاع بسبب من القائمة مقبول", async () => {
    await updateEntry(as("owner"), "owner", "e0", entered("owner"));
    await assertSucceeds(
      updateEntry(as("owner"), "owner", "e0", {
        odoo: { entered: false, by: "owner", at: serverTimestamp(), reason: "wrong", reasonText: "" },
      }),
    );
  });
  it("لا يُنسب التغيير لمستخدم آخر", () =>
    assertFails(updateEntry(as("admin"), "admin", "e0", entered("owner"))));
  it("لا حالة Odoo للقيود", () =>
    assertFails(createEntry(as("owner"), "owner", "o1", journal("s1", "0399", { odoo: ODOO_NEW }))));
});

describe("الحذف", () => {
  it("المالك يحذف حذفاً ناعماً", () =>
    assertSucceeds(updateEntry(as("owner"), "owner", "e0", { deleted: true })));
  it("الإدارة لا تحذف", () => assertFails(updateEntry(as("admin"), "admin", "e0", { deleted: true })));
  it("لا حذف نهائي لأحد", () => assertFails(deleteDoc(doc(as("owner"), "entries/e0"))));
  it("المحذوف لا يراه مدخل البيانات", async () => {
    await updateEntry(as("owner"), "owner", "e0", { deleted: true });
    await assertFails(getDoc(doc(as("entry"), "entries/e0")));
  });
});

describe("البيانات المنقولة", () => {
  it("حركة بلا نوع ومرجع قديم تبقى قابلة للتعديل (تفاصيل)", () =>
    assertSucceeds(updateEntry(as("admin"), "admin", "legacy", { details: "رصيد افتتاحي مصحح" })));
  it("لا تُنشأ حركة بلا نوع من التطبيق", () =>
    assertFails(createEntry(as("owner"), "owner", "m1", { ...invoice("s1", "12309"), kind: "untyped" })));
  it("تصنيف الحركة المنقولة يتطلب شكلاً صحيحاً كاملاً", async () => {
    await assertFails(updateEntry(as("admin"), "admin", "legacy", { kind: "inv" }));
    await assertSucceeds(
      updateEntry(
        as("admin"),
        "admin",
        "legacy",
        { kind: "misc", mainRef: "0791", refNo: "MISC/2026/07/0791", needsManualFix: false },
        { refSet: "MISC/2026/07/0791" },
      ),
    );
  });
});

describe("الموردون والإعدادات", () => {
  it("الإدارة تضيف مورداً، ومدخل البيانات لا", async () => {
    await assertSucceeds(
      writeWithAudit(as("admin"), "admin", "suppliers/s3", "suppliers", "s3", {
        name: "المورد (ج)",
        status: "active",
      }),
    );
    await assertFails(
      writeWithAudit(as("entry"), "entry", "suppliers/s4", "suppliers", "s4", {
        name: "المورد (د)",
        status: "active",
      }),
    );
  });
  it("الإدارة تؤرشف مورداً", () =>
    assertSucceeds(
      writeWithAudit(as("admin"), "admin", "suppliers/s2", "suppliers", "s2", {
        name: "المورد (ب)",
        status: "archived",
      }),
    ));
  it("مسميات الأدوار للمالك فقط", async () => {
    const names = { owner: "صاحب المؤسسة", admin: "الإدارة", entry: "مدخل" };
    await assertFails(
      writeWithAudit(as("admin"), "admin", "settings/roleNames", "settings", "roleNames", names),
    );
    await assertSucceeds(
      writeWithAudit(as("owner"), "owner", "settings/roleNames", "settings", "roleNames", names),
    );
  });
});

describe("Odoo في الفترة المقفلة (DECISIONS 2026-10-10)", () => {
  const odoo = (uid: string, lockReason?: string) => ({
    odoo: {
      entered: true,
      by: uid,
      at: serverTimestamp(),
      reason: null,
      reasonText: "",
      ...(lockReason !== undefined ? { lockReason } : {}),
    },
  });
  it("الإدارة لا تغيّر حالة فاتورة مقفلة", () =>
    assertFails(updateEntry(as("admin"), "admin", "eL", odoo("admin", "سبب"))));
  it("المالك بلا سبب مرفوض", () => assertFails(updateEntry(as("owner"), "owner", "eL", odoo("owner"))));
  it("المالك بسبب مكتوب مقبول", () =>
    assertSucceeds(updateEntry(as("owner"), "owner", "eL", odoo("owner", "تصحيح بعد مطابقة Odoo السنوية"))));
  it("المالك لا يعدّل غير Odoo في الفترة المقفلة", () =>
    assertFails(updateEntry(as("owner"), "owner", "eL", { ...odoo("owner", "سبب"), details: "تعديل" })));
});

describe("مكان التكرار لكل المستخدمين", () => {
  it("مدخل البيانات يقرأ اسم المورد صاحب الرقم المكرر ولو لم يُسند إليه", async () => {
    await createEntry(as("owner"), "owner", "p1", invoice("s2", "30001"));
    const snap = await assertSucceeds(getDoc(doc(as("entry"), `refs/${refKey("P30001")}`)));
    if (snap.data()?.places?.[0]?.supplierName !== "المورد (ب)") throw new Error("الاسم غير ظاهر");
  });
  it("اسم مورد مزيف في الفهرس مرفوض", () =>
    assertFails(createEntry(as("owner"), "owner", "p2", invoice("s1", "30002"), { wrongName: true })));
});

describe("أول دخول بكلمة مؤقتة (DECISIONS 2026-10-10)", () => {
  const newUser = (role: string, must?: boolean) => ({
    displayName: "مستخدم جديد",
    login: "new@users.raseed.internal",
    role,
    assigned: [],
    active: true,
    ...(must === undefined ? {} : { mustChangePassword: must }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const seedPending = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(asDb(ctx.firestore()), "users/pending"), {
        ...newUser("entry", true),
        assigned: ["s1"],
        auditId: "seed",
      });
    });
  const clearFlag = (db: Firestore, uid: string, action = "passwordChanged", extra = {}) => {
    const b = writeBatch(db);
    const aid = newAuditId();
    b.update(doc(db, `users/${uid}`), {
      mustChangePassword: false,
      updatedAt: new Date(),
      auditId: aid,
      ...extra,
    });
    b.set(doc(db, `auditLog/${aid}`), {
      actor: uid,
      at: serverTimestamp(),
      action,
      entity: "users",
      entityId: uid,
    });
    return b.commit();
  };

  it("الإدارة تنشئ مستخدماً جديداً بعلم التغيير فقط", async () => {
    await assertSucceeds(
      writeWithAudit(as("admin"), "admin", "users/n1", "users", "n1", newUser("entry", true)),
    );
    await assertFails(
      writeWithAudit(as("admin"), "admin", "users/n2", "users", "n2", newUser("entry", false)),
    );
    await assertFails(writeWithAudit(as("admin"), "admin", "users/n3", "users", "n3", newUser("entry")));
  });
  it("الإدارة تنشئ «إدارة» أخرى وتعدّلها", async () => {
    await assertSucceeds(
      writeWithAudit(as("admin"), "admin", "users/n4", "users", "n4", newUser("admin", true)),
    );
    await assertSucceeds(
      writeWithAudit(as("admin"), "admin", "users/n4", "users", "n4", { active: false }, "update"),
    );
  });
  it("قبل التغيير لا يصل لأي بيانات", async () => {
    await seedPending();
    await assertFails(getDoc(doc(as("pending"), "suppliers/s1")));
    await assertFails(getDoc(doc(as("pending"), "settings/lock")));
    await assertSucceeds(getDoc(doc(as("pending"), "users/pending")));
  });
  it("يزيل العلم عن نفسه بسجل تدقيق، ثم يصل لموردينه", async () => {
    await seedPending();
    await assertSucceeds(clearFlag(as("pending"), "pending"));
    await assertSucceeds(getDoc(doc(as("pending"), "suppliers/s1")));
  });
  it("لا يغيّر غير العلم ولا يعيده", async () => {
    await seedPending();
    await assertFails(clearFlag(as("pending"), "pending", "passwordChanged", { assigned: ["s1", "s2"] }));
    await assertFails(clearFlag(as("pending"), "pending", "update"));
    await assertSucceeds(clearFlag(as("pending"), "pending"));
    await assertFails(clearFlag(as("pending"), "pending"));
  });
  it("لا يزيل العلم عن غيره", async () => {
    await seedPending();
    await assertFails(clearFlag(as("entry"), "pending"));
  });
  it("الموقوف لا يزيل العلم", async () => {
    await seedPending();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(asDb(ctx.firestore()), "users/pending"), { active: false });
    });
    await assertFails(clearFlag(as("pending"), "pending"));
  });
});

describe("مدة الخمول (DECISIONS 2026-10-10)", () => {
  const put = (uid: string, idleMinutes: unknown) =>
    writeWithAudit(as(uid), uid, "settings/session", "settings", "session", { idleMinutes });
  it("المالك فقط، من 5 إلى 120 دقيقة عدداً صحيحاً", async () => {
    await assertFails(put("admin", 30));
    await assertSucceeds(put("owner", 30));
    await assertSucceeds(put("owner", 5));
    await assertSucceeds(put("owner", 120));
    await assertFails(put("owner", 4));
    await assertFails(put("owner", 121));
    await assertFails(put("owner", 30.5));
    await assertFails(put("owner", "30"));
  });
  it("يقرؤها كل مستخدم نشط", async () => {
    await assertSucceeds(getDoc(doc(as("entry"), "settings/session")));
    await assertFails(getDoc(doc(as("inactive"), "settings/session")));
  });
});
