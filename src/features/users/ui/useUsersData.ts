import { useEffect, useState } from "react";
import { sortUsers, type UserProfile } from "../core/users";
import { watchUsers } from "../data/usersRepo";
import { watchSuppliers, type SupplierRow } from "../../suppliers/data/suppliersRepo";

export type Loadable<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

const msg = (what: string, e: Error & { code?: string }) => `تعذّر تحميل ${what} (${e.code ?? e.message}).`;

export function useUsers(): Loadable<UserProfile[]> {
  const [v, setV] = useState<Loadable<UserProfile[]>>({ status: "loading" });
  useEffect(
    () =>
      watchUsers(
        (list) => setV({ status: "ready", data: sortUsers(list) }),
        (e) => {
          console.error(e);
          setV({ status: "error", message: msg("المستخدمين", e) });
        },
      ),
    [],
  );
  return v;
}

export function useSuppliers(): Loadable<SupplierRow[]> {
  const [v, setV] = useState<Loadable<SupplierRow[]>>({ status: "loading" });
  useEffect(
    () =>
      watchSuppliers(
        (list) => setV({ status: "ready", data: list }),
        (e) => {
          console.error(e);
          setV({ status: "error", message: msg("الموردين", e) });
        },
      ),
    [],
  );
  return v;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const formatDate = (d: Date | null) => (d ? dateFmt.format(d) : "—");

export function errorText(e: unknown): string {
  const x = e as { code?: string; message?: string };
  if (x.code === "permission-denied")
    return "رفض الخادم العملية: لا تملك الصلاحية، أو تغيّرت البيانات. حدّث الصفحة وأعد المحاولة.";
  if (x.code === "unavailable") return "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.";
  return `تعذّر الحفظ (${x.code ?? x.message ?? "خطأ غير معروف"}). أعد المحاولة، وإن تكرر فأبلغ المالك.`;
}
