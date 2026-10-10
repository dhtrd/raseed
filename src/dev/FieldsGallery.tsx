import { useMemo, useRef, useState } from "react";
import {
  AmountField,
  buildRefNo,
  Checkbox,
  DateField,
  DebitCreditBar,
  DocTypeSegment,
  IdentifierField,
  LIMITS,
  nextInSequence,
  PasswordField,
  PeriodFilter,
  periodFor,
  ReasonDialog,
  RefField,
  RefNumberOutput,
  SearchField,
  SupplierCombobox,
  TextAreaField,
  useEnterToNext,
  VoucherField,
  type DocType,
  type IsoDate,
  type Period,
} from "../shared/fields";
import s from "./FieldsGallery.module.css";

// بيانات وهمية فقط (المستودع عام)
const TODAY: IsoDate = "2026-10-10";
const LOCK: IsoDate = "2026-06-30";
const SUPPLIERS = [
  { id: "s1", name: "مؤسسة الأمثلة للأثاث", lastEntryDate: "2026-10-09" },
  { id: "s2", name: "منجرة التجربة", lastEntryDate: "2026-10-07" },
  { id: "s3", name: "مفروشات العيّنة", lastEntryDate: "2026-10-08" },
  { id: "s4", name: "مركز النموذج", lastEntryDate: "2026-09-12" },
  { id: "s5", name: "بيت الاختبار", lastEntryDate: "2026-09-28" },
];
const LAST = { inv: "12291", misc: "0395" };
const SAVED_REFS: Record<string, string> = {
  P10590: "المورد (أ)، الصف 92",
  "MISC/2026/08/0395": "المورد (د)، الصف 148",
};

/** معرض الحقول (للتطوير فقط): كل مكوّن في حالاته، ونموذج إدخال حي يعمل بالقواعد المعتمدة. */
export default function FieldsGallery() {
  const form = useRef<HTMLFormElement>(null);
  useEnterToNext(form);
  const [type, setType] = useState<DocType>("inv");
  const [date, setDate] = useState<IsoDate | null>(null);
  const [ref, setRef] = useState(nextInSequence(LAST.inv) ?? "");
  const [voucher, setVoucher] = useState("");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [reversed, setReversed] = useState(false);
  const [supplier, setSupplier] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>(periodFor("quarter", 2026, 3));
  const [search, setSearch] = useState("");
  const [ident, setIdent] = useState("");
  const [pw, setPw] = useState("");
  const [dupOf, setDupOf] = useState<string | null>(null);

  const kind = type === "note" ? "inv" : type;
  const refNo = useMemo(() => (ref ? buildRefNo(kind, ref, date ?? TODAY) : ""), [kind, ref, date]);

  const changeType = (t: DocType) => {
    setType(t);
    setReversed(false);
    if (t !== "note") setRef(nextInSequence(LAST[t]) ?? "");
  };

  return (
    <div className={s.page} dir="rtl">
      <section className={s.sheet}>
        <div className={s.toolbar}>
          <h1 className={s.h2}>معرض الحقول (للتطوير فقط)</h1>
          <button
            type="button"
            className={s.btn}
            onClick={() => {
              const r = document.documentElement;
              const dark = r.dataset.theme
                ? r.dataset.theme === "dark"
                : matchMedia("(prefers-color-scheme: dark)").matches;
              r.dataset.theme = dark ? "light" : "dark";
            }}
          >
            تبديل الوضع
          </button>
        </div>
        <h2 className={s.h2}>الحالات (خيار «أ. هادئ»)</h2>
        <div className={s.states} data-testid="states">
          <span className={s.stateName}>فارغ</span>
          <DateField value={null} onChange={() => {}} today={TODAY} />
          <AmountField value={null} onChange={() => {}} />
          <RefField kind="inv" value="" onChange={() => {}} />
          <span className={s.stateName}>صحيح</span>
          <DateField value="2026-08-15" onChange={() => {}} today={TODAY} />
          <AmountField value={125000} onChange={() => {}} />
          <RefField kind="inv" value="10791" onChange={() => {}} />
          <span className={s.stateName}>خطأ</span>
          <DateField value={null} onChange={() => {}} today={TODAY} error="لا يوجد يوم 31 في فبراير 2026." />
          <AmountField value={null} onChange={() => {}} error="المبلغ يجب أن يكون أكبر من صفر." />
          <RefField
            kind="inv"
            value="0791"
            onChange={() => {}}
            error="مرجع الفاتورة 5 أرقام بالضبط، وكتبت 4."
          />
          <span className={s.stateName}>معطّل</span>
          <DateField value="2026-08-15" onChange={() => {}} today={TODAY} disabled />
          <AmountField value={125000} onChange={() => {}} disabled />
          <RefField kind="inv" value="10791" onChange={() => {}} disabled />
          <span className={s.stateName}>للقراءة فقط</span>
          <DateField value="2026-08-15" onChange={() => {}} today={TODAY} readOnly />
          <AmountField value={125000} onChange={() => {}} readOnly />
          <RefNumberOutput value="P10791" />
        </div>
      </section>

      <section className={s.sheet}>
        <h2 className={s.h2}>نموذج حي</h2>
        <form
          ref={form}
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setStatus("نموذج للتطوير: لا يُحفظ شيء.");
          }}
        >
          <div className={s.wide}>
            <SupplierCombobox
              suppliers={SUPPLIERS}
              recentIds={["s1", "s3", "s2"]}
              value={supplier}
              onChange={setSupplier}
              required
            />
          </div>
          <DocTypeSegment value={type} onChange={changeType} />
          <DateField
            value={date}
            onChange={setDate}
            today={TODAY}
            lockedThrough={LOCK}
            base="2026-08-14"
            required
          />
          {type !== "note" ? (
            <>
              <RefField
                kind={kind}
                value={ref}
                onChange={(v) => {
                  setRef(v);
                  setDupOf(null);
                }}
                suggestion={nextInSequence(LAST[kind])}
                duplicateOf={dupOf}
                onBlurCheck={(v) => setDupOf(SAVED_REFS[buildRefNo(kind, v, date ?? TODAY)] ?? null)}
                required
              />
              <RefNumberOutput value={refNo} duplicate={Boolean(dupOf)} />
              <VoucherField value={voucher} onChange={setVoucher} />
              <div className={s.wide}>
                <TextAreaField
                  label="التفاصيل"
                  optional
                  value={details}
                  onChange={setDetails}
                  maxLength={LIMITS.details}
                  counter="always"
                  suggestions={["فاتورة مشتريات - مستودع الأثاث", "دفعة نقدية", "مرتجع بضاعة"]}
                  suggestionsLabel="الأكثر استخداماً لهذا المورد:"
                />
              </div>
              <div className={s.wide}>
                <DebitCreditBar
                  kind={kind}
                  reversed={reversed}
                  onReversedChange={setReversed}
                  value={amount}
                  onChange={setAmount}
                />
              </div>
            </>
          ) : (
            <div className={s.wide}>
              <TextAreaField
                label="نص الملاحظة"
                required
                value={note}
                onChange={setNote}
                maxLength={LIMITS.note}
                counter="near-limit"
              />
            </div>
          )}
          <div className={s.wide}>
            <Checkbox checked={confirm} onChange={setConfirm} danger>
              أؤكد أنها حركة مختلفة
            </Checkbox>
          </div>
          <div className={s.wide}>
            <button type="button" className={s.btn} onClick={() => setDialog(true)}>
              إرجاع 3 فواتير إلى «لم تدخل»
            </button>{" "}
            <span className={s.status} role="status">
              {status}
            </span>
          </div>
        </form>
        <ReasonDialog
          isOpen={dialog}
          count={3}
          onCancel={() => setDialog(false)}
          onConfirm={(r) => {
            setDialog(false);
            setStatus(`أُرجعت 3 فواتير. السبب: ${r.reason}${r.text ? ` — ${r.text}` : ""}`);
          }}
        />
      </section>

      <section className={s.sheet}>
        <h2 className={s.h2}>الفلترة والبحث والدخول</h2>
        <div className={s.form}>
          <div className={s.wide}>
            <PeriodFilter value={period} onChange={setPeriod} today={TODAY} />
          </div>
          <SearchField value={search} onChange={setSearch} />
          <IdentifierField value={ident} onChange={setIdent} />
          <PasswordField value={pw} onChange={setPw} mode="set" context={[ident]} />
        </div>
      </section>
    </div>
  );
}
