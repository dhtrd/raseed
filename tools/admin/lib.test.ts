import { describe, expect, it } from "vitest";
import { checkEnv, generateTempPassword, isStrongPassword } from "./lib.ts";

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
  it("تتحقق من البيئة قبل أي اتصال", () => {
    expect(checkEnv({})).toMatchObject({ ok: false });
    expect(checkEnv({ RASEED_PROJECT_ID: "p" })).toMatchObject({ ok: false });
    expect(
      checkEnv({ RASEED_PROJECT_ID: "p", GOOGLE_APPLICATION_CREDENTIALS: "/home/u/raseed/key.json" }),
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
