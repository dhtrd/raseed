import { applyRange, shiftRange } from "./rangeSelect";

const order = ["a", "b", "c", "d", "e"];

describe("التحديد بـ Shift", () => {
  it("المدى بين المرساة والعنصر في الاتجاهين، شاملاً الطرفين", () => {
    expect(shiftRange(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(shiftRange(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(shiftRange(order, "c", "c")).toEqual(["c"]);
  });

  it("بلا مرساة أو مرساة غير ظاهرة: العنصر وحده؛ وعنصر غير ظاهر: لا شيء", () => {
    expect(shiftRange(order, null, "c")).toEqual(["c"]);
    expect(shiftRange(order, "z", "c")).toEqual(["c"]);
    expect(shiftRange(order, "a", "z")).toEqual([]);
  });

  it("يطبّق حالة العنصر المنقور على المدى كله دون مسّ ما خارجه", () => {
    expect([...applyRange(new Set(["a"]), ["b", "c"], true)].sort()).toEqual(["a", "b", "c"]);
    expect([...applyRange(new Set(["a", "b", "c", "e"]), ["b", "c", "d"], false)].sort()).toEqual(["a", "e"]);
  });
});
