import s from "./Home.module.css";

export function Logo() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="30" y="36" width="76" height="16" rx="8" fill="var(--mark-ink)" />
      <rect x="14" y="68" width="76" height="16" rx="8" fill="var(--mark-acc)" />
    </svg>
  );
}

/** صفحة مؤقتة حتى المرحلة 2 (الدخول). */
export function Home() {
  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.brand}>
          <Logo />
          <h1 className={s.name}>رصيد</h1>
        </div>
        <p className={s.note}>نظام حسابات الموردين. قيد البناء: المرحلة 1 (الأساس).</p>
      </div>
    </main>
  );
}
