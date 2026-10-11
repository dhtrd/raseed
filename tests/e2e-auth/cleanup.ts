import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function adminDb() {
  if (!getApps().length) initializeApp({ projectId: "demo-raseed" });
  return getFirestore();
}

/** يحذف الحركات التي أنشأتها الاختبارات (غير البذرة) ويعيد فهرس refs كما كان. */
export async function removeCreatedEntries() {
  const db = adminDb();
  const made = await db.collection("entries").where("createdBy", "!=", "seed").get();
  for (const d of made.docs) {
    const refNo = d.get("refNo") as string | undefined;
    if (refNo) {
      const ref = db.doc(`refs/${refNo.replace(/\//g, "|")}`);
      const snap = await ref.get();
      const ids = ((snap.get("ids") as string[] | undefined) ?? []).filter((x) => x !== d.id);
      if (!ids.length) await ref.delete();
      else
        await ref.update({
          ids,
          places: ((snap.get("places") as { entryId: string }[]) ?? []).filter((p) => p.entryId !== d.id),
        });
    }
    await d.ref.delete();
  }
}
