/**
 * أيقونات التنقل (خطية، سماكة 1.8، مربع 24): من النموذج المعتمد direction-1 ونموذج القائمة الجانبية
 * proposals/2026-10-11-sidebar.html. مصدر واحد للقائمة الجانبية والتنقل السفلي.
 */
export const NAV_ICON = {
  balances: "M4 4h16v16H4zM4 9h16M4 14h16M10 4v16",
  statement: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  journals: "M4 8h13l-3-3M20 16H7l3 3",
  add: "M12 5v14M5 12h14",
  review: "M6 21V4h11l-2.5 4L17 12H6",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  audit: "M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6",
  assign: "M7 7h4v4H7zM13 13h4v4h-4zM11 9h3a2 2 0 0 1 2 2v2",
  menu: "M4 7h16M4 12h16M4 17h16",
  fold: "M15 6l-6 6 6 6",
} as const;

export type NavIconName = keyof typeof NAV_ICON;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path d={NAV_ICON[name]} />
    </svg>
  );
}
