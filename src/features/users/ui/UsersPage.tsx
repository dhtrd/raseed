import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Banner } from "../../../shared/ui/Banner";
import { LoadingLedger } from "../../../shared/ui/LedgerState";
import { Button } from "../../../shared/ui/Button";
import { useProfile } from "../../auth/session/SessionProvider";
import type { UserProfile } from "../core/users";
import { AddUserDialog } from "./AddUserDialog";
import { SettingsStrip } from "./SettingsStrip";
import { StateStamp } from "./StateStamp";
import { UserPane } from "./UserPane";
import { useRoleNames } from "./roleNames";
import { formatDate, useUsers } from "./useUsersData";
import s from "./UsersPage.module.css";

/** إدارة المستخدمين (الخيار «أ» المعتمد): جدول + لوحة؛ على الجوال واللوحي العمودي صفحة المستخدم بزر رجوع. */
export function UsersPage() {
  const viewer = useProfile();
  const names = useRoleNames();
  const users = useUsers();
  const { uid } = useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  if (users.status === "loading")
    return (
      <div className={s.state}>
        <LoadingLedger label="جارٍ تحميل المستخدمين…" />
      </div>
    );
  if (users.status === "error")
    return (
      <div className={s.state}>
        <Banner tone="err">{users.message}</Banner>
      </div>
    );
  const list = users.data;
  const selected = uid ? list.find((u) => u.uid === uid) : undefined;

  return (
    <main className={`${s.page} ${uid ? s.open : ""}`}>
      <div className={s.bar}>
        <h1 className={s.h1}>
          المستخدمون <span className="num">({list.length})</span>
        </h1>
        <Button variant="primary" onClick={() => setAdding(true)}>
          إضافة مستخدم
        </Button>
      </div>
      <div className={s.grid}>
        <div className={s.listCol}>
          <div className={s.tableWrap}>
            <table className={s.ledger}>
              <thead>
                <tr>
                  <th scope="col">المستخدم</th>
                  <th scope="col">الدور</th>
                  <th scope="col">الموردون</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">آخر تعديل</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <Row key={u.uid} u={u} selected={u.uid === uid} viewer={viewer} names={names} />
                ))}
              </tbody>
            </table>
          </div>
          <SettingsStrip />
        </div>
        <aside className={s.pane} aria-label="تفاصيل المستخدم">
          <Link to="/users" className={s.back}>
            → المستخدمون
          </Link>
          {selected ? (
            <UserPane key={selected.uid} target={selected} />
          ) : uid ? (
            <Banner tone="err">هذا المستخدم غير موجود.</Banner>
          ) : (
            <p className={s.empty}>اختر مستخدماً من الجدول لعرض تفاصيله وتعديله.</p>
          )}
        </aside>
      </div>
      <AddUserDialog
        isOpen={adding}
        existing={list}
        onClose={(newUid) => {
          setAdding(false);
          if (newUid) navigate(`/users/${newUid}`);
        }}
      />
    </main>
  );
}

function Row(p: { u: UserProfile; selected: boolean; viewer: UserProfile; names: Record<string, string> }) {
  const { u } = p;
  const locked = u.role === "owner" && p.viewer.role !== "owner";
  return (
    <tr className={u.active ? "" : s.inactive} aria-selected={p.selected}>
      <td className={s.cWho}>
        {/* الرابط يغطي الصف كله: نقر أو Enter يفتح المستخدم */}
        <Link to={`/users/${u.uid}`} className={s.rowLink} aria-current={p.selected ? "page" : undefined}>
          <b>{u.displayName}</b>
          <span className="num">{u.login}</span>
        </Link>
      </td>
      <td className={s.cRole}>
        <span className={`${s.role} ${s[u.role]}`}>{p.names[u.role]}</span>
      </td>
      <td className={s.cSup}>
        {u.role === "entry" ? (
          <>
            <span className="num">{u.assigned.length}</span> مورد
          </>
        ) : (
          "الكل"
        )}
      </td>
      <td className={s.cState}>
        <StateStamp u={u} />
        {locked ? <span className={s.lock}>محمي</span> : null}
      </td>
      <td className={`${s.cDate} num`}>{formatDate(u.updatedAt)}</td>
      <td className={s.cGo} aria-hidden="true">
        ‹
      </td>
    </tr>
  );
}
