/**
 * تقرير المطابقة RTL (HTML مستقل). يحمل بيانات حقيقية، فيُكتب في migration-reports/ المستثنى من git.
 */
import type { Plan } from "./model.ts";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
const money = (h: number | null) =>
  h === null
    ? "—"
    : (h / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (x: number) => x.toLocaleString("en-US");
const ok = (b: boolean) => (b ? '<span class="ok">مطابق</span>' : '<span class="bad">غير مطابق</span>');

const LABEL: Record<string, string> = {
  untyped: "بلا نوع مستند",
  duplicate_ref: "رقم مرجعي مكرر",
  ref_length: "طول المرجع",
  ref_mismatch: "الرقم المرجعي لا يطابق المحسوب",
  no_amount: "بلا مبلغ",
  no_ref: "بلا مرجع",
  both_sides: "مدين ودائن معاً",
  voucher_text: "رقم سند نصي",
  details_long: "تفاصيل طويلة",
  future_date: "تاريخ مستقبلي",
  odoo_on_journal: "قيد مُعلَّم «دخلت Odoo»",
  known_swapped_day_month: "معروف: تاريخ مقلوب",
  known_duplicate_of_row_291: "معروف: مكرر (6025)",
  known_same_voucher_two_refs: "معروف: سند بمرجعين (6080)",
  known_same_voucher_two_suppliers: "معروف: سند عند موردين (6227)",
};

export function renderReport(
  p: Plan,
  meta: { source: string; sha256: string; generatedAt: string; target: string },
): string {
  const byCode = new Map<
    string,
    { sheet: string; row: number; refNo: string; date: string; text: string }[]
  >();
  for (const e of p.entries)
    for (const i of e.issues) {
      const list = byCode.get(i.code) ?? [];
      list.push({ sheet: e.sheet.trim(), row: e.row, refNo: e.refNo, date: e.date, text: i.text });
      byCode.set(i.code, list);
    }
  const allOk = p.blockers.length === 0 && p.supplierChecks.every((c) => c.ok) && p.period.ok;
  const sum = (k: "debit" | "credit") => p.supplierChecks.reduce((a, c) => a + c[k], 0);

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>رصيد · تقرير مطابقة النقل</title>
<style>
:root{--paper:#EEF2F5;--surface:#fff;--ink:#1B2A44;--ink-2:#46546D;--rule:#C9D3DE;--neg:#A3242B;--accent:#2B4C7E;--wash:#E3EAF4;--neg-wash:#F8E8E9;--margin:#E2B6B9}
@media (prefers-color-scheme:dark){:root{--paper:#141B26;--surface:#1C2533;--ink:#E3E8EF;--ink-2:#AAB5C6;--rule:#33415A;--neg:#F08A8F;--accent:#8FB0E6;--wash:#243452;--neg-wash:#3A2530;--margin:#5A3A46;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Naskh Arabic","Geeza Pro",serif;font-size:16px;line-height:1.7;padding:20px 16px 60px}
.wrap{max-width:1100px;margin:auto;background:var(--surface);border:1px solid var(--rule);border-inline-start:4px double var(--margin);padding:24px clamp(14px,3vw,30px)}
h1{margin:0;font-size:26px}h2{font-size:19px;margin:28px 0 8px;padding-bottom:6px;border-bottom:3px double var(--ink)}
.meta{color:var(--ink-2);font-size:14px}.num{font-family:"Source Serif 4",Georgia,serif;direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
.verdict{margin:16px 0;padding:12px 14px;border-inline-start:4px solid var(--accent);background:var(--wash)}.verdict.bad{border-color:var(--neg);background:var(--neg-wash)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0}.stats div{border-bottom:1px solid var(--rule);padding:6px 0}.stats b{display:block;font-size:24px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:15px}th{text-align:start;color:var(--ink-2);font-size:13.5px;border-bottom:3px double var(--ink);padding:6px 8px;white-space:nowrap}
td{border-bottom:1px solid var(--rule);padding:6px 8px;vertical-align:top}td.m{text-align:left}tfoot td{font-weight:700;border-top:1px solid var(--ink);border-bottom:4px double var(--ink)}
.ok{color:var(--accent);font-weight:700}.bad{color:var(--neg);font-weight:700}ul{margin:6px 0}details{margin:8px 0}summary{cursor:pointer;font-weight:700}
</style></head><body><div class="wrap">
<h1>تقرير مطابقة النقل من الإكسل</h1>
<p class="meta">الملف: ${esc(meta.source)} · بصمة SHA-256: <span class="num">${meta.sha256.slice(0, 16)}…</span> · ${esc(meta.generatedAt)} · الهدف: ${esc(meta.target)}</p>
<div class="verdict ${allOk ? "" : "bad"}"><b>${allOk ? "المطابقة كاملة: المجاميع تطابق الإكسل لكل مورد ولفترة «الرئيسية»." : "توجد فروق أو موانع: راجعها قبل أي نقل للإنتاج."}</b></div>
<div class="stats">
<div>الحركات<b class="num">${n(p.totals.rows)}</b></div><div>فواتير<b class="num">${n(p.totals.inv)}</b></div>
<div>قيود<b class="num">${n(p.totals.misc)}</b></div><div>بلا نوع<b class="num">${n(p.totals.untyped)}</b></div>
<div>مرتجع/استرداد<b class="num">${n(p.totals.reversed)}</b></div><div>فواتير «دخلت Odoo»<b class="num">${n(p.totals.odooEntered)}</b></div>
<div>للتعديل اليدوي<b class="num">${n(p.totals.flagged)}</b></div><div>الموردون<b class="num">${n(p.suppliers.length)}</b></div>
</div>
${p.blockers.length ? `<h2>موانع النقل</h2><ul>${p.blockers.map((b) => `<li class="bad">${esc(b)}</li>`).join("")}</ul>` : ""}
${p.unmatchedKnown.length ? `<h2>حالات معروفة لم أجدها في الملف</h2><ul>${p.unmatchedKnown.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
<h2>المطابقة لكل مورد (كل الفترات، مقابل رأس الورقة)</h2>
<div class="tw"><table><thead><tr><th>المورد</th><th>الحركات</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>مدين الإكسل</th><th>دائن الإكسل</th><th>النتيجة</th></tr></thead><tbody>
${p.supplierChecks.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${n(c.count)}</td><td class="m num">${money(c.debit)}</td><td class="m num">${money(c.credit)}</td><td class="m num">${money(c.debit - c.credit)}</td><td class="m num">${money(c.headerDebit)}</td><td class="m num">${money(c.headerCredit)}</td><td>${ok(c.ok)}</td></tr>`).join("")}
</tbody><tfoot><tr><td>الإجمالي</td><td class="num">${n(p.totals.rows)}</td><td class="m num">${money(sum("debit"))}</td><td class="m num">${money(sum("credit"))}</td><td class="m num">${money(sum("debit") - sum("credit"))}</td><td colspan="3"></td></tr></tfoot></table></div>
<h2>المطابقة مع ورقة «الرئيسية» (<span class="num">${esc(p.period.from ?? "؟")}</span> إلى <span class="num">${esc(p.period.to ?? "؟")}</span>)</h2>
<div class="tw"><table><thead><tr><th>المورد</th><th>السابق</th><th>مدين</th><th>دائن</th><th>النهائي</th><th>السابق (الإكسل)</th><th>مدين (الإكسل)</th><th>دائن (الإكسل)</th><th>النتيجة</th></tr></thead><tbody>
${p.period.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="m num">${money(l.prev)}</td><td class="m num">${money(l.debit)}</td><td class="m num">${money(l.credit)}</td><td class="m num">${money(l.final)}</td><td class="m num">${money(l.excel.prev)}</td><td class="m num">${money(l.excel.debit)}</td><td class="m num">${money(l.excel.credit)}</td><td>${ok(l.ok)}</td></tr>`).join("")}
</tbody><tfoot><tr><td>الإجمالي</td>${(["prev", "debit", "credit", "final"] as const).map((k) => `<td class="m num">${money(p.period.lines.reduce((a, l) => a + l[k], 0))}</td>`).join("")}<td colspan="4"></td></tr></tfoot></table></div>
<h2>للتعديل اليدوي في مركز المراجعة (<span class="num">${n(p.totals.flagged)}</span> حركة)</h2>
<p class="meta">تُنقل كما هي دون تصحيح، وتظهر في مركز المراجعة بسببها. الحركة الواحدة قد تحمل أكثر من سبب.</p>
${[...byCode.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(
    ([code, list]) =>
      `<details${list.length <= 20 ? " open" : ""}><summary>${esc(LABEL[code] ?? code)} · <span class="num">${n(list.length)}</span></summary><div class="tw"><table><thead><tr><th>الورقة</th><th>الصف</th><th>التاريخ</th><th>الرقم المرجعي</th><th>السبب</th></tr></thead><tbody>${list.map((x) => `<tr><td>${esc(x.sheet)}</td><td class="num">${x.row}</td><td class="num">${esc(x.date)}</td><td class="num">${esc(x.refNo)}</td><td>${esc(x.text)}</td></tr>`).join("")}</tbody></table></div></details>`,
  )
  .join("")}
</div></body></html>`;
}
