import { useEffect, useState } from "react";
import type { UserProfile } from "../../users/core/users";
import { listVisibleSuppliers, type SupplierRef } from "../data/ledgerRepo";

export type Loadable<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** رسالة عربية واضحة لخطأ Firestore؛ الأصل يُسجَّل في وحدة التحكم (لا ابتلاع صامت). */
export function readError(e: unknown, what: string): string {
  console.error(`تعذّر ${what}`, e);
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") return `لا صلاحية لـ${what}. إن كان هذا خطأً فأبلغ المالك.`;
  if (code === "unavailable") return `تعذّر ${what}: لا اتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.`;
  if (code === "failed-precondition")
    return `تعذّر ${what}: فهرس قاعدة البيانات قيد الإنشاء. أعد المحاولة بعد دقائق.`;
  return `تعذّر ${what}. أعد المحاولة، وإن تكرر فأبلغ المالك بالنص: ${code || String(e)}`;
}

type Keyed<T> = { key: string; value: Loadable<T> };
const LOADING = { status: "loading" } as const;

/**
 * نتيجة طلب مرتبطة بمفتاحه: تغيّر المفتاح يعني «جارٍ التحميل» فوراً دون setState داخل الأثر،
 * ونتيجة طلب قديم لا تُعرض لمفتاح أحدث. `key = null` يعني لا طلب.
 */
export function useKeyedLoad<T>(key: string | null, load: () => Promise<T>, what: string): Loadable<T> {
  const [st, setSt] = useState<Keyed<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    load()
      .then((data) => live && setSt({ key, value: { status: "ready", data } }))
      .catch((e: unknown) => live && setSt({ key, value: { status: "error", message: readError(e, what) } }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- المفتاح يلخّص مدخلات الطلب
  }, [key]);
  return st && st.key === key ? st.value : LOADING;
}

/** مثل useKeyedLoad لمستمع مباشر (onSnapshot): يعيد الاشتراك عند تغيّر المفتاح. */
export function useKeyedWatch<T>(
  key: string | null,
  watch: (onData: (d: T) => void, onError: (e: Error) => void) => () => void,
  what: string,
): Loadable<T> {
  const [st, setSt] = useState<Keyed<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    return watch(
      (data) => setSt({ key, value: { status: "ready", data } }),
      (e) => setSt({ key, value: { status: "error", message: readError(e, what) } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- كما أعلاه
  }, [key]);
  return st && st.key === key ? st.value : LOADING;
}

/** الموردون المرئيون للمستخدم (الكل للمالك والإدارة، المسنَدون لمدخل البيانات). */
export function useVisibleSuppliers(profile: UserProfile, reloadKey = 0): Loadable<SupplierRef[]> {
  return useKeyedLoad(
    `${profile.uid}|${profile.role}|${profile.assigned.join(",")}|${reloadKey}`,
    () => listVisibleSuppliers(profile),
    "قراءة الموردين",
  );
}
