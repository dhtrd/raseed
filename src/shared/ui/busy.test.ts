import { act, renderHook } from "@testing-library/react";
import { useAnyBusy, useHoldBusy } from "./busy";

describe("مؤشر العمل العام", () => {
  it("يبقى مشغولاً ما دام مصدر واحد مشغولاً، ويعود عند فك الكل", () => {
    const any = renderHook(() => useAnyBusy());
    expect(any.result.current).toBe(false);
    const a = renderHook(({ on }) => useHoldBusy(on), { initialProps: { on: true } });
    const b = renderHook(({ on }) => useHoldBusy(on), { initialProps: { on: true } });
    expect(any.result.current).toBe(true);
    act(() => a.rerender({ on: false }));
    expect(any.result.current).toBe(true);
    act(() => b.unmount());
    expect(any.result.current).toBe(false);
  });
});
