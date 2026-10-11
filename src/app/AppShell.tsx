import { useEffect, useState } from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";
import { NavLink, Outlet, useLocation } from "react-router";
import { Mark } from "../shared/ui/Logo";
import { IdleGuard } from "../features/auth/session/IdleGuard";
import { useProfile, useSession } from "../features/auth/session/SessionProvider";
import { isManager, DEFAULT_ROLE_NAMES, type RoleNames } from "../features/users/core/users";
import { watchRoleNames } from "../features/users/data/settingsRepo";
import { RoleNamesContext } from "../features/users/ui/roleNames";
import { TempLockBar } from "../features/ledger/ui/TempLockBar";
import { Icon } from "../shared/ui/Icon";
import { useMediaQuery } from "../shared/ui/useMediaQuery";
import { AlertCenter } from "../features/alerts/ui/AlertCenter";
import { ToastProvider } from "../shared/ui/Toast";
import { BottomNav, type BottomItem } from "./BottomNav";
import { NavIcon } from "./navIcons";
import { SideNav, type NavGroup } from "./SideNav";
import { SearchPalette } from "../features/ledger/ui/SearchPalette";
import { clearSearchCache } from "../features/ledger/data/searchRepo";
import s from "./AppShell.module.css";

const RAIL_KEY = "raseed.nav";

function readRail(): "rail" | "wide" | null {
  try {
    const v = window.localStorage.getItem(RAIL_KEY);
    return v === "rail" || v === "wide" ? v : null;
  } catch {
    return null; // تخزين محجوب: الافتراضي بحسب العرض
  }
}

/**
 * إطار الواجهة (DECISIONS 2026-10-11، القائمة الجانبية الخيار أ): قائمة جانبية في اليمين بأيقونات
 * تُطوى (افتراضياً مطوية على اللوحي)، وشريط أدوات أعلى المحتوى. على الجوال: درج ☰ من اليمين
 * لكل الأقسام، والتنقل السفلي للخمسة اليومية (قرار المستخدم: الاثنان).
 */
export function AppShell() {
  const profile = useProfile();
  const { endSession } = useSession();
  const [names, setNames] = useState<RoleNames>(DEFAULT_ROLE_NAMES);
  const [busy, setBusy] = useState(false);
  const phone = useMediaQuery("(width <= 600px)");
  const tablet = useMediaQuery("(width <= 1279px)");
  const [railPref, setRailPref] = useState(readRail);
  const rail = railPref ? railPref === "rail" : tablet;
  const [drawer, setDrawer] = useState(false);
  // الدرج يُغلق عند الانتقال بأي طريقة (رابط، بحث، رجوع)
  const { pathname } = useLocation();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (drawer) setDrawer(false);
  }

  useEffect(
    () =>
      watchRoleNames(setNames, (e) => {
        console.error("تعذّر قراءة مسميات الأدوار؛ تُعرض الافتراضية", e);
      }),
    [],
  );

  const toggleRail = () => {
    const next = rail ? "wide" : "rail";
    setRailPref(next);
    try {
      window.localStorage.setItem(RAIL_KEY, next);
    } catch {
      // تفضيل عرض فقط
    }
  };

  const manager = isManager(profile.role);
  const groups: NavGroup[] = [
    {
      title: "الدفتر",
      items: [
        { to: "/", label: "الأرصدة", end: true, icon: "balances" },
        { to: "/statement", label: "كشف الحساب", end: false, icon: "statement" },
        { to: "/invoices", label: "الفواتير", end: false, icon: "invoices" },
        { to: "/journals", label: "القيود", end: false, icon: "journals" },
        { to: "/add", label: "إضافة حركة", end: false, icon: "add" },
        ...(manager ? [{ to: "/review", label: "المراجعة", end: false, icon: "review" as const }] : []),
      ],
    },
  ];
  if (manager)
    groups.push({
      title: "الإدارة",
      items: [
        ...(profile.role === "owner"
          ? [{ to: "/lock", label: "قفل الفترات", end: false, icon: "lock" as const }]
          : []),
        { to: "/audit", label: "التدقيق", end: false, icon: "audit" },
        { to: "/users", label: "المستخدمون", end: false, icon: "users" },
        { to: "/assign", label: "الإسناد", end: false, icon: "assign" },
      ],
    });
  const bottom: BottomItem[] = [
    { to: "/", label: "الأرصدة", end: true, icon: "balances" },
    { to: "/statement", label: "الكشف", end: false, icon: "statement" },
    { to: "/invoices", label: "الفواتير", end: false, icon: "invoices" },
    { to: "/add", label: "إضافة", end: false, icon: "add" },
    ...(manager ? [{ to: "/review", label: "المراجعة", end: false, icon: "review" as const }] : []),
  ];

  return (
    <RoleNamesContext.Provider value={names}>
      <ToastProvider>
        <div className={`${s.app} ${rail ? s.isRail : ""}`}>
          {phone ? null : (
            <aside className={s.side}>
              <SideNav groups={groups} rail={rail} onToggleRail={toggleRail} />
            </aside>
          )}
          <div className={s.page}>
            <header className={s.top}>
              {phone ? (
                <>
                  <button
                    type="button"
                    className={s.tbtn}
                    aria-label="القائمة"
                    aria-expanded={drawer}
                    onClick={() => setDrawer(true)}
                  >
                    <NavIcon name="menu" className={s.ic} />
                  </button>
                  <NavLink to="/" end className={s.brand} aria-label="رصيد، الأرصدة">
                    <Mark className={s.mark} />
                    <span className={s.word}>رصيد</span>
                  </NavLink>
                </>
              ) : null}
              <div className={s.tools}>
                <SearchPalette profile={profile} />
                {manager ? <AlertCenter profile={profile} /> : null}
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
          </div>
        </div>
        {phone ? (
          <ModalOverlay className={s.scrim} isOpen={drawer} isDismissable onOpenChange={setDrawer}>
            <Modal className={s.drawer}>
              <AriaDialog className={s.drawerDlg} aria-label="القائمة">
                <button
                  type="button"
                  className={s.drawerClose}
                  aria-label="إغلاق القائمة"
                  onClick={() => setDrawer(false)}
                >
                  ×
                </button>
                <SideNav groups={groups} rail={false} onNavigate={() => setDrawer(false)} />
              </AriaDialog>
            </Modal>
          </ModalOverlay>
        ) : null}
        <BottomNav items={bottom} />
        <IdleGuard canReadSettings />
      </ToastProvider>
    </RoleNamesContext.Provider>
  );
}
