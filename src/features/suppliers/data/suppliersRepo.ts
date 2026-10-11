import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";

export interface SupplierRow {
  id: string;
  name: string;
  archived: boolean;
}

/** قائمة الموردين (المالك والإدارة يرونهم كلهم). */
export function watchSuppliers(onData: (s: SupplierRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    collection(db, "suppliers"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              name: typeof x.name === "string" ? x.name : d.id,
              archived: x.status === "archived",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "ar")),
      ),
    onError,
  );
}
