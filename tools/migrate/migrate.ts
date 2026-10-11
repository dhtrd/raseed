/**
 * نقل بيانات الإكسل إلى «رصيد» (المرحلة 3). يعمل على جهاز المالك فقط.
 *
 *   تقرير فقط (لا يكتب شيئاً):   node tools/migrate/migrate.ts --file <ملف.xlsm>
 *   النقل:                        ... --write   (مع RASEED_PROJECT_ID ومفتاح الخدمة، أو متغيرات المحاكي)
 *
 * كلمة مرور الإكسل تُطلب عند التشغيل ولا تُحفظ. البيانات تُنقل كما هي، والشاذ يُعلَّم للتعديل اليدوي.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ask, askHidden, checkEnv, closePrompt, fail } from "../admin/lib.ts";
import { buildPlan, type KnownIssue } from "./model.ts";
import { decrypt, isEncrypted, loadWorkbook } from "./workbook.ts";
import { renderReport } from "./report.ts";
import { findOwnerUid, writePlan } from "./writer.ts";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = arg("--file");
const write = args.includes("--write");
if (!file) fail("حدّد الملف: --file <مسار ملف الإكسل>");
if (!existsSync(file)) fail(`الملف غير موجود: ${file}`);

let buf: Buffer = readFileSync(file);
const sha256 = createHash("sha256").update(buf).digest("hex");
if (isEncrypted(buf)) {
  const pw = await askHidden("كلمة مرور ملف الإكسل (لن تظهر ولا تُحفظ): ");
  buf = await decrypt(buf, pw).catch((e: Error) => fail(e.message));
}

const known: KnownIssue[] = (() => {
  const p = existsSync("private/KNOWN-ISSUES.json") ? "private/KNOWN-ISSUES.json" : "KNOWN-ISSUES.json";
  return (JSON.parse(readFileSync(p, "utf8")) as { issues: KnownIssue[] }).issues;
})();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const wb = await loadWorkbook(buf).catch((e: Error) => fail(e.message));
const plan = buildPlan(wb.sheets, wb.summary, known, today);

const env = write ? checkEnv(process.env, { auth: false }) : null;
if (env && !env.ok) fail(env.error);
const target = !write
  ? "تقرير فقط (لا كتابة)"
  : env?.ok && env.emulator
    ? `المحاكي (${env.projectId})`
    : `الإنتاج (${env?.ok ? env.projectId : "؟"})`;

mkdirSync("migration-reports", { recursive: true });
const out = resolve(`migration-reports/report-${today}.html`);
writeFileSync(
  out,
  renderReport(plan, { source: file, sha256, generatedAt: new Date().toISOString(), target }),
);

const allOk = plan.blockers.length === 0 && plan.supplierChecks.every((c) => c.ok) && plan.period.ok;
console.log(
  `الحركات ${plan.totals.rows} · فواتير ${plan.totals.inv} · قيود ${plan.totals.misc} · بلا نوع ${plan.totals.untyped}`,
);
console.log(
  `مرتجع/استرداد ${plan.totals.reversed} · «دخلت Odoo» ${plan.totals.odooEntered} · للتعديل اليدوي ${plan.totals.flagged}`,
);
console.log(
  `مطابقة الموردين: ${plan.supplierChecks.filter((c) => c.ok).length}/${plan.supplierChecks.length} · فترة «الرئيسية»: ${plan.period.ok ? "مطابقة" : "فروق"}`,
);
for (const b of plan.blockers) console.error(`✗ ${b}`);
for (const u of plan.unmatchedKnown) console.warn(`⚠ حالة معروفة لم توجد: ${u}`);
console.log(`التقرير: ${out}`);

if (!write) {
  closePrompt();
  process.exit(allOk ? 0 : 2);
}
if (!allOk) fail("لا نقل مع موانع أو فروق في المطابقة. راجع التقرير.");
if (!env?.ok) fail("بيئة غير صالحة");

initializeApp(
  env.emulator
    ? { projectId: env.projectId }
    : { projectId: env.projectId, credential: applicationDefault() },
);
const db = getFirestore();
if (!env.emulator) {
  const c = (
    await ask(`سيُكتب ${plan.totals.rows} حركة في مشروع ${env.projectId} (الإنتاج). اكتب «انقل» للمتابعة: `)
  ).trim();
  if (c !== "انقل") fail("أُلغي. لم يُكتب شيء.");
}
const ownerUid = await findOwnerUid(db).catch((e: Error) => fail(e.message));
const res = await writePlan(db, plan, {
  ownerUid,
  sha256,
  onProgress: (d, t) => process.stdout.write(`\r  كُتب ${d} من ${t}`),
}).catch((e: Error) => fail(`\n${e.message}`));
console.log(`\n✓ اكتمل النقل: ${res.writes} كتابة · سجل التدقيق ${res.auditId}`);
closePrompt();
process.exit(0);
