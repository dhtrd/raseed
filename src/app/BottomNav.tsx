import { NavLink } from "react-router";
import { NavIcon, type NavIconName } from "./navIcons";
import s from "./BottomNav.module.css";

export interface BottomItem {
  to: string;
  label: string;
  end: boolean;
  icon: NavIconName;
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
          <NavIcon name={t.icon} className={s.ic} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
