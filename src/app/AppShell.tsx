import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Mark } from "../shared/ui/Logo";
import { IdleGuard } from "../features/auth/session/IdleGuard";
import { useProfile, useSession } from "../features/auth/session/SessionProvider";
import { isManager, DEFAULT_ROLE_NAMES, type RoleNames } from "../features/users/core/users";
import { watchRoleNames } from "../features/users/data/settingsRepo";
import { RoleNamesContext } from "../features/users/ui/roleNames";
import { TempLockBar } from "../features/ledger/ui/TempLockBar";
import s from "./AppShell.module.css";

/** الرأس وألسنة الدفتر (direction-1). بقية أقسام المرحلة 4 (الفواتير، الإضافة، المراجعة) تُضاف تباعاً. */
export function AppShell() {
  const profile = useProfile();
  const { endSession } = useSession();
  const [names, setNames] = useState<RoleNames>(DEFAULT_ROLE_NAMES);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      watchRoleNames(setNames, (e) => {
        console.error("تعذّر قراءة مسميات الأدوار؛ تُعرض الافتراضية", e);
      }),
    [],
  );

  const tabs = [
    { to: "/", label: "الأرصدة", end: true },
    { to: "/statement", label: "كشف الحساب", end: false },
    { to: "/invoices", label: "الفواتير", end: false },
    { to: "/add", label: "إضافة حركة", end: false },
  ];
  if (isManager(profile.role)) {
    tabs.push(
      { to: "/review", label: "المراجعة", end: false },
      ...(profile.role === "owner" ? [{ to: "/lock", label: "قفل الفترات", end: false }] : []),
      { to: "/users", label: "المستخدمون", end: false },
      { to: "/assign", label: "الإسناد", end: false },
    );
  }

  return (
    <RoleNamesContext.Provider value={names}>
      <header className={s.masthead}>
        <NavLink to="/" className={s.brand} aria-label="رصيد، الأرصدة">
          <Mark className={s.mark} />
          <span className={s.word}>رصيد</span>
        </NavLink>
        <nav className={s.tabs} aria-label="أقسام الدفتر">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className={s.tools}>
          <span className={s.who}>
            <b>{profile.displayName}</b>
            <span>{names[profile.role]}</span>
          </span>
          <button
            type="button"
            className={s.out}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              endSession().catch((e: unknown) => {
                console.error(e);
                setBusy(false);
              });
            }}
          >
            خروج
          </button>
        </div>
      </header>
      <TempLockBar enabled={profile.role === "owner"} />
      <div className={s.shell}>
        <Outlet />
      </div>
      <IdleGuard canReadSettings />
    </RoleNamesContext.Provider>
  );
}
