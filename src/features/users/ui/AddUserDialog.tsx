import { useState, type FormEvent } from "react";
import { IdentifierField, PasswordField, Segment, TextField } from "../../../shared/fields";
import { browserRandomInt, generatePassword, isStrongPassword } from "../../../shared/fields/core/password";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { useProfile } from "../../auth/session/SessionProvider";
import { authErrorMessage } from "../../auth/core/authErrors";
import {
  DISPLAY_NAME_MAX,
  validateDisplayName,
  validateNewLogin,
  type Role,
  type UserProfile,
} from "../core/users";
import { createUserAccount } from "../data/usersRepo";
import { useRoleNames } from "./roleNames";
import { errorText } from "./useUsersData";
import s from "./AddUserDialog.module.css";

type NewRole = Exclude<Role, "owner">;

/** إضافة مستخدم: كلمة مؤقتة تظهر مرة واحدة، ويُلزم صاحبها بتغييرها عند أول دخول. */
export function AddUserDialog(p: {
  isOpen: boolean;
  existing: UserProfile[];
  onClose: (newUid?: string) => void;
}) {
  const viewer = useProfile();
  const names = useRoleNames();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<NewRole>("entry");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<{ name?: string | null; login?: string | null; pw?: string | null }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ uid: string; login: string; pw: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setLogin("");
    setRole("entry");
    setPw("");
    setErr({});
    setFailure(null);
    setDone(null);
    setCopied(null);
  };
  const close = (uid?: string) => {
    if (busy) return;
    reset();
    p.onClose(uid);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const nameErr = validateDisplayName(name);
    const l = validateNewLogin(
      login,
      p.existing.map((u) => u.login),
    );
    const pwErr = isStrongPassword(pw, [name, login, login.split("@")[0] ?? ""])
      ? null
      : "كلمة المرور ضعيفة. استخدم «توليد كلمة قوية» أو اكتب 12 حرفاً بأنواعها الأربعة.";
    setErr({ name: nameErr, login: l.ok ? null : l.error, pw: pwErr });
    if (nameErr || !l.ok || pwErr) return;
    setBusy(true);
    setFailure(null);
    try {
      const uid = await createUserAccount(
        { displayName: name.trim(), login: l.login, email: l.email, role, tempPassword: pw },
        viewer.uid,
      );
      setDone({ uid, login: l.login, pw });
    } catch (x) {
      console.error(x);
      const code = (x as { code?: string }).code ?? "";
      setFailure(code.startsWith("auth/") ? authErrorMessage(x) : errorText(x));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => setCopied(`نُسخ ${what}.`),
      () => setCopied("تعذّر النسخ التلقائي. حدّد النص وانسخه يدوياً."),
    );
  };

  return (
    <Dialog
      isOpen={p.isOpen}
      title={done ? "أُنشئ الحساب" : "إضافة مستخدم"}
      onDismiss={busy ? undefined : () => close(done?.uid)}
    >
      {done ? (
        <>
          <p className={d.sub}>
            سلّم هذه البيانات للمستخدم يداً بيد. الكلمة لا تظهر مرة أخرى ولا تُحفظ في النظام.
          </p>
          <dl className={s.creds}>
            <dt>الدخول</dt>
            <dd className="num">{done.login}</dd>
            <dt>الكلمة المؤقتة</dt>
            <dd className="num">{done.pw}</dd>
          </dl>
          {copied ? (
            <p className={s.copied} role="status">
              {copied}
            </p>
          ) : null}
          <div className={d.actions}>
            <Button variant="secondary" onClick={() => copy(`${done.login}\n${done.pw}`, "الدخول والكلمة")}>
              نسخ
            </Button>
            <Button variant="primary" onClick={() => close(done.uid)}>
              تم
            </Button>
          </div>
        </>
      ) : (
        <form className={s.form} noValidate onSubmit={submit}>
          <TextField
            label="الاسم الظاهر"
            required
            value={name}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(v) => (setName(v), setErr((x) => ({ ...x, name: null })))}
            error={err.name}
          />
          <IdentifierField
            label="البريد الإلكتروني للدخول"
            value={login}
            onChange={(v) => (setLogin(v), setErr((x) => ({ ...x, login: null })))}
            onBlur={() => {
              if (!login) return;
              const l = validateNewLogin(
                login,
                p.existing.map((u) => u.login),
              );
              setErr((x) => ({ ...x, login: l.ok ? null : l.error }));
            }}
            error={err.login}
            hint="يصله عليه رابط «نسيت كلمة المرور» عند الحاجة."
          />
          <Segment<NewRole>
            label="الدور"
            value={role}
            options={[
              { value: "entry", label: names.entry },
              { value: "admin", label: names.admin },
            ]}
            onChange={setRole}
          />
          <PasswordField
            mode="set"
            label="كلمة مرور مؤقتة"
            value={pw}
            context={[name, login]}
            onChange={(v) => (setPw(v), setErr((x) => ({ ...x, pw: null })))}
            error={err.pw}
            hint="تظهر لك مرة واحدة بعد الإنشاء لتسلّمها للمستخدم."
          />
          <button
            type="button"
            className={s.gen}
            onClick={() => {
              setPw(generatePassword(browserRandomInt));
              setErr((x) => ({ ...x, pw: null }));
            }}
          >
            توليد كلمة قوية
          </button>
          {failure ? <Banner tone="err">{failure}</Banner> : null}
          <div className={d.actions}>
            <Button type="submit" variant="primary" busy={busy}>
              {busy ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => close()}>
              إلغاء
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
