import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmountField } from "./AmountField";
import { DebitCreditBar } from "./DebitCreditBar";
import { DateField } from "./DateField";
import { RefField } from "./RefField";
import { VoucherField } from "./VoucherField";
import { Checkbox } from "./Checkbox";
import { DocTypeSegment, type DocType } from "./Segment";
import { ReasonDialog } from "./ReasonDialog";
import { PasswordField } from "./LoginFields";
import type { EntryKind } from "../core";

function Amount({ onValue }: { onValue?: (h: number | null) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <AmountField
      value={v}
      onChange={(h) => {
        setV(h);
        onValue?.(h);
      }}
    />
  );
}

describe("AmountField", () => {
  it("فواصل آلاف أثناء الكتابة وتنسيق 1,234.50 عند الخروج", async () => {
    const onValue = vi.fn();
    render(<Amount onValue={onValue} />);
    const input = screen.getByLabelText(/المبلغ/);
    await userEvent.type(input, "1234.5");
    expect(input).toHaveValue("1,234.5");
    await userEvent.tab();
    expect(input).toHaveValue("1,234.50");
    expect(onValue).toHaveBeenLastCalledWith(123450);
  });
  it("يقبل الأرقام الهندية والفاصلة العربية", async () => {
    render(<Amount />);
    const input = screen.getByLabelText(/المبلغ/);
    await userEvent.type(input, "١٢٥٠٠٫٥");
    expect(input).toHaveValue("12,500.5");
  });
  it("يحوّل الأرقام الهندية حتى بلا beforeinput (IME وأندرويد)", () => {
    render(<Amount />);
    const input = screen.getByLabelText(/المبلغ/);
    input.focus();
    fireEvent.change(input, { target: { value: "١٢٥٠٠٫٥" } });
    expect(input).toHaveValue("12,500.5");
  });
  it("يرفض الإشارة برسالة واضحة", async () => {
    render(<Amount />);
    await userEvent.type(screen.getByLabelText(/المبلغ/), "-");
    expect(screen.getByRole("alert")).toHaveTextContent("المبلغ موجب فقط");
  });
  it("يمنع منزلة ثالثة", async () => {
    render(<Amount />);
    const input = screen.getByLabelText(/المبلغ/);
    await userEvent.type(input, "1.239");
    expect(input).toHaveValue("1.23");
    expect(screen.getByRole("alert")).toHaveTextContent("منزلتان");
  });
  it("الصفر مرفوض عند الخروج", async () => {
    render(<Amount />);
    await userEvent.type(screen.getByLabelText(/المبلغ/), "0");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("أكبر من صفر");
    expect(screen.getByLabelText(/المبلغ/)).toHaveAttribute("aria-invalid", "true");
  });
  it("ينظّف اللصق", async () => {
    render(<Amount />);
    const input = screen.getByLabelText(/المبلغ/);
    await userEvent.click(input);
    await userEvent.paste("ر.س 1,234.50");
    expect(input).toHaveValue("1,234.50");
  });
  it("يرفض لصق مبلغ سالب ولا يقلبه", async () => {
    render(<Amount />);
    await userEvent.click(screen.getByLabelText(/المبلغ/));
    await userEvent.paste("-300");
    expect(screen.getByLabelText(/المبلغ/)).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("موجب");
  });
});

function Bar({ kind }: { kind: EntryKind }) {
  const [v, setV] = useState<number | null>(null);
  const [rev, setRev] = useState(false);
  return <DebitCreditBar kind={kind} reversed={rev} onReversedChange={setRev} value={v} onChange={setV} />;
}

describe("DebitCreditBar", () => {
  it("الفاتورة: الدائن مفتوح والمدين مقفل", () => {
    render(<Bar kind="inv" />);
    expect(screen.getByRole("textbox", { name: /دائن/ })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /مدين/ })).toBeDisabled();
  });
  it("القيد: المدين مفتوح والدائن مقفل", () => {
    render(<Bar kind="misc" />);
    expect(screen.getByRole("textbox", { name: /مدين/ })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /دائن/ })).toBeDisabled();
  });
  it("العكس الصريح ينقل المبلغ ويُظهر وسم مرتجع", async () => {
    render(<Bar kind="inv" />);
    await userEvent.type(screen.getByRole("textbox", { name: /دائن/ }), "500");
    await userEvent.tab();
    await userEvent.click(screen.getByRole("checkbox", { name: /عكس الاتجاه/ }));
    expect(screen.getByRole("textbox", { name: /مدين/ })).toHaveValue("500.00");
    expect(screen.getByRole("textbox", { name: /دائن/ })).toBeDisabled();
    expect(screen.getAllByText("مرتجع").length).toBeGreaterThan(0);
  });
});

function DateHarness({ lockedThrough }: { lockedThrough?: string }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <DateField value={v} onChange={setV} today="2026-10-10" base="2026-08-14" lockedThrough={lockedThrough} />
  );
}

describe("DateField", () => {
  it("يقرأ 1508 يوماً ثم شهراً ويعرض اسم اليوم", async () => {
    render(<DateHarness />);
    const input = screen.getByRole("textbox", { name: /التاريخ/ });
    await userEvent.type(input, "1508");
    await userEvent.tab();
    expect(input).toHaveValue("15/08/2026");
    expect(screen.getByText("السبت 15/08/2026")).toBeInTheDocument();
  });
  it("+1 من تاريخ الأساس", async () => {
    render(<DateHarness />);
    const input = screen.getByRole("textbox", { name: /التاريخ/ });
    await userEvent.type(input, "+1");
    await userEvent.tab();
    expect(input).toHaveValue("15/08/2026");
  });
  it("تاريخ غير موجود يظهر خطأً ولا يُقبل بصمت", async () => {
    render(<DateHarness />);
    await userEvent.type(screen.getByRole("textbox", { name: /التاريخ/ }), "3102");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("لا يوجد يوم 31 في فبراير 2026");
  });
  it("الفترة المقفلة تمنع", async () => {
    render(<DateHarness lockedThrough="2026-06-30" />);
    await userEvent.type(screen.getByRole("textbox", { name: /التاريخ/ }), "1506");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("الفترة مقفلة حتى 30/06/2026");
  });
  it("يرفض الحروف لحظة الكتابة", async () => {
    render(<DateHarness />);
    await userEvent.type(screen.getByRole("textbox", { name: /التاريخ/ }), "a");
    expect(screen.getByRole("textbox", { name: /التاريخ/ })).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("أرقام وفواصل");
  });
  it("التقويم يفتح ويختار بلوحة المفاتيح", async () => {
    render(<DateHarness />);
    await userEvent.click(screen.getByRole("button", { name: "اختيار التاريخ من التقويم" }));
    expect(screen.getByRole("dialog", { name: "اختيار التاريخ" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{Enter}"); // في RTL: اليسار = اليوم التالي
    expect(screen.getByRole("textbox", { name: /التاريخ/ })).toHaveValue("11/10/2026");
  });
});

function RefHarness({ kind }: { kind: EntryKind }) {
  const [v, setV] = useState("");
  return <RefField kind={kind} value={v} onChange={setV} />;
}

describe("RefField", () => {
  it("يحفظ الأصفار البادئة ويقص ويكبّر", async () => {
    render(<RefHarness kind="inv" />);
    const input = screen.getByRole("textbox", { name: /المرجع/ });
    await userEvent.type(input, " out/00013 ");
    await userEvent.tab();
    expect(input).toHaveValue("OUT/00013");
  });
  it("مرجع الفاتورة الأقصر يُرفض", async () => {
    render(<RefHarness kind="inv" />);
    await userEvent.type(screen.getByRole("textbox", { name: /المرجع/ }), "0791");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("5 أرقام بالضبط");
  });
  it("مرجع القيد 0395 صحيح ويبقى نصاً", async () => {
    render(<RefHarness kind="misc" />);
    const input = screen.getByRole("textbox", { name: /المرجع/ });
    await userEvent.type(input, "0395");
    await userEvent.tab();
    expect(input).toHaveValue("0395");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("VoucherField", () => {
  it("يحفظ الأصفار ويرفض الحروف", async () => {
    function H() {
      const [v, setV] = useState("");
      return <VoucherField value={v} onChange={setV} />;
    }
    render(<H />);
    const input = screen.getByRole("textbox", { name: /رقم السند/ });
    await userEvent.type(input, "0042x");
    expect(input).toHaveValue("0042");
    expect(screen.getByRole("alert")).toHaveTextContent("أرقام فقط");
  });
});

describe("Checkbox وSegment", () => {
  it("مربع اختيار مخصص يبدّل بالمسافة", async () => {
    function H() {
      const [c, setC] = useState(false);
      return (
        <Checkbox checked={c} onChange={setC}>
          أؤكد
        </Checkbox>
      );
    }
    render(<H />);
    const box = screen.getByRole("checkbox", { name: "أؤكد" });
    box.focus();
    await userEvent.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "true");
  });
  it("Alt+2 يختار القيد", async () => {
    function H() {
      const [t, setT] = useState<DocType>("inv");
      return <DocTypeSegment value={t} onChange={setT} />;
    }
    render(<H />);
    await userEvent.keyboard("{Alt>}2{/Alt}");
    expect(screen.getByRole("radio", { name: /قيد/ })).toHaveAttribute("aria-checked", "true");
  });
});

describe("ReasonDialog", () => {
  it("لا يقبل الحفظ بلا سبب، و«أخرى» تتطلب نصاً", async () => {
    const onConfirm = vi.fn();
    render(<ReasonDialog isOpen count={3} onCancel={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }));
    expect(screen.getByText("اختر سبب الإرجاع.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /أخرى/ }));
    await userEvent.click(screen.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }));
    expect(screen.getByText("اكتب السبب، فهو مطلوب مع «أخرى».")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: /تفاصيل/ }), "خطأ في الفرع");
    await userEvent.click(screen.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "other", text: "خطأ في الفرع" });
  });
});

describe("PasswordField", () => {
  it("إظهار وإخفاء ومؤشر القوة بالمستوى فقط", async () => {
    function H() {
      const [v, setV] = useState("");
      return <PasswordField value={v} onChange={setV} mode="set" />;
    }
    render(<H />);
    const input = screen.getByLabelText(/كلمة المرور/, { selector: "input" });
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "abc");
    expect(screen.getByText("القوة: ضعيفة")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "Tq7#mLx9!pR2vZ");
    expect(screen.getByText("القوة: قوية")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
    expect(input).toHaveAttribute("type", "text");
  });
});
