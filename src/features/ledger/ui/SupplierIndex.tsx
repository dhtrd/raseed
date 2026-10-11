import { useId, useState, type ReactNode } from "react";
import s from "./Ledger.module.css";

const KEY = "raseed.index";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false; // تخزين محجوب (نافذة خاصة): يبقى الفهرس مفتوحاً
  }
}

/** الفهرس الجانبي على اللوحي (CHOSEN §4): يُطوى إلى عمود «الفهرس» عمودياً، ويحفظ حالته. */
export function useIndexCollapse() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(KEY, c ? "open" : "collapsed");
      } catch {
        // تفضيل عرض فقط؛ لا يمنع الطي
      }
      return !c;
    });
  return { collapsed, toggle };
}

export function SupplierIndex(p: { collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  const bodyId = useId();
  return (
    <aside className={s.index} aria-label="فهرس الموردين">
      <div className={s.indexHead}>
        <h2 className={s.indexTitle}>الموردون</h2>
        <button
          type="button"
          className={s.collapseBtn}
          aria-controls={bodyId}
          aria-expanded={!p.collapsed}
          onClick={p.onToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={s.ic}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className={s.collapseLbl}>{p.collapsed ? "الفهرس" : "طيّ"}</span>
        </button>
      </div>
      <div className={s.indexBody} id={bodyId}>
        {p.children}
      </div>
    </aside>
  );
}
