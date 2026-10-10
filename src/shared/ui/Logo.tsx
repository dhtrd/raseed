/** علامة التوازن بلوحة «نخلة وتمر» (CHOSEN §5). `onDark` للوح الأخضر في شاشة الدخول. */
export function Mark(p: { onDark?: boolean; className?: string }) {
  return (
    <svg className={p.className} viewBox="0 0 120 120" aria-hidden="true">
      <rect
        x="30"
        y="36"
        width="76"
        height="16"
        rx="8"
        fill={p.onDark ? "var(--brand-on)" : "var(--mark-ink)"}
      />
      <rect
        x="14"
        y="68"
        width="76"
        height="16"
        rx="8"
        fill={p.onDark ? "var(--brand-acc)" : "var(--mark-acc)"}
      />
    </svg>
  );
}
