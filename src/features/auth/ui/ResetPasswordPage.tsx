import { useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { PasswordField } from "../../../shared/fields";
import { isStrongPassword } from "../../../shared/fields/core/password";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { parseActionLink } from "../core/actionLink";
import { authErrorMessage, isDeadLink } from "../core/authErrors";
import { checkResetLink, completeReset } from "../data/authService";
import { AuthFrame, ForgotForm } from "./LoginPage";
import s from "./LoginPage.module.css";

const POLICY = "12 حرفاً على الأقل تجمع حروفاً لاتينية كبيرة وصغيرة وأرقاماً ورموزاً.";

type Step =
  { at: "confirm" } | { at: "form"; email: string } | { at: "dead" } | { at: "changed"; message: string };

/**
 * إعادة تعيين كلمة المرور داخل «رصيد» (الخيار ب «تأكيد الحساب أولاً» + دخول تلقائي، DECISIONS 2026-10-12).
 * فتح الصفحة لا يتصل بـ Firebase: «متابعة» تتحقق من الرابط وتعرض البريد، ثم الكلمة الجديدة، ثم الدخول تلقائياً.
 */
export function ResetPasswordPage() {
  const { search } = useLocation();
  const link = useMemo(() => parseActionLink(search), [search]);
  const navigate = useNavigate();
  const toLogin = () => navigate("/login", { replace: true });

  if (link.kind !== "reset")
    return (
      <AuthFrame
        title="رابط غير صالح"
        sub={
          link.kind === "unsupported"
            ? "هذا النوع من الروابط لا يستعمله «رصيد»."
            : "الرابط ناقص. افتحه من الرسالة كما هو، أو اطلب رابطاً جديداً."
        }
      >
        <ForgotForm onBack={toLogin} />
      </AuthFrame>
    );
  return <ResetFlow code={link.code} onLogin={toLogin} onDone={() => navigate("/", { replace: true })} />;
}

function ResetFlow(p: { code: string; onLogin: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>({ at: "confirm" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [errA, setErrA] = useState<string | null>(null);
  const [errB, setErrB] = useState<string | null>(null);

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      setStep({ at: "form", email: await checkResetLink(p.code) });
    } catch (x) {
      if (isDeadLink(x)) setStep({ at: "dead" });
      else {
        console.error("تعذّر التحقق من رابط تعيين كلمة المرور", (x as { code?: string }).code);
        setFailure(authErrorMessage(x));
      }
    } finally {
      setBusy(false);
    }
  };

  if (step.at === "confirm")
    return (
      <AuthFrame
        title="إعادة تعيين كلمة المرور"
        sub="وصلت هنا من رابط في بريدك. اضغط «متابعة» للتحقق من الرابط."
      >
        <div className={s.fields}>
          {failure ? <Banner tone="err">{failure}</Banner> : null}
          <Button variant="primary" wide busy={busy} onClick={() => void verify()}>
            متابعة
          </Button>
          <p className={s.note}>لن يتغيّر شيء قبل أن تكتب الكلمة الجديدة وتحفظها.</p>
        </div>
      </AuthFrame>
    );

  if (step.at === "dead")
    return (
      <AuthFrame
        title="رابط غير صالح"
        sub="انتهى هذا الرابط أو استُعمل. الرابط صالح ساعة ولمرة واحدة، وأحدث رابط فقط يعمل. اطلب رابطاً جديداً:"
      >
        <ForgotForm onBack={p.onLogin} />
      </AuthFrame>
    );

  if (step.at === "changed")
    return (
      <AuthFrame title="تغيّرت كلمة المرور" sub="الكلمة الجديدة محفوظة، لكن الدخول التلقائي لم يكتمل.">
        <div className={s.fields}>
          <Banner tone="err">{step.message}</Banner>
          <Button variant="primary" wide onClick={p.onLogin}>
            الدخول بالكلمة الجديدة
          </Button>
        </div>
      </AuthFrame>
    );

  const email = step.email;
  const context = [email, email.split("@")[0] ?? ""];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const strong = isStrongPassword(a, context);
    setErrA(strong ? null : `كلمة المرور ضعيفة. ${POLICY}`);
    setErrB(a && b !== a ? "الكلمتان غير متطابقتين." : null);
    if (!strong || b !== a) return;
    setBusy(true);
    setFailure(null);
    try {
      await completeReset(p.code, email, a);
      p.onDone();
    } catch (x) {
      setBusy(false);
      const after = (x as { stage?: string; cause?: unknown }).stage === "afterReset";
      const cause = after ? (x as { cause?: unknown }).cause : x;
      console.error("تعذّر تعيين كلمة المرور", (cause as { code?: string } | null)?.code ?? cause);
      if (after) setStep({ at: "changed", message: authErrorMessage(cause) });
      else if (isDeadLink(x)) setStep({ at: "dead" });
      else setFailure(authErrorMessage(x));
    }
  };

  return (
    <AuthFrame title="كلمة مرور جديدة" sub="اختر كلمة مرور جديدة، ثم تدخل مباشرة.">
      <form className={s.fields} noValidate onSubmit={submit}>
        <p className={s.account}>
          <span>الحساب:</span> <b dir="ltr">{email}</b>
        </p>
        {failure ? <Banner tone="err">{failure}</Banner> : null}
        <PasswordField
          mode="set"
          label="كلمة المرور الجديدة"
          value={a}
          context={context}
          onChange={(v) => (setA(v), setErrA(null))}
          error={errA}
          hint={POLICY}
        />
        <PasswordField
          mode="set"
          label="أعد كتابتها"
          value={b}
          onChange={(v) => (setB(v), setErrB(null))}
          error={errB}
        />
        <Button type="submit" variant="primary" wide busy={busy}>
          حفظ والدخول
        </Button>
        <button type="button" className={s.link} onClick={p.onLogin}>
          العودة إلى الدخول
        </button>
      </form>
    </AuthFrame>
  );
}
