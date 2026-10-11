import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Mark } from "../shared/ui/Logo";
import { IdleGuard } from "../features/auth/session/IdleGuard";
import { useProfile, useSession } from "../features/auth/session/SessionProvider";
import { isManager, DEFAULT_ROLE_NAMES, type RoleNames } from "../features/users/core/users";
import { watchRoleNames } from "../features/users/data/settingsRepo";
import { RoleNamesContext } from "../features/users/ui/roleNames";
import { TempLockBar } from "../features/ledger/ui/TempLockBar";
import { Icon } from "../shared/ui/Icon";
import { BottomNav, type BottomItem } from "./BottomNav";
import { SearchPalette } from "../features/ledger/ui/SearchPalette";
import { clearSearchCache } from "../features/ledger/data/searchRepo";
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

  // core: الأقسام الخمسة في التنقل السفلي على الجوال، فتُخفى من الألسنة العلوية هناك
  const tabs = [
    { to: "/", label: "الأرصدة", end: true, core: true },
    { to: "/statement", label: "كشف الحساب", end: false, core: true },
    { to: "/invoices", label: "الفواتير", end: false, core: true },
    // فهرس القيود (DECISIONS 2026-10-11): بجانب الفواتير، وعلى الجوال في الألسنة العلوية
    { to: "/journals", label: "القيود", end: false, core: false },
    { to: "/add", label: "إضافة حركة", end: false, core: true },
  ];
  const bottom: BottomItem[] = [
    { to: "/", label: "الأرصدة", end: true, icon: "balances" },
    { to: "/statement", label: "الكشف", end: false, icon: "statement" },
    { to: "/invoices", label: "الفواتير", end: false, icon: "invoices" },
    { to: "/add", label: "إضافة", end: false, icon: "add" },
  ];
  if (isManager(profile.role)) {
    bottom.push({ to: "/review", label: "المراجعة", end: false, icon: "review" });
    tabs.push(
      { to: "/review", label: "المراجعة", end: false, core: true },
      ...(profile.role === "owner" ? [{ to: "/lock", label: "قفل الفترات", end: false, core: false }] : []),
      { to: "/users", label: "المستخدمون", end: false, core: false },
      { to: "/assign", label: "الإسناد", end: false, core: false },
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
            <NavLink key={t.to} to={t.to} end={t.end} className={t.core ? s.core : undefined}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className={s.tools}>
          <SearchPalette profile={profile} />
          {/* الجوال واللوحي: التطبيق من الشاشة الرئيسية بلا زر تحديث للمتصفح (طلب المستخدم 2026-10-11) */}
          <button
            type="button"
            className={s.reload}
            aria-label="إعادة تحميل الصفحة"
            title="إعادة تحميل الصفحة"
            onClick={() => window.location.reload()}
          >
            <Icon name="reload" />
          </button>
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
              clearSearchCache();
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
      <BottomNav items={bottom} />
      <IdleGuard canReadSettings />
    </RoleNamesContext.Provider>
  );
}
