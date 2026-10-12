import { useAnyBusy } from "./busy";
import s from "./Logo.module.css";

type MarkProps = {
  onDark?: boolean;
  className?: string;
  /** «loading»: الكفّتان تتحركان باستمرار؛ «live»: عند المرور، وأثناء أي حفظ أو تحميل */
  motion?: "loading" | "live";
};

/** علامة التوازن بلوحة «نخلة وتمر» (CHOSEN §5). `onDark` للوح الأخضر في شاشة الدخول. */
export function Mark(p: MarkProps) {
  return p.motion === "live" ? (
    <LiveMark {...p} />
  ) : (
    <MarkSvg {...p} extra={p.motion === "loading" ? (s.loading ?? "") : ""} />
  );
}

function LiveMark(p: MarkProps) {
  const busy = useAnyBusy();
  return <MarkSvg {...p} extra={`${s.live ?? ""} ${busy ? (s.busy ?? "") : ""}`} />;
}

function MarkSvg(p: MarkProps & { extra: string }) {
  return (
    <svg className={`${s.mark} ${p.extra} ${p.className ?? ""}`} viewBox="0 0 120 120" aria-hidden="true">
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
