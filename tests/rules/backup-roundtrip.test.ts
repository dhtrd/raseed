/**
 * شرط القبول «و» (SPEC): النسخة تُسترجع في مشروع آخر وتطابق أعدادها المصدر.
 * على المحاكي: مشروعان منفصلان، نسخ ← تشفير ← فك ← استرجاع ← مطابقة البيان والقيم.
 */
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, expect, it } from "vitest";
import { decryptData, encryptData } from "../../tools/backup/crypto.ts";
import {
  assertEmptyTarget,
  countTarget,
  dumpFirestore,
  restoreFirestore,
} from "../../tools/backup/firestore.ts";
import { compareManifests, manifestOf, parseDump } from "../../tools/backup/model.ts";

const SRC = "demo-backup-src";
const DST = "demo-backup-dst";
const PASS = "emulator-only passphrase";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
let apps: App[] = [];
let src: Firestore;
let dst: Firestore;

async function clear(project: string) {
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

beforeAll(async () => {
  await Promise.all([clear(SRC), clear(DST)]);
  const a = initializeApp({ projectId: SRC }, "backup-src");
  const b = initializeApp({ projectId: DST }, "backup-dst");
  apps = [a, b];
  src = getFirestore(a);
  dst = getFirestore(b);
  const batch = src.batch();
  batch.set(src.doc("suppliers/s1"), {
    name: "المورد (أ)",
    status: "active",
    createdAt: new Timestamp(1760000000, 5000),
  });
  for (let i = 0; i < 450; i++)
    batch.set(src.doc(`entries/e${i}`), {
      supplierId: "s1",
      kind: i % 2 ? "inv" : "misc",
      date: "2026-10-01",
      debit: i,
      credit: 0,
      odoo: { entered: i % 3 === 0, at: Timestamp.fromMillis(1760000000000 + i) },
      tags: ["a", i],
    });
  batch.set(src.doc("settings/lock"), { lockedThrough: "2026-09-30" });
  await batch.commit();
});

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

it("نسخة مشفرة تُسترجع في مشروع فارغ بالأعداد والقيم نفسها", async () => {
  const dump = await dumpFirestore(src, { projectId: SRC, takenAt: new Date(), day: "2026-10-11" }, null);
  const expected = manifestOf(dump);
  expect(expected.collections).toEqual({ entries: 450, settings: 1, suppliers: 1 });

  const back = parseDump(decryptData(encryptData(JSON.stringify(dump), PASS), PASS));
  await assertEmptyTarget(dst);
  expect(await restoreFirestore(dst, back)).toBe(452);

  const actual = await countTarget(dst, null, Object.keys(expected.collections));
  expect(compareManifests(expected, actual)).toEqual([]);
  const e = (await dst.doc("entries/e7").get()).data();
  expect(e?.odoo.at).toBeInstanceOf(Timestamp);
  expect((e?.odoo.at as Timestamp).toMillis()).toBe(1760000000007);
  expect(e?.tags).toEqual(["a", 7]);
  const s = (await dst.doc("suppliers/s1").get()).data();
  expect((s?.createdAt as Timestamp).isEqual(new Timestamp(1760000000, 5000))).toBe(true);

  // الاسترجاع لا يدمج فوق بيانات قائمة
  await expect(assertEmptyTarget(dst)).rejects.toThrow(/ليس فارغاً/);
});
