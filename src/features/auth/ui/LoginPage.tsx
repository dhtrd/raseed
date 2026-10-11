import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router";
import { IdentifierField, PasswordField } from "../../../shared/fields";
import { normalizeEmail } from "../../../shared/fields/core/password";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Mark } from "../../../shared/ui/Logo";
import { authErrorMessage } from "../core/authErrors";
import { requestPasswordReset, signIn } from "../data/authService";
import { NOTICE_TEXT, useSession } from "../session/SessionProvider";
import { Clock } from "./Clock";
import s from "./LoginPage.module.css";

/** الإطار المقسوم (الخيار «ب» المعتمد): لوح أخضر بالشعار والساعة، والنموذج بجانبه. */
export function AuthFrame(p: { title: string; sub: string; children: ReactNode }) {
  return (
    <main className={s.page}>
      <section className={s.side} aria-label="رصيد">
        <div className={s.brand}>
          <Mark onDark className={s.mark} />
          <h1 className={s.word}>رصيد</h1>
          <p className={s.tag}>دفتر حسابات الموردين: الكشوف، والفواتير، وحالة Odoo في مكان واحد.</p>
        </div>
        <Clock />
      </section>
      <section className={s.main}>
        <div className={s.form}>
          <h2 className={s.title}>{p.title}</h2>
          <p className={s.sub}>{p.sub}</p>
          {p.children}
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { state } = useSession();
  const [view, setView] = useState<"signin" | "forgot">("signin");
  if (state.status === "signedIn") return <Navigate to="/" replace />;
  const notice = state.status === "signedOut" ? state.notice : null;
  return view === "signin" ? (
    <AuthFrame title="تسجيل الدخول" sub="بحسابك الذي أنشأته لك الإدارة.">
      <SignInForm notice={notice ? NOTICE_TEXT[notice] : null} onForgot={() => setView("forgot")} />
    </AuthFrame>
  ) : (
    <AuthFrame title="استعادة كلمة المرور" sub="اكتب بريدك الإلكتروني.">
      <ForgotForm onBack={() => setView("signin")} />
    </AuthFrame>
  );
}

function SignInForm(p: { notice: { title: string; body: string } | null; onForgot: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [idErr, setIdErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkId = () => {
    const r = normalizeEmail(id);
    setIdErr(r.ok ? null : r.error);
    return r.ok;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const okId = checkId();
    setPwErr(pw ? null : "أدخل كلمة المرور.");
    if (!okId || !pw) return;
    setBusy(true);
    setFailure(null);
    try {
      await signIn(id, pw);
    } catch (err) {
      setFailure(authErrorMessage(err));
    } finally {
      // النجاح ينقل للرئيسية؛ وإن رُفض الحساب بعده (موقوف أو غير مكتمل) يبقى الزر صالحاً لمحاولة أخرى
      setBusy(false);
    }
  };
  return (
    <form className={s.fields} noValidate onSubmit={submit}>
      {p.notice && !failure ? (
        <Banner tone="info" title={p.notice.title}>
          {p.notice.body}
        </Banner>
      ) : null}
      {failure ? (
        <Banner tone="err" title="تعذّر الدخول">
          {failure}
        </Banner>
      ) : null}
      <IdentifierField
        label="البريد الإلكتروني"
        value={id}
        onChange={(v) => {
          setId(v);
          if (idErr) setIdErr(normalizeEmail(v).ok ? null : idErr);
        }}
        onBlur={() => id && checkId()}
        error={idErr}
      />
      <PasswordField
        mode="signin"
        value={pw}
        onChange={(v) => (setPw(v), v && setPwErr(null))}
        error={pwErr}
      />
      <Button type="submit" variant="primary" wide busy={busy}>
        {busy ? "جارٍ الدخول…" : "دخول"}
      </Button>
      <div className={s.foot}>
        <button type="button" className={s.link} onClick={p.onForgot}>
          نسيت كلمة المرور؟
        </button>
        <span className={s.note}>تنتهي الجلسة بإغلاق المتصفح أو بعد مدة بلا نشاط.</span>
      </div>
    </form>
  );
}

function ForgotForm(p: { onBack: () => void }) {
  const [id, setId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<"emailSent" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = normalizeEmail(id);
    setErr(r.ok ? null : r.error);
    if (!r.ok || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      setResult(await requestPasswordReset(id));
    } catch (x) {
      setFailure(authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={s.fields} noValidate onSubmit={submit}>
      <IdentifierField
        label="البريد الإلكتروني"
        value={id}
        onChange={(v) => (setId(v), setResult(null))}
        error={err}
      />
      {failure ? <Banner tone="err">{failure}</Banner> : null}
      {result === "emailSent" ? (
        <Banner tone="info" title="تحقق من بريدك">
          إن كان البريد مسجلاً لدينا فستصلك رسالة برابط لتعيين كلمة مرور جديدة.
        </Banner>
      ) : null}
      <Button type="submit" variant="primary" wide busy={busy}>
        متابعة
      </Button>
      <button type="button" className={s.link} onClick={p.onBack}>
        رجوع للدخول
      </button>
    </form>
  );
}
