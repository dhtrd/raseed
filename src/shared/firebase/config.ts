/**
 * إعدادات تطبيق الويب من متغيرات VITE_FIREBASE_* (ليست أسراراً، لكنها خارج git).
 * وضع المحاكي (VITE_USE_EMULATORS=true) للتطوير واختبارات e2e فقط، بمشروع demo-*.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
}

export type ConfigResult =
  | { ok: true; config: FirebaseWebConfig; emulator: false }
  | { ok: true; config: FirebaseWebConfig; emulator: true; host: string }
  | { ok: false; missing: string[] };

const KEYS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  appId: "VITE_FIREBASE_APP_ID",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
} as const;

export function readFirebaseConfig(env: Record<string, string | boolean | undefined>): ConfigResult {
  const get = (k: string) => {
    const v = env[k];
    return typeof v === "string" ? v.trim() : "";
  };
  if (get("VITE_USE_EMULATORS") === "true") {
    const projectId = get(KEYS.projectId) || "demo-raseed";
    // المحاكي يرفض المشاريع الحقيقية هنا عمداً كي لا تُكتب بيانات تجريبية في الإنتاج
    if (!projectId.startsWith("demo-"))
      return { ok: false, missing: [`${KEYS.projectId} (demo-* مع المحاكي)`] };
    return {
      ok: true,
      emulator: true,
      host: get("VITE_EMULATOR_HOST") || "127.0.0.1",
      config: {
        apiKey: "demo-key",
        authDomain: "localhost",
        projectId,
        appId: "demo-app",
        messagingSenderId: "0",
      },
    };
  }
  const config = {
    apiKey: get(KEYS.apiKey),
    authDomain: get(KEYS.authDomain),
    projectId: get(KEYS.projectId),
    appId: get(KEYS.appId),
    messagingSenderId: get(KEYS.messagingSenderId),
  };
  const missing = (Object.keys(KEYS) as (keyof typeof KEYS)[]).filter((k) => !config[k]).map((k) => KEYS[k]);
  return missing.length ? { ok: false, missing } : { ok: true, emulator: false, config };
}
