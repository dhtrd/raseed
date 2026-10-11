import { NavLink } from "react-router";
import s from "./BottomNav.module.css";

/** أيقونات النموذج المعتمد (rased-mockups/direction-1) */
const ICON = {
  balances: "M4 4h16v16H4zM4 9h16M4 14h16M10 4v16",
  statement: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  add: "M12 5v14M5 12h14",
  review: "M6 21V4h11l-2.5 4L17 12H6",
} as const;

export interface BottomItem {
  to: string;
  label: string;
  end: boolean;
  icon: keyof typeof ICON;
}

/**
 * التنقل السفلي على الجوال (CHOSEN §التنقل السفلي، النموذج المعتمد direction-1): خانات متساوية ارتفاعها 60px،
 * أيقونة وتسمية 13px، والنشط كحلي عريض بشريط علوي 3px. مدخل البيانات بلا «المراجعة» فتصير أربعاً.
 */
export function BottomNav({ items }: { items: BottomItem[] }) {
  return (
    <nav
      className={s.nav}
      aria-label="التنقل الرئيسي"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={s.item}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={s.ic}>
            <path d={ICON[t.icon]} />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
