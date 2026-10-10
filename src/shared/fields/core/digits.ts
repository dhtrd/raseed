/** يحوّل الأرقام الهندية (٠–٩) والفارسية (۰–۹) إلى أرقام لاتينية. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

export function isDigits(s: string): boolean {
  return /^\d+$/.test(s);
}
