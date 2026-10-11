/**
 * أدوات مشتركة لسكربتات المالك (تعمل على جهازه فقط، بمفتاح حساب خدمة خارج git).
 * لا تُكتب كلمة مرور في سطر الأوامر ولا في السجل ولا في Firestore.
 */
import { createInterface, type Interface } from "node:readline";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { relative, resolve, isAbsolute } from "node:path";
import {
  generatePassword,
  identifierToEmail,
  isStrongPassword,
} from "../../src/shared/fields/core/password.ts";

export { identifierToEmail, isStrongPassword };

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** هل المسار داخل مجلد المستودع؟ (المفتاح يجب أن يكون خارجه لأن المستودع عام) */
export function isInside(path: string, root: string): boolean {
  if (!path) return false;
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** يتحقق من بيئة التشغيل قبل أي اتصال: مشروع صريح ومفتاح أو محاكي. */
export function checkEnv(
  env: Record<string, string | undefined>,
  /** سكربت النقل يحتاج Firestore وحده؛ سكربتا الحسابات يحتاجان Auth أيضاً */
  needs: { auth: boolean } = { auth: true },
): { ok: true; projectId: string; emulator: boolean } | { ok: false; error: string } {
  const projectId = env.RASEED_PROJECT_ID?.trim();
  if (!projectId) return { ok: false, error: "حدّد المشروع في RASEED_PROJECT_ID (مثلاً raseed-dhtrd)." };
  const emulator = Boolean(env.FIRESTORE_EMULATOR_HOST && (!needs.auth || env.FIREBASE_AUTH_EMULATOR_HOST));
  if (!emulator && !env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      ok: false,
      error: "حدّد مسار مفتاح حساب الخدمة في GOOGLE_APPLICATION_CREDENTIALS (ملف خارج المستودع).",
    };
  }
  if (
    !emulator &&
    [repoRoot, process.cwd()].some((root) => isInside(env.GOOGLE_APPLICATION_CREDENTIALS ?? "", root))
  ) {
    return { ok: false, error: "مفتاح حساب الخدمة داخل مجلد المستودع. انقله خارجه أولاً (المستودع عام)." };
  }
  return { ok: true, projectId, emulator };
}

/** كلمة مرور مؤقتة قوية بالأنواع الأربعة، بلا حروف ملتبسة (0/O، 1/l/I). */
export function generateTempPassword(length = 16): string {
  return generatePassword(randomInt, length);
}

/* قارئ أسطر واحد بطابور: الأسطر الملصوقة أو المُمرَّرة مسبقاً لا تضيع بين سؤال وآخر. */
type MutableRl = Interface & { _writeToOutput: (s: string) => void };
let rl: MutableRl | null = null;
let muted = false;
let closed = false;
const queue: string[] = [];
const waiters: ((line: string) => void)[] = [];

function reader(): MutableRl {
  if (rl) return rl;
  const tty = Boolean(process.stdin.isTTY);
  rl = createInterface({
    input: process.stdin,
    output: tty ? process.stdout : undefined,
    terminal: tty,
  }) as MutableRl;
  if (tty) {
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s: string) => {
      if (!muted) write(s);
    };
  }
  rl.on("line", (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const w of waiters.splice(0)) w("");
  });
  return rl;
}

function nextLine(): Promise<string> {
  reader();
  if (queue.length) return Promise.resolve(queue.shift()!);
  if (closed) return Promise.resolve("");
  return new Promise((resolve) => waiters.push(resolve));
}

export async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const a = await nextLine();
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return a;
}

/** سؤال بإخفاء الإدخال (كلمة المرور لا تظهر على الشاشة ولا في سجل الطرفية). */
export async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  try {
    return await nextLine();
  } finally {
    muted = false;
    process.stdout.write("\n");
  }
}

export function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** يغلق قارئ الأسطر كي ينتهي البرنامج دون انتظار إدخال. */
export function closePrompt(): void {
  rl?.close();
  rl = null;
}
