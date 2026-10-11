// @vitest-environment node
import ExcelJS from "exceljs";
import officeCrypto from "officecrypto-tool";
import { checkPassphrase, decryptData, encryptData, encryptXlsx } from "./crypto.ts";
import { credsFromEnv, Dropbox } from "./dropbox.ts";
import {
  compareManifests,
  decodeValue,
  dayOfFile,
  encodeValue,
  fileNames,
  manifestOf,
  parseDump,
  riyadhDay,
  safeError,
  toPrune,
  type BackupDump,
} from "./model.ts";
import { buildBackupWorkbook, sheetName } from "./workbook.ts";

const PASS = "correct horse battery staple";

const ts = (seconds: number, nanoseconds: number) => ({
  seconds,
  nanoseconds,
  toMillis: () => seconds * 1000 + nanoseconds / 1e6,
});

function dump(): BackupDump {
  return {
    format: "raseed-backup",
    version: 1,
    projectId: "demo",
    takenAt: "2026-10-11T08:30:00.000Z",
    day: "2026-10-11",
    collections: {
      suppliers: {
        s1: { name: "المورد (أ)", status: "active" },
        s2: { name: "المورد [ب]/2", status: "archived" },
      },
      entries: {
        e1: { supplierId: "s1", kind: "inv", date: "2026-10-01", refNo: "10", debit: 0, credit: 150000 },
        e2: { supplierId: "s1", kind: "misc", date: "2026-10-02", refNo: "0501", debit: 100000, credit: 0 },
        e3: { supplierId: "s1", kind: "inv", date: "2026-10-03", refNo: "11", credit: 99900, deleted: true },
        e4: { supplierId: "s2", kind: "note", date: "2026-10-04", note: "اتصال" },
      },
      settings: { lock: { lockedThrough: "2026-09-30", at: { __ts: [1, 2] } } },
    },
    authUsers: [{ uid: "u1", email: "a@b.c", disabled: false, claims: null, createdAt: null }],
  };
}

describe("ترميز قيم Firestore", () => {
  it("يحفظ الطوابع الزمنية والمصفوفات والخرائط ذهاباً وإياباً", () => {
    const src = { a: ts(1700000000, 123456789), b: [1, "x", null, { c: true }], d: { e: ts(5, 0) } };
    const enc = encodeValue(src, "x/y");
    expect(enc).toEqual({
      a: { __ts: [1700000000, 123456789] },
      b: [1, "x", null, { c: true }],
      d: { e: { __ts: [5, 0] } },
    });
    const back = decodeValue(JSON.parse(JSON.stringify(enc)), (s, n) => `T${s}.${n}`);
    expect(back).toEqual({ a: "T1700000000.123456789", b: [1, "x", null, { c: true }], d: { e: "T5.0" } });
  });

  it("يرفض الأنواع غير المعروفة والحقل المحجوز بدل فقدها بصمت", () => {
    class GeoPoint {
      lat = 1;
    }
    expect(() => encodeValue({ g: new GeoPoint() }, "s/1")).toThrow(/GeoPoint.*s\/1\.g/);
    expect(() => encodeValue({ __ts: 1 }, "s/1")).toThrow(/محجوز/);
    expect(() => encodeValue({ n: Number.NaN }, "s/1")).toThrow(/غير منتهٍ/);
  });
});

describe("البيان والمطابقة", () => {
  it("يعدّ كل مجموعة وحسابات الدخول، ويذكر الفروق", () => {
    const m = manifestOf(dump());
    expect(m).toEqual({ collections: { suppliers: 2, entries: 4, settings: 1 }, authUsers: 1 });
    expect(compareManifests(m, m)).toEqual([]);
    expect(compareManifests(m, { collections: { suppliers: 2, entries: 3 }, authUsers: 0 })).toEqual([
      "entries: النسخة 4 ← المسترجَع 3",
      "settings: النسخة 1 ← المسترجَع 0",
      "حسابات الدخول: النسخة 1 ← المسترجَع 0",
    ]);
  });

  it("يرفض ملفاً ليس نسخة أو بإصدار آخر", () => {
    expect(parseDump(JSON.stringify(dump())).day).toBe("2026-10-11");
    expect(() => parseDump("{}")).toThrow(/ليس نسخة/);
    expect(() => parseDump(JSON.stringify({ ...dump(), version: 2 }))).toThrow(/غير مدعوم/);
  });
});

describe("الأسماء والاحتفاظ", () => {
  it("تاريخ الرياض: 11:30 الرياض = 08:30 عالمي، ومنتصف الليل يغيّر اليوم", () => {
    expect(riyadhDay(new Date("2026-10-11T08:30:00Z"))).toBe("2026-10-11");
    expect(riyadhDay(new Date("2026-10-11T21:30:00Z"))).toBe("2026-10-12");
    expect(fileNames("2026-10-11")).toEqual({
      data: "raseed-2026-10-11.json.gz.enc",
      sheet: "raseed-2026-10-11.xlsx",
    });
    expect(dayOfFile("raseed-2026-10-11.xlsx")).toBe("2026-10-11");
    expect(dayOfFile("notes.txt")).toBeNull();
  });

  it("يحذف الأقدم من 30 يوماً ويبقي أول نسخة من كل شهر وأي ملف آخر", () => {
    const names = [
      "raseed-2026-07-03.json.gz.enc",
      "raseed-2026-07-03.xlsx",
      "raseed-2026-07-04.json.gz.enc",
      "raseed-2026-08-01.json.gz.enc",
      "raseed-2026-08-02.xlsx",
      "raseed-2026-09-11.json.gz.enc",
      "raseed-2026-09-10.json.gz.enc",
      "raseed-2026-09-01.json.gz.enc",
      "raseed-2026-10-11.json.gz.enc",
      "ملاحظاتي.txt",
    ];
    expect(toPrune(names, "2026-10-11").sort()).toEqual([
      "raseed-2026-07-04.json.gz.enc",
      "raseed-2026-08-02.xlsx",
      "raseed-2026-09-10.json.gz.enc",
    ]);
  });

  it("رسالة الخطأ سطر قصير بلا رموز وصول", () => {
    const tok = "sl.u.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghij";
    const msg = safeError(new Error(`Dropbox 401\nBearer ${tok} bad`));
    expect(msg).not.toContain("AbCdEf");
    expect(msg).not.toContain("\n");
    expect(safeError("x".repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe("التشفير", () => {
  it("يفك ما شفّره، ويرفض العبارة الخاطئة والملف المعطوب", () => {
    const enc = encryptData('{"a":"رصيد"}', PASS);
    expect(enc.subarray(0, 6).toString()).toBe("RSDBK1");
    expect(enc.toString("utf8")).not.toContain("رصيد");
    expect(decryptData(enc, PASS)).toBe('{"a":"رصيد"}');
    expect(() => decryptData(enc, "wrong passphrase 123")).toThrow(/عبارة السر خاطئة/);
    const bad = Buffer.from(enc);
    bad.writeUInt8((bad.readUInt8(bad.length - 1) ^ 1) & 0xff, bad.length - 1);
    expect(() => decryptData(bad, PASS)).toThrow(/تالف/);
    expect(() => decryptData(Buffer.from("hello"), PASS)).toThrow(/ليس نسخة/);
  });

  it("عبارة السر 16 حرفاً على الأقل", () => {
    expect(() => checkPassphrase(undefined)).toThrow(/BACKUP_PASSPHRASE/);
    expect(() => checkPassphrase("short")).toThrow(/16/);
    expect(checkPassphrase(PASS)).toBe(PASS);
  });

  it("ملف Excel يُشفَّر بكلمة مرور Office ويُفتح بها", async () => {
    const plain = Buffer.from(await buildBackupWorkbook(dump()).xlsx.writeBuffer());
    const enc = encryptXlsx(plain, PASS);
    expect(officeCrypto.isEncrypted(enc)).toBe(true);
    const back = await officeCrypto.decrypt(enc, { password: PASS });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(back as unknown as ArrayBuffer);
    expect(wb.getWorksheet("الأرصدة")).toBeTruthy();
  }, 30000);
});

describe("ملف Excel المقروء", () => {
  it("الأرصدة بلا المحذوف، وكشف لكل مورد برصيد جارٍ", async () => {
    const wb = buildBackupWorkbook(dump());
    const sum = wb.getWorksheet("الأرصدة");
    expect(sum?.getCell("A1").value).toBe("نسخة «رصيد» الاحتياطية · 2026-10-11");
    // الترتيب أبجدي: (أ) ثم [ب]
    expect([sum?.getCell("A3").value, sum?.getCell("E3").value, sum?.getCell("F3").value]).toEqual([
      "المورد (أ)",
      -500,
      2,
    ]);
    expect([sum?.getCell("B4").value, sum?.getCell("F4").value]).toEqual(["مؤرشف", 1]);
    const s1 = wb.getWorksheet("المورد (أ)");
    expect([s1?.getCell("B3").value, s1?.getCell("H3").value, s1?.getCell("H4").value]).toEqual([
      "فاتورة",
      -1500,
      -500,
    ]);
    expect(wb.getWorksheet("المورد  ب  2")?.getCell("E3").value).toBe("اتصال");
  });

  it("أسماء الأوراق صالحة وفريدة", () => {
    const used = new Set<string>();
    expect(sheetName("أ/ب*ج", used)).toBe("أ ب ج");
    expect(sheetName("أ/ب*ج", used)).toBe("أ ب ج 2");
    expect(sheetName("x".repeat(40), used).length).toBeLessThanOrEqual(31);
  });
});

describe("Dropbox", () => {
  it("الأسرار الناقصة تُسمّى بالاسم", () => {
    expect(() => credsFromEnv({ DROPBOX_APP_KEY: "k" })).toThrow(/DROPBOX_APP_SECRET، DROPBOX_REFRESH_TOKEN/);
  });

  it("يجدد الرمز مرة، ويرفع ويستعرض صفحات ويحذف بالمسارات الصحيحة", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const http = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const u = String(url);
      if (u.endsWith("/oauth2/token")) return json({ access_token: "AT" });
      if (u.endsWith("/files/list_folder"))
        return json({
          entries: [
            { ".tag": "file", name: "a" },
            { ".tag": "folder", name: "d" },
          ],
          cursor: "c",
          has_more: true,
        });
      if (u.endsWith("/files/list_folder/continue"))
        return json({ entries: [{ ".tag": "file", name: "b" }], cursor: "c", has_more: false });
      return json({});
    };
    const d = new Dropbox({ appKey: "k", appSecret: "s", refreshToken: "r" }, http as typeof fetch);
    await d.upload("raseed-2026-10-11.xlsx", Buffer.from("x"));
    expect(await d.list()).toEqual(["a", "b"]);
    await d.remove("a");
    expect(calls.filter((c) => c.url.endsWith("/oauth2/token"))).toHaveLength(1);
    const up = calls.find((c) => c.url.includes("/files/upload"));
    expect((up?.init.headers as Record<string, string>)["Dropbox-API-Arg"]).toBe(
      JSON.stringify({ path: "/raseed-2026-10-11.xlsx", mode: "overwrite", mute: true }),
    );
    expect((up?.init.headers as Record<string, string>).Authorization).toBe("Bearer AT");
    expect(calls.at(-1)?.init.body).toBe(JSON.stringify({ path: "/a" }));
  });

  it("الفشل يذكر الحالة وملخص الخطأ", async () => {
    const http = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const d = new Dropbox({ appKey: "k", appSecret: "s", refreshToken: "r" }, http as typeof fetch);
    await expect(d.list()).rejects.toThrow("Dropbox تجديد رمز الدخول: 400 invalid_grant");
  });
});
