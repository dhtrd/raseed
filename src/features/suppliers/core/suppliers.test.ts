import { describe, expect, it } from "vitest";
import { checkSupplierName, normalizeName } from "./suppliers";

const ALL = [
  { id: "s1", name: "مؤسسة الإسمنت", archived: false },
  { id: "s2", name: "المورد (ب)", archived: false },
  { id: "s9", name: "شركة النخيل", archived: true },
];

describe("اسم المورد", () => {
  it("التوحيد: الهمزات والتاء المربوطة والمسافات", () => {
    expect(normalizeName("  مؤسسة  الإسمنتِ ")).toBe(normalizeName("مؤسسه الاسمنت"));
  });

  it("إلزامي وبحد 100", () => {
    expect(checkSupplierName(" ", ALL).error).toBeTruthy();
    expect(checkSupplierName("x".repeat(101), ALL).error).toBeTruthy();
  });

  it("المطابق بعد التوحيد ممنوع، والمؤرشف يُذكر", () => {
    expect(checkSupplierName("مؤسسه الاسمنت", ALL).error).toContain("مؤسسة الإسمنت");
    expect(checkSupplierName("شركة  النخيل", ALL).error).toContain("مؤرشف");
  });

  it("تعديل اسم المورد نفسه لا يُعدّ تكراراً", () => {
    expect(checkSupplierName("مؤسسة الاسمنت", ALL, "s1").error).toBeNull();
  });

  it("المتشابه تحذير لا يمنع", () => {
    const r = checkSupplierName("مؤسسة الإسمنت الحديثة", ALL);
    expect(r.error).toBeNull();
    expect(r.similar).toEqual(["مؤسسة الإسمنت"]);
    expect(checkSupplierName("مؤسسة الاسمن", ALL).similar).toEqual(["مؤسسة الإسمنت"]);
    expect(checkSupplierName("مؤسسة الحديد", ALL).similar).toEqual([]);
  });
});
