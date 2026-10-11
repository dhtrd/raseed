import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "../shared/ui/Button";
import { Mark } from "../shared/ui/Logo";
import s from "./Screens.module.css";

export function LoadingScreen() {
  return (
    <main className={s.center} aria-busy="true">
      <Mark className={s.mark} />
      <p className={s.body} role="status">
        جارٍ فتح حسابك…
      </p>
    </main>
  );
}

/** شاشة خطأ واضحة بدل صفحة بيضاء (لا فشل صامت). */
export function ErrorScreen(p: { title: string; body: string; action?: { label: string; run: () => void } }) {
  return (
    <main className={s.center}>
      <Mark className={s.mark} />
      <h1 className={s.title}>{p.title}</h1>
      <p className={s.body} role="alert">
        {p.body}
      </p>
      {p.action ? (
        <Button variant="primary" onClick={p.action.run}>
          {p.action.label}
        </Button>
      ) : null}
    </main>
  );
}

export function RouteError() {
  const e = useRouteError();
  console.error(e);
  const body = isRouteErrorResponse(e)
    ? `${e.status} ${e.statusText}`
    : e instanceof Error
      ? e.message
      : "خطأ غير متوقع.";
  return (
    <ErrorScreen
      title="حدث خطأ غير متوقع"
      body={`${body} — أعد تحميل الصفحة، وإن تكرر فأبلغ المالك بالنص.`}
      action={{ label: "إعادة التحميل", run: () => window.location.reload() }}
    />
  );
}
