import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { firebase, firebaseConfigProblem } from "../../../shared/firebase/client";
import { parseUser, type UserProfile } from "../../users/core/users";
import { signOutNow } from "../data/authService";

/** سبب الخروج يُعرض في شاشة الدخول. */
export type SignedOutNotice = "expired" | "disabled" | "noProfile";

export type SessionState =
  | { status: "configError"; missing: string[] }
  | { status: "loading" }
  | { status: "signedOut"; notice: SignedOutNotice | null }
  | { status: "signedIn"; profile: UserProfile }
  | { status: "error"; message: string };

interface SessionApi {
  state: SessionState;
  /** خروج مع سبب يظهر في شاشة الدخول (مثل انتهاء الجلسة). */
  endSession: (notice?: SignedOutNotice) => Promise<void>;
}

const Ctx = createContext<SessionApi | null>(null);

export function SessionProvider(p: { children: ReactNode }) {
  const missing = firebaseConfigProblem();
  const [state, setState] = useState<SessionState>(
    missing ? { status: "configError", missing } : { status: "loading" },
  );
  const notice = useRef<SignedOutNotice | null>(null);

  const endSession = useCallback(async (n?: SignedOutNotice) => {
    notice.current = n ?? null;
    await signOutNow();
  }, []);

  useEffect(() => {
    if (missing) return;
    const { auth, db } = firebase();
    let unsubUser: (() => void) | null = null;
    let watching: string | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // تغيير كلمة المرور يجدد الرمز ويعيد إطلاق الحدث للمستخدم نفسه: لا نعيد التحميل
      if (user && user.uid === watching) return;
      unsubUser?.();
      unsubUser = null;
      watching = user?.uid ?? null;
      if (!user) {
        setState({ status: "signedOut", notice: notice.current });
        notice.current = null;
        return;
      }
      setState({ status: "loading" });
      unsubUser = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          const profile = parseUser(user.uid, snap.data());
          if (!profile) return void endSession("noProfile");
          if (!profile.active) return void endSession("disabled");
          setState({ status: "signedIn", profile });
        },
        (e) => {
          console.error("تعذّر قراءة حساب المستخدم", e);
          setState({ status: "error", message: `تعذّر قراءة حسابك (${e.code ?? e.message}).` });
        },
      );
    });
    return () => {
      unsubUser?.();
      unsubAuth();
    };
    // missing ثابت طوال عمر الصفحة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSession]);

  const api = useMemo(() => ({ state, endSession }), [state, endSession]);
  return <Ctx.Provider value={api}>{p.children}</Ctx.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession خارج SessionProvider");
  return v;
}

/** للشاشات التي لا تُعرض إلا بعد الدخول. */
export function useProfile(): UserProfile {
  const { state } = useSession();
  if (state.status !== "signedIn") throw new Error("useProfile قبل الدخول");
  return state.profile;
}

export const NOTICE_TEXT: Record<SignedOutNotice, { title: string; body: string }> = {
  expired: { title: "انتهت جلستك", body: "خرجنا تلقائياً بعد مدة بلا نشاط. ادخل مرة أخرى لتكمل." },
  disabled: { title: "حسابك موقوف", body: "راجع الإدارة لإعادة تفعيله." },
  noProfile: { title: "حسابك غير مكتمل", body: "لا يوجد ملف مستخدم لهذا الدخول. راجع الإدارة." },
};
