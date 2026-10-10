import type { ReactNode } from "react";
import s from "./Banner.module.css";

/** شريط رسالة: «err» للأخطاء (role=alert)، و«info» للمعلومات (role=status). */
export function Banner(p: { tone: "err" | "info" | "ok"; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`${s.banner} ${s[p.tone]}`} role={p.tone === "err" ? "alert" : "status"}>
      <div>
        {p.title ? <b className={s.title}>{p.title}</b> : null}
        {p.children}
      </div>
    </div>
  );
}
