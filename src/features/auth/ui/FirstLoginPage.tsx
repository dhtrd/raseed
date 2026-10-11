import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { PasswordField } from "../../../shared/fields";
import { isStrongPassword } from "../../../shared/fields/core/password";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { authErrorMessage } from "../core/authErrors";
import { replaceTemporaryPassword } from "../data/authService";
import { useSession } from "../session/SessionProvider";
import { AuthFrame } from "./LoginPage";
import s from "./LoginPage.module.css";

const POLICY = "12 حرفاً على الأقل تجمع حروفاً لاتينية كبيرة وصغيرة وأرقاماً ورموزاً.";

/** أول دخول بكلمة مؤقتة: تغييرها إلزامي قبل أي شاشة (DECISIONS 2026-10-10). */
export function FirstLoginPage() {
  const { state, endSession } = useSession();
  const navigate = useNavigate();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [errA, setErrA] = useState<string | null>(null);
  const [errB, setErrB] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status !== "signedIn") return <Navigate to="/login" replace />;
  const profile = state.profile;
  if (!profile.mustChangePassword && !busy) return <Navigate to="/" replace />;
  const context = [profile.login, profile.displayName, profile.login.split("@")[0] ?? ""];

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
      await replaceTemporaryPassword(a);
      navigate("/", { replace: true });
    } catch (x) {
      console.error("تعذّر تغيير الكلمة المؤقتة", x);
      setFailure(authErrorMessage(x));
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title={`مرحباً ${profile.displayName}`}
      sub="هذا أول دخول لك. اختر كلمة مرور جديدة بدل المؤقتة قبل المتابعة."
    >
      <form className={s.fields} noValidate onSubmit={submit}>
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
          حفظ والمتابعة
        </Button>
        <button type="button" className={s.link} onClick={() => void endSession()}>
          خروج
        </button>
      </form>
    </AuthFrame>
  );
}
