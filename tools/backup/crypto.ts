/**
 * تشفير ملف البيانات (DECISIONS 2026-10-11): gzip ثم AES-256-GCM بمفتاح مشتق من عبارة السر بـ scrypt.
 * البنية: "RSDBK1" (6 بايت) + ملح 16 + متجه 12 + وسم 16 + النص المشفر.
 * ملف Excel يُشفَّر بكلمة مرور Office نفسها (officecrypto-tool) فيُفتح في Excel مباشرة بالعبارة.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import officeCrypto from "officecrypto-tool";

const MAGIC = Buffer.from("RSDBK1", "ascii");
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSPHRASE = 16;

export function checkPassphrase(p: string | undefined): string {
  if (!p || p.length < MIN_PASSPHRASE)
    throw new Error(`عبارة السر مفقودة أو أقصر من ${MIN_PASSPHRASE} حرفاً (السر BACKUP_PASSPHRASE).`);
  return p;
}

function keyOf(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, SCRYPT);
}

export function encryptData(plain: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(passphrase, salt), iv);
  const body = Buffer.concat([c.update(gzipSync(Buffer.from(plain, "utf8"))), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

export function decryptData(file: Buffer, passphrase: string): string {
  if (file.length < 50 || !file.subarray(0, 6).equals(MAGIC))
    throw new Error("الملف ليس نسخة «رصيد» مشفّرة.");
  const salt = file.subarray(6, 22);
  const iv = file.subarray(22, 34);
  const tag = file.subarray(34, 50);
  const d = createDecipheriv("aes-256-gcm", keyOf(passphrase, salt), iv);
  d.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([d.update(file.subarray(50)), d.final()])).toString("utf8");
  } catch {
    throw new Error("تعذّر فك التشفير: عبارة السر خاطئة أو الملف تالف.");
  }
}

export function encryptXlsx(xlsx: Buffer, passphrase: string): Buffer {
  return officeCrypto.encrypt(xlsx, { password: passphrase });
}
