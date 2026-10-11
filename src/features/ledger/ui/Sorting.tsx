import type { ReactNode } from "react";
import { ariaSort, nextSort, type SortDir, type SortState } from "../core/sort";
import s from "./Ledger.module.css";

function Arrow(p: { dir: SortDir | null }) {
  return (
    <svg
      viewBox="0 0 12 16"
      aria-hidden="true"
      focusable="false"
      className={s.sortIc}
      data-dir={p.dir ?? "none"}
    >
      <path d="M6 1.5 2 6h8z" className={s.up} />
      <path d="M6 14.5 2 10h8z" className={s.down} />
    </svg>
  );
}

/** رأس عمود قابل للترتيب (حاسوب ولوحي): زر داخل الرأس، وaria-sort يعلن الاتجاه. */
export function SortTh<K extends string>(p: {
  k: K;
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
  firstDir?: SortDir;
  className?: string;
  children: ReactNode;
}) {
  const active = p.sort.key === p.k;
  return (
    <th scope="col" className={p.className} aria-sort={ariaSort(p.sort, p.k)}>
      <button
        type="button"
        className={`${s.sortBtn} ${active ? s.sortOn : ""}`}
        onClick={() => p.onSort(nextSort(p.sort, p.k, p.firstDir))}
      >
        {p.children}
        <Arrow dir={active ? p.sort.dir : null} />
      </button>
    </th>
  );
}

/** «ترتيب حسب» على الجوال (SPEC): شرائح قابلة للسحب؛ النقر على النشطة يعكس الاتجاه. */
export function MobileSort<K extends string>(p: {
  options: { key: K; label: string; firstDir?: SortDir }[];
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
}) {
  return (
    <div className={s.mSort} role="group" aria-label="ترتيب حسب">
      <span className={s.mSortLbl} aria-hidden="true">
        ترتيب حسب
      </span>
      {p.options.map((o) => {
        const active = p.sort.key === o.key;
        const dirTxt = active ? (p.sort.dir === "asc" ? "تصاعدي" : "تنازلي") : "";
        return (
          <button
            key={o.key}
            type="button"
            className={`${s.chip} ${active ? s.chipOn : ""}`}
            aria-pressed={active}
            aria-label={active ? `${o.label}، ${dirTxt}` : o.label}
            onClick={() => p.onSort(nextSort(p.sort, o.key, o.firstDir))}
          >
            {o.label}
            <Arrow dir={active ? p.sort.dir : null} />
          </button>
        );
      })}
    </div>
  );
}
