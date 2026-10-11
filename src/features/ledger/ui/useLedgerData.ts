import { useEffect, useState, useSyncExternalStore } from "react";
import type { UserProfile } from "../../users/core/users";
import { subscribeSuppliers, suppliersVersion } from "../../suppliers/data/suppliersRepo";
import { listVisibleSuppliers, watchLedgerChanges, type SupplierRef } from "../data/ledgerRepo";

export type Loadable<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** رسالة عربية واضحة لخطأ Firestore؛ الأصل يُسجَّل في وحدة التحكم (لا ابتلاع صامت). */
export function readError(e: unknown, what: string): string {
  console.error(`تعذّر ${what}`, e);
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") return `لا صلاحية لـ${what}. إن كان هذا خطأً فأبلغ المالك.`;
  if (code === "unavailable") return `تعذّر ${what}: لا اتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.`;
  if (code === "failed-precondition")
    return `تعذّر ${what}: فهرس قاعدة البيانات غير جاهز (قيد الإنشاء أو ناقص). أعد المحاولة بعد دقائق، وإن استمر فأبلغ Claude بالنص: فهرس ناقص.`;
  return `تعذّر ${what}. أعد المحاولة، وإن تكرر فأبلغ المالك بالنص: ${code || String(e)}`;
}

type Keyed<T> = { key: string; group: string | null; value: Loadable<T> };
const LOADING = { status: "loading" } as const;

/**
 * نتيجة طلب مرتبطة بمفتاحه: تغيّر المفتاح يعني «جارٍ التحميل» فوراً دون setState داخل الأثر،
 * ونتيجة طلب قديم لا تُعرض لمفتاح أحدث. `key = null` يعني لا طلب.
 * `group`: إن بقيت المجموعة نفسها (مثلاً الفترة نفسها والتغيّر تحديث تلقائي فقط) تبقى الأرقام السابقة
 * ظاهرة حتى تصل الجديدة، فلا تومض الصفحة؛ وتغيّر المجموعة (فترة أخرى) يُظهر «جارٍ التحميل» كي لا تُنسب
 * أرقام فترة إلى أخرى.
 */
export function useKeyedLoad<T>(
  key: string | null,
  load: () => Promise<T>,
  what: string,
  group: string | null = null,
): Loadable<T> & { stale?: boolean } {
  const [st, setSt] = useState<Keyed<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    load()
      .then((data) => live && setSt({ key, group, value: { status: "ready", data } }))
      .catch(
        (e: unknown) =>
          live && setSt({ key, group, value: { status: "error", message: readError(e, what) } }),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- المفتاح يلخّص مدخلات الطلب
  }, [key]);
  if (st && st.key === key) return st.value;
  if (st && group !== null && st.group === group && st.value.status === "ready")
    return { ...st.value, stale: true };
  return LOADING;
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
      (data) => setSt({ key, group: null, value: { status: "ready", data } }),
      (e) => setSt({ key, group: null, value: { status: "error", message: readError(e, what) } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- كما أعلاه
  }, [key]);
  return st && st.key === key ? st.value : LOADING;
}

/** الموردون المرئيون للمستخدم (الكل للمالك والإدارة، المسنَدون لمدخل البيانات). */
export function useVisibleSuppliers(profile: UserProfile, reloadKey = 0): Loadable<SupplierRef[]> {
  // تُعاد القراءة بعد أي إضافة أو تعديل أو أرشفة لمورد من هذه الصفحة
  const changed = useSyncExternalStore(subscribeSuppliers, suppliersVersion);
  return useKeyedLoad(
    `${profile.uid}|${profile.role}|${profile.assigned.join(",")}|${reloadKey}.${changed}`,
    () => listVisibleSuppliers(profile),
    "قراءة الموردين",
    // القائمة السابقة تبقى ظاهرة أثناء إعادة القراءة بعد تغيير
    `${profile.uid}|${profile.role}|${profile.assigned.join(",")}|${reloadKey}`,
  );
}

/** مهلة تجميع التغييرات: دفعة إدخال سريع (عشرات الحركات) تُعيد الحساب مرة واحدة لا مرة لكل حركة. */
export const AUTO_REFRESH_DELAY_MS = 1200;

/**
 * الأرصدة التلقائية (قرار المستخدم 2026-10-11): رقم إصدار يزيد بعد كل تغيّر في الحركات،
 * يُضاف إلى مفتاح الطلب فتُعاد التجميعات وحدها. `scope`: "all" لكل الحركات، أو معرّفات الموردين؛ null = لا مراقبة.
 */
export function useLedgerVersion(scope: "all" | string[] | null): { version: number; error: string | null } {
  const scopeKey = scope === null ? null : scope === "all" ? "all" : `ids:${scope.join(",")}`;
  const [state, setState] = useState<{ key: string | null; version: number; error: string | null }>({
    key: null,
    version: 0,
    error: null,
  });
  useEffect(() => {
    if (scopeKey === null) return;
    let first: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = watchLedgerChanges(
      scopeKey === "all" ? { all: true } : { supplierIds: scopeKey.slice(4).split(",").filter(Boolean) },
      (v) => {
        if (first === null) {
          first = v;
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            setState((s) => ({
              key: scopeKey,
              version: (s.key === scopeKey ? s.version : 0) + 1,
              error: null,
            })),
          AUTO_REFRESH_DELAY_MS,
        );
      },
      (e) => setState({ key: scopeKey, version: 0, error: readError(e, "متابعة التحديثات التلقائية") }),
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [scopeKey]);
  return state.key === scopeKey
    ? { version: state.version, error: state.error }
    : { version: 0, error: null };
}
