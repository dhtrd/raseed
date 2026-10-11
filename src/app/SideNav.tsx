import { NavLink } from "react-router";
import { Mark } from "../shared/ui/Logo";
import { NavIcon, type NavIconName } from "./navIcons";
import s from "./SideNav.module.css";

export interface NavItem {
  to: string;
  label: string;
  end: boolean;
  icon: NavIconName;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * القائمة الجانبية (الخيار أ المعتمد في proposals/2026-10-11-sidebar.html): في جهة البداية (اليمين)،
 * بأيقونة وتسمية لكل قسم، وتُطوى إلى أيقونات فقط. على الجوال تظهر نفسها داخل درج.
 */
export function SideNav(p: {
  groups: NavGroup[];
  /** أيقونات فقط */
  rail: boolean;
  /** زر الطي (لا يظهر في درج الجوال) */
  onToggleRail?: () => void;
  /** يُستدعى بعد اختيار قسم (لإغلاق درج الجوال) */
  onNavigate?: () => void;
}) {
  return (
    <nav className={`${s.nav} ${p.rail ? s.rail : ""}`} aria-label="أقسام الدفتر">
      <NavLink to="/" end className={s.brand} aria-label="رصيد، الأرصدة" onClick={p.onNavigate}>
        <Mark className={s.mark} motion="live" />
        <span className={s.word}>رصيد</span>
      </NavLink>
      {p.groups.map((g) => (
        <div key={g.title} className={s.group} role="group" aria-label={g.title}>
          <p className={s.title} aria-hidden="true">
            {g.title}
          </p>
          {g.items.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={s.item}
              title={p.rail ? t.label : undefined}
              onClick={p.onNavigate}
            >
              <NavIcon name={t.icon} className={s.ic} />
              <span className={s.lbl}>{t.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
      {p.onToggleRail ? (
        <button
          type="button"
          className={`${s.item} ${s.fold}`}
          aria-expanded={!p.rail}
          aria-label={p.rail ? "توسيع القائمة" : "طيّ القائمة"}
          title={p.rail ? "توسيع القائمة" : "طيّ القائمة"}
          onClick={p.onToggleRail}
        >
          <NavIcon name="fold" className={s.ic} />
          <span className={s.lbl}>طيّ القائمة</span>
        </button>
      ) : null}
    </nav>
  );
}
