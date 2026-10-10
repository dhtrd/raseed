import { useEffect, useState } from "react";
import { TextField } from "../../../shared/fields";
import { Banner } from "../../../shared/ui/Banner";
import { useProfile } from "../../auth/session/SessionProvider";
import { IDLE_DEFAULT_MINUTES, parseIdleMinutes } from "../../auth/core/sessionSettings";
import { ROLE_NAME_MAX, validateRoleName, type Role } from "../core/users";
import { saveIdleMinutes, saveRoleNames, watchIdleMinutes } from "../data/settingsRepo";
import { useRoleNames } from "./roleNames";
import { errorText } from "./useUsersData";
import s from "./SettingsStrip.module.css";

const ROLE_LABEL: Record<Role, string> = {
  owner: "دور المالك",
  admin: "دور الإدارة",
  entry: "دور مدخل البيانات",
};

/** مسميات الأدوار ومدة الخمول: يعدّلها المالك، والإدارة تراها للقراءة. تُحفظ عند الخروج من الحقل. */
export function SettingsStrip() {
  const viewer = useProfile();
  const names = useRoleNames();
  const owner = viewer.role === "owner";
  const [draft, setDraft] = useState(names);
  const [nameErr, setNameErr] = useState<Partial<Record<Role, string | null>>>({});
  const [idle, setIdle] = useState(IDLE_DEFAULT_MINUTES);
  const [idleDraft, setIdleDraft] = useState(String(IDLE_DEFAULT_MINUTES));
  const [idleErr, setIdleErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // تحديث المسودة حين تتغير المسميات في الخادم (نمط «الحالة المشتقة» بلا تأثير)
  const [seen, setSeen] = useState(names);
  if (seen !== names) {
    setSeen(names);
    setDraft(names);
  }
  useEffect(
    () =>
      watchIdleMinutes(
        (m) => {
          setIdle(m);
          setIdleDraft(String(m));
        },
        (e) => {
          console.error(e);
          setMsg({ tone: "err", text: "تعذّر قراءة مدة الخمول؛ يُعرض الافتراضي." });
        },
      ),
    [],
  );

  const saveName = async (r: Role) => {
    const e = validateRoleName(draft[r]);
    setNameErr((x) => ({ ...x, [r]: e }));
    const next = { ...names, [r]: draft[r].trim() };
    if (e || next[r] === names[r]) return;
    try {
      await saveRoleNames(next, names, viewer.uid);
      setMsg({ tone: "ok", text: `حُفظ مسمى «${next[r]}» وسُجّل في التدقيق.` });
    } catch (x) {
      console.error(x);
      setMsg({ tone: "err", text: errorText(x) });
    }
  };
  const saveIdle = async () => {
    const r = parseIdleMinutes(idleDraft);
    setIdleErr(r.ok ? null : r.error);
    if (!r.ok || r.value === idle) return;
    try {
      await saveIdleMinutes(r.value, idle, viewer.uid);
      setMsg({ tone: "ok", text: `حُفظت مدة الخمول ${r.value} دقيقة، وتسري فوراً على كل الجلسات المفتوحة.` });
    } catch (x) {
      console.error(x);
      setMsg({ tone: "err", text: errorText(x) });
    }
  };

  return (
    <section className={s.strip} aria-labelledby="settings-h">
      <h2 id="settings-h" className={s.h}>
        الإعدادات: مسميات الأدوار ومدة الخمول{" "}
        <span>
          {owner ? "(تُحفظ عند الخروج من الحقل؛ الصلاحيات لا تتغير)" : "(للعرض: يعدّلها المالك فقط)"}
        </span>
      </h2>
      <div className={s.fields}>
        {(["owner", "admin", "entry"] as Role[]).map((r) => (
          <TextField
            key={r}
            label={ROLE_LABEL[r]}
            value={draft[r]}
            maxLength={ROLE_NAME_MAX}
            readOnly={!owner}
            onChange={(v) => setDraft((x) => ({ ...x, [r]: v }))}
            onBlur={() => owner && void saveName(r)}
            onEnter={() => owner && void saveName(r)}
            error={nameErr[r]}
          />
        ))}
        <TextField
          label="مدة الخمول قبل الخروج (دقيقة)"
          value={idleDraft}
          maxLength={3}
          ltr
          inputMode="numeric"
          readOnly={!owner}
          onChange={(v) => (setIdleDraft(v), setIdleErr(null))}
          onBlur={() => owner && void saveIdle()}
          onEnter={() => owner && void saveIdle()}
          error={idleErr}
          hint="من 5 إلى 120"
        />
      </div>
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
    </section>
  );
}
