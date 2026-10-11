import { useState } from "react";
import { Link } from "react-router";
import { Segment } from "../../../shared/fields";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { Switch } from "../../../shared/ui/Switch";
import { useProfile } from "../../auth/session/SessionProvider";
import { sendResetLinkTo } from "../../auth/data/authService";
import { authErrorMessage } from "../../auth/core/authErrors";
import { identifierToEmail } from "../../../shared/fields/core/password";
import { canChangeRoleOrStatus, canEditUser, isEmailLogin, type Role, type UserProfile } from "../core/users";
import { updateUser } from "../data/usersRepo";
import { useRoleNames } from "./roleNames";
import { StateStamp } from "./StateStamp";
import { errorText, formatDate } from "./useUsersData";
import s from "./UserPane.module.css";

type Ask = null | "deactivate" | "reset" | "resetName";

/** لوحة المستخدم: الدور، والحالة، والإسناد، وإعادة كلمة المرور. كل تغيير يُحفظ فوراً بسجل تدقيق. */
export function UserPane({ target }: { target: UserProfile }) {
  const viewer = useProfile();
  const names = useRoleNames();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask>(null);

  const editable = canEditUser(viewer, target);
  const changeable = canChangeRoleOrStatus(viewer, target);
  const self = viewer.uid === target.uid;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      console.error(e);
      setMsg({ tone: "err", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.pane}>
      <h2 className={s.name}>
        {target.displayName}
        {!editable && target.role === "owner" ? <span className={s.lock}>محمي</span> : null}
      </h2>
      <dl className={s.kv}>
        <dt>الدخول</dt>
        <dd className="num">{target.login}</dd>
        <dt>الحالة</dt>
        <dd>
          <StateStamp u={target} />
        </dd>
        <dt>آخر تعديل</dt>
        <dd className="num">{formatDate(target.updatedAt)}</dd>
      </dl>

      {!editable ? (
        <Banner tone="info" title="حساب المالك">
          لا تستطيع الإدارة تعديله أو إيقافه. القواعد تفرض ذلك من الخادم.
        </Banner>
      ) : (
        <>
          <hr className={s.sep} />
          {changeable ? (
            <Segment<Exclude<Role, "owner">>
              label="الدور"
              value={target.role === "admin" ? "admin" : "entry"}
              options={[
                { value: "admin", label: names.admin },
                { value: "entry", label: names.entry },
              ]}
              disabled={busy}
              onChange={(role) => {
                if (role !== target.role)
                  void run(() => updateUser(target, { role }, viewer.uid), "تغيّر الدور وسُجّل في التدقيق.");
              }}
            />
          ) : (
            <div className={s.fixed}>
              <span className={s.label}>الدور</span>
              <span>{names[target.role]}</span>
              <small>
                {target.role === "owner" ? "دور المالك ثابت ولا يُمنح من الواجهة." : "لا تغيّر دورك بنفسك."}
              </small>
            </div>
          )}
          <Switch
            checked={target.active}
            disabled={!changeable || busy}
            onChange={(on) =>
              on
                ? void run(
                    () => updateUser(target, { active: true }, viewer.uid),
                    "فُعّل الحساب وسُجّل في التدقيق.",
                  )
                : setAsk("deactivate")
            }
          >
            {target.active ? "الحساب نشط" : "الحساب موقوف"}
            {self ? " (لا توقف حسابك بنفسك)" : ""}
          </Switch>
          {target.role === "entry" ? (
            <div className={s.row}>
              <span>
                الموردون المسندون: <span className="num">{target.assigned.length}</span>
              </span>
              <Link className={s.link} to={`/assign/${target.uid}`}>
                تعديل الإسناد
              </Link>
            </div>
          ) : null}
          {!self ? (
            <>
              <hr className={s.sep} />
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setAsk(isEmailLogin(target.login) ? "reset" : "resetName")}
              >
                {isEmailLogin(target.login) ? "إرسال رابط تعيين كلمة المرور" : "كلمة مرور مؤقتة جديدة"}
              </Button>
            </>
          ) : null}
        </>
      )}
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}

      <Dialog
        isOpen={ask === "deactivate"}
        tone="warn"
        title={`إيقاف حساب ${target.displayName}؟`}
        onDismiss={() => setAsk(null)}
      >
        <p className={d.sub}>لن يستطيع الدخول، وتبقى حركاته وسجله كما هي. يمكن تفعيله لاحقاً.</p>
        <div className={d.actions}>
          <Button
            variant="danger"
            onClick={() => {
              setAsk(null);
              void run(
                () => updateUser(target, { active: false }, viewer.uid),
                "أُوقف الحساب وسُجّل في التدقيق.",
              );
            }}
          >
            إيقاف
          </Button>
          <Button variant="ghost" onClick={() => setAsk(null)}>
            إلغاء
          </Button>
        </div>
      </Dialog>

      <Dialog isOpen={ask === "reset"} title="إرسال رابط تعيين كلمة المرور؟" onDismiss={() => setAsk(null)}>
        <p className={d.sub}>
          يرسل Firebase رسالة إلى <span className="num">{target.login}</span> برابط يختار منه كلمة جديدة.
        </p>
        <div className={d.actions}>
          <Button
            variant="primary"
            onClick={() => {
              setAsk(null);
              const e = identifierToEmail(target.login);
              if (!e.ok) return setMsg({ tone: "err", text: e.error });
              setBusy(true);
              sendResetLinkTo(e.email)
                .then(() => setMsg({ tone: "ok", text: "أُرسل الرابط إلى بريده." }))
                .catch((x: unknown) => setMsg({ tone: "err", text: authErrorMessage(x) }))
                .finally(() => setBusy(false));
            }}
          >
            إرسال
          </Button>
          <Button variant="ghost" onClick={() => setAsk(null)}>
            إلغاء
          </Button>
        </div>
      </Dialog>

      <Dialog
        isOpen={ask === "resetName"}
        title="كلمة مرور مؤقتة لصاحب اسم مستخدم"
        onDismiss={() => setAsk(null)}
      >
        {viewer.role === "owner" ? (
          <p className={d.sub}>
            من جهازك شغّل <span className="num">npm run admin:reset-password</span> واكتب{" "}
            <span className="num">{target.login}</span>. تظهر الكلمة المؤقتة مرة واحدة، ويُلزم بتغييرها عند
            أول دخول. الخطوات في <span className="num">docs/admin-scripts.md</span>.
          </p>
        ) : (
          <p className={d.sub}>
            هذه العملية للمالك وحده (خطة Firebase المجانية لا تسمح بها من الواجهة). اطلبها منه لـ{" "}
            <span className="num">{target.login}</span>.
          </p>
        )}
        <div className={d.actions}>
          <Button variant="primary" onClick={() => setAsk(null)}>
            فهمت
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
