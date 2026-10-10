import { Link } from "react-router";
import { useProfile } from "../features/auth/session/SessionProvider";
import { isManager } from "../features/users/core/users";
import s from "./Home.module.css";

/** الرئيسية حتى المرحلة 4: الأرصدة والكشوف والفواتير لم تُبنَ بعد. */
export function Home() {
  const profile = useProfile();
  return (
    <main className={s.page}>
      <h1 className={s.title}>مرحباً {profile.displayName}</h1>
      <p className={s.note}>
        شاشات الأرصدة وكشف الحساب والفواتير والمراجعة تُبنى في المرحلة 4، بعد نقل البيانات.
      </p>
      {isManager(profile.role) ? (
        <ul className={s.links}>
          <li>
            <Link to="/users">إدارة المستخدمين ومسميات الأدوار</Link>
          </li>
          <li>
            <Link to="/assign">إسناد الموردين لمدخلي البيانات</Link>
          </li>
        </ul>
      ) : null}
    </main>
  );
}
