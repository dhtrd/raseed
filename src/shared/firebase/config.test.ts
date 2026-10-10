import { describe, expect, it } from "vitest";
import { readFirebaseConfig } from "./config";

const full = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "raseed-dhtrd.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "raseed-dhtrd",
  VITE_FIREBASE_APP_ID: "a",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
};

describe("إعدادات Firebase", () => {
  it("تكتمل بالمتغيرات الخمسة", () => {
    expect(readFirebaseConfig(full)).toMatchObject({ ok: true, emulator: false });
  });
  it("تذكر الناقص بالاسم ولا تعمل بنصف إعدادات", () => {
    const r = readFirebaseConfig({ ...full, VITE_FIREBASE_API_KEY: " ", VITE_FIREBASE_APP_ID: undefined });
    expect(r).toEqual({ ok: false, missing: ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_APP_ID"] });
  });
  it("المحاكي بمشروع demo-* فقط", () => {
    expect(readFirebaseConfig({ VITE_USE_EMULATORS: "true" })).toMatchObject({
      ok: true,
      emulator: true,
      config: { projectId: "demo-raseed" },
    });
    expect(readFirebaseConfig({ ...full, VITE_USE_EMULATORS: "true" })).toMatchObject({ ok: false });
  });
});
