import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { readFirebaseConfig, type ConfigResult } from "./config";

export class FirebaseConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`إعدادات Firebase ناقصة: ${missing.join("، ")}`);
  }
}

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  emulator: boolean;
}

let client: FirebaseClient | null = null;
const result: ConfigResult = readFirebaseConfig(import.meta.env);

function connect(auth: Auth, db: Firestore | null, r: ConfigResult) {
  if (!r.ok || !r.emulator) return;
  connectAuthEmulator(auth, `http://${r.host}:9099`, { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, r.host, 8080);
}

/**
 * عميل Firebase الوحيد. الجلسة في sessionStorage: إغلاق المتصفح يُخرج المستخدم (DECISIONS 2026-10-10).
 */
export function firebase(): FirebaseClient {
  if (client) return client;
  if (!result.ok) throw new FirebaseConfigError(result.missing);
  const app = initializeApp(result.config);
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  const db = getFirestore(app);
  connect(auth, db, result);
  client = { app, auth, db, emulator: result.emulator };
  return client;
}

export function firebaseConfigProblem(): string[] | null {
  return result.ok ? null : result.missing;
}

/**
 * إنشاء حساب دخول لمستخدم آخر دون إخراج المدير الحالي: تطبيق ثانوي مؤقت بجلسة في الذاكرة
 * (الخيار «ج. هجين»، بلا Cloud Functions). يُحذف التطبيق بعد الاستخدام دائماً.
 */
export async function withSecondaryAuth<T>(fn: (auth: Auth) => Promise<T>): Promise<T> {
  if (!result.ok) throw new FirebaseConfigError(result.missing);
  const app = initializeApp(result.config, `secondary-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connect(auth, null, result);
    return await fn(auth);
  } finally {
    await deleteApp(app);
  }
}
