import type { UserProfile } from "../core/users";
import s from "./UsersPage.module.css";

/** ختم الحالة: نشط، أو موقوف، أو بانتظار تغيير الكلمة المؤقتة. */
export function StateStamp({ u }: { u: UserProfile }) {
  if (!u.active) return <span className={`${s.stamp} ${s.off}`}>موقوف</span>;
  if (u.mustChangePassword) return <span className={`${s.stamp} ${s.pending}`}>بانتظار أول دخول</span>;
  return <span className={`${s.stamp} ${s.on}`}>نشط</span>;
}
