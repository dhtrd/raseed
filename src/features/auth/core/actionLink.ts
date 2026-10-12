/**
 * رابط إجراءات Firebase المخصص («Customize action URL» → /auth/action): ?mode=resetPassword&oobCode=…
 * لا يُسجَّل الرمز ولا يُعرض (سر لمرة واحدة).
 */
export type ActionLink = { kind: "reset"; code: string } | { kind: "unsupported" } | { kind: "missing" };

const CODE_RE = /^[A-Za-z0-9_-]{10,400}$/;

export function parseActionLink(search: string): ActionLink {
  const q = new URLSearchParams(search);
  const mode = q.get("mode");
  const code = q.get("oobCode") ?? "";
  if (!mode || !CODE_RE.test(code)) return { kind: "missing" };
  return mode === "resetPassword" ? { kind: "reset", code } : { kind: "unsupported" };
}
