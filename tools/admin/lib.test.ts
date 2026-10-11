// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { checkEnv, generateTempPassword, isInside, isStrongPassword } from "./lib.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));

describe("سكربتات المالك", () => {
  it("الكلمة المؤقتة قوية وفريدة", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(16);
      expect(isStrongPassword(p)).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
  it("المفتاح داخل المستودع مرفوض أينما كان", () => {
    expect(isInside("/a/repo/x/key.json", "/a/repo")).toBe(true);
    expect(isInside("/a/repo", "/a/repo")).toBe(true);
    expect(isInside("/a/repo-keys/key.json", "/a/repo")).toBe(false);
    expect(isInside("/a/keys/key.json", "/a/repo")).toBe(false);
  });
  it("تتحقق من البيئة قبل أي اتصال", () => {
    expect(checkEnv({})).toMatchObject({ ok: false });
    expect(checkEnv({ RASEED_PROJECT_ID: "p" })).toMatchObject({ ok: false });
    expect(
      checkEnv({ RASEED_PROJECT_ID: "p", GOOGLE_APPLICATION_CREDENTIALS: `${repo}private/key.json` }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      checkEnv({ RASEED_PROJECT_ID: "p", GOOGLE_APPLICATION_CREDENTIALS: "/home/u/keys/key.json" }),
    ).toEqual({
      ok: true,
      projectId: "p",
      emulator: false,
    });
    expect(
      checkEnv({ RASEED_PROJECT_ID: "demo", FIREBASE_AUTH_EMULATOR_HOST: "x", FIRESTORE_EMULATOR_HOST: "y" }),
    ).toMatchObject({ ok: true, emulator: true });
  });
});
