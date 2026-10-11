/**
 * مركز المراجعة: سجلات `migrationIssues` المفتوحة وحركاتها بمستمعات مباشرة، وتعليم السجل محلولاً
 * أو إعادة فتحه (حقول الحل فقط، بسجل تدقيق في الدفعة نفسها كما تشترط القواعد).
 */
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { addAudit } from "../../../shared/firebase/audit";
import { firebase } from "../../../shared/firebase/client";
import { parseEntry, type LedgerEntry } from "../core/ledger";
import { IGNORE_NOTE_MAX, type ReviewIssue } from "../core/review";

const IN_LIMIT = 30;

function parseIssue(id: string, d: Record<string, unknown>): ReviewIssue {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const list = Array.isArray(d.issues) ? (d.issues as unknown[]) : [];
  return {
    id,
    entryId: str(d.entryId) || id,
    supplierId: str(d.supplierId),
    supplierName: str(d.supplierName),
    sheet: str(d.sheet),
    row: typeof d.row === "number" ? d.row : 0,
    issues: list.map((x) => {
      const o = (x ?? {}) as { code?: unknown; text?: unknown };
      return { code: str(o.code), text: str(o.text) };
    }),
  };
}

/** السجلات غير المحلولة (للمالك والإدارة؛ القواعد ترفض غيرهم). */
export function watchOpenIssues(
  onData: (rows: ReviewIssue[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    query(collection(db, "migrationIssues"), where("resolved", "==", false)),
    (snap) => onData(snap.docs.map((d) => parseIssue(d.id, d.data()))),
    onError,
  );
}

/** حركات السجلات بمعرّفاتها، بمستمع مباشر على أجزاء من 30 (حد شرط «in»). */
export function watchEntriesByIds(
  ids: string[],
  onData: (rows: Map<string, LedgerEntry>) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const { db } = firebase();
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) groups.push(ids.slice(i, i + IN_LIMIT));
  if (!groups.length) {
    onData(new Map());
    return () => {};
  }
  const parts = new Map<number, LedgerEntry[]>();
  const unsubs = groups.map((g, i) =>
    onSnapshot(
      query(collection(db, "entries"), where(documentId(), "in", g)),
      (snap) => {
        parts.set(
          i,
          snap.docs.map((d) => parseEntry(d.id, d.data())),
        );
        if (parts.size === groups.length)
          onData(new Map([...parts.values()].flat().map((e) => [e.id, e] as const)));
      },
      onError,
    ),
  );
  return () => unsubs.forEach((u) => u());
}

export type Resolution = "ignored" | "fixed" | "reopened";

/** يعلّم السجل محلولاً (تجاهل/صُحّح) أو يعيد فتحه، مع سجل تدقيق بالسبب. */
export async function setResolution(
  uid: string,
  issueId: string,
  resolution: Resolution,
  note = "",
): Promise<void> {
  const clean = note.trim().slice(0, IGNORE_NOTE_MAX);
  const { db } = firebase();
  const batch = writeBatch(db);
  const resolved = resolution !== "reopened";
  const auditId = addAudit(batch, db, {
    actor: uid,
    action: resolution === "ignored" ? "reviewIgnored" : resolution === "fixed" ? "reviewFixed" : "reviewReopened",
    entity: "migrationIssues",
    entityId: issueId,
    before: { resolved: !resolved },
    after: { resolved },
    reason: clean || undefined,
  });
  batch.update(doc(db, "migrationIssues", issueId), {
    resolved,
    resolution,
    resolutionNote: clean,
    resolvedBy: uid,
    resolvedAt: serverTimestamp(),
    auditId,
  });
  await batch.commit();
}
