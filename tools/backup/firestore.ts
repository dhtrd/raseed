/**
 * قراءة قاعدة البيانات كاملة وكتابتها عند الاسترجاع (firebase-admin، الإنتاج أو المحاكي).
 * كل المجموعات العليا تُقرأ تلقائياً (لا قائمة ثابتة تنسى مجموعة جديدة)؛ المخطط بلا مجموعات فرعية،
 * ووجود أي مجموعة فرعية يوقف النسخ بخطأ صريح بدل نسخة ناقصة بصمت.
 */
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  decodeValue,
  encodeValue,
  FORMAT,
  VERSION,
  type AuthUserCopy,
  type BackupDump,
  type Encoded,
  type Manifest,
} from "./model.ts";

const BATCH = 400;

export async function dumpFirestore(
  db: Firestore,
  meta: { projectId: string; takenAt: Date; day: string },
  auth: Auth | null,
): Promise<BackupDump> {
  const collections: BackupDump["collections"] = {};
  for (const col of await db.listCollections()) {
    const snap = await col.get();
    const docs: Record<string, { [k: string]: Encoded }> = {};
    for (const d of snap.docs) {
      docs[d.id] = encodeValue(d.data(), `${col.id}/${d.id}`) as { [k: string]: Encoded };
    }
    collections[col.id] = docs;
  }
  await assertNoSubcollections(db, collections);
  return {
    format: FORMAT,
    version: VERSION,
    projectId: meta.projectId,
    takenAt: meta.takenAt.toISOString(),
    day: meta.day,
    collections,
    authUsers: auth ? await dumpAuth(auth) : null,
  };
}

/** فحص بقراءة رخيصة: مستند واحد من كل مجموعة (listCollections لا تُحسب قراءات) */
async function assertNoSubcollections(db: Firestore, collections: BackupDump["collections"]): Promise<void> {
  for (const [name, docs] of Object.entries(collections)) {
    for (const id of Object.keys(docs).slice(0, 1)) {
      const subs = await db.doc(`${name}/${id}`).listCollections();
      if (subs.length)
        throw new Error(
          `مجموعة فرعية غير متوقعة ${name}/${id}/${subs[0]?.id}: حدّث أداة النسخ قبل الاعتماد عليها.`,
        );
    }
  }
}

async function dumpAuth(auth: Auth): Promise<AuthUserCopy[]> {
  const out: AuthUserCopy[] = [];
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users)
      out.push({
        uid: u.uid,
        email: u.email ?? null,
        disabled: u.disabled,
        claims: u.customClaims
          ? (encodeValue(u.customClaims, `auth/${u.uid}`) as Record<string, Encoded>)
          : null,
        createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
      });
    token = page.pageToken;
  } while (token);
  return out;
}

/** أعداد الهدف بعد الاسترجاع (للمطابقة مع البيان) */
export async function countTarget(db: Firestore, auth: Auth | null, names: string[]): Promise<Manifest> {
  const collections: Record<string, number> = {};
  for (const n of names) collections[n] = (await db.collection(n).count().get()).data().count;
  let authUsers: number | null = null;
  if (auth) {
    authUsers = 0;
    let token: string | undefined;
    do {
      const page = await auth.listUsers(1000, token);
      authUsers += page.users.length;
      token = page.pageToken;
    } while (token);
  }
  return { collections, authUsers };
}

/** الهدف يجب أن يكون فارغاً: الاسترجاع لا يدمج فوق بيانات قائمة */
export async function assertEmptyTarget(db: Firestore): Promise<void> {
  const cols = await db.listCollections();
  if (cols.length)
    throw new Error(
      `المشروع الهدف ليس فارغاً (${cols.map((c) => c.id).join("، ")}). الاسترجاع إلى مشروع فارغ فقط.`,
    );
}

export async function restoreFirestore(
  db: Firestore,
  dump: BackupDump,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const ops: [string, Record<string, unknown>][] = [];
  for (const [name, docs] of Object.entries(dump.collections))
    for (const [id, d] of Object.entries(docs))
      ops.push([`${name}/${id}`, decodeValue(d, (s, n) => new Timestamp(s, n)) as Record<string, unknown>]);
  for (let i = 0; i < ops.length; i += BATCH) {
    const b = db.batch();
    for (const [path, data] of ops.slice(i, i + BATCH)) b.set(db.doc(path), data);
    await b.commit();
    onProgress?.(Math.min(i + BATCH, ops.length), ops.length);
  }
  return ops.length;
}

/**
 * يعيد حسابات الدخول بالمعرّفات نفسها (فتبقى مستندات users مربوطة) وبكلمة مرور عشوائية لا تُطبع:
 * كل مستخدم يدخل بعدها برابط «نسيت كلمة المرور».
 */
export async function restoreAuth(
  auth: Auth,
  users: AuthUserCopy[],
  randomPassword: () => string,
): Promise<number> {
  for (const u of users) {
    await auth.createUser({
      uid: u.uid,
      ...(u.email ? { email: u.email } : {}),
      disabled: u.disabled,
      password: randomPassword(),
    });
    if (u.claims)
      await auth.setCustomUserClaims(u.uid, decodeValue(u.claims, (s, n) => new Timestamp(s, n)) as object);
  }
  return users.length;
}
