/**
 * عميل Dropbox صغير بـ fetch (بلا مكتبة إضافية). تطبيق Dropbox بصلاحية «مجلد التطبيق» فقط:
 * لا يرى غير مجلده (Apps/<اسم التطبيق>)، ولا يصل إلى بقية ملفات الحساب (أقل صلاحية ممكنة).
 * الرموز من أسرار GitHub عبر متغيرات البيئة، ولا تُطبع أبداً.
 */

export interface DropboxCreds {
  appKey: string;
  appSecret: string;
  refreshToken: string;
}

type Fetch = typeof fetch;

export function credsFromEnv(env: Record<string, string | undefined>): DropboxCreds {
  const appKey = env.DROPBOX_APP_KEY?.trim();
  const appSecret = env.DROPBOX_APP_SECRET?.trim();
  const refreshToken = env.DROPBOX_REFRESH_TOKEN?.trim();
  const missing = [
    !appKey && "DROPBOX_APP_KEY",
    !appSecret && "DROPBOX_APP_SECRET",
    !refreshToken && "DROPBOX_REFRESH_TOKEN",
  ].filter(Boolean);
  if (missing.length || !appKey || !appSecret || !refreshToken)
    throw new Error(`أسرار Dropbox ناقصة في إعدادات المستودع: ${missing.join("، ")}`);
  return { appKey, appSecret, refreshToken };
}

async function failOf(res: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error_summary?: unknown; error?: unknown };
    detail =
      typeof body.error_summary === "string"
        ? body.error_summary
        : typeof body.error === "string"
          ? body.error
          : "";
  } catch {
    /* نص غير JSON: يكفي رمز الحالة */
  }
  return new Error(`Dropbox ${what}: ${res.status}${detail ? ` ${detail}` : ""}`);
}

export class Dropbox {
  private token = "";
  private readonly creds: DropboxCreds;
  private readonly http: Fetch;
  constructor(creds: DropboxCreds, http: Fetch = fetch) {
    this.creds = creds;
    this.http = http;
  }

  private async auth(): Promise<string> {
    if (this.token) return this.token;
    const res = await this.http("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.creds.refreshToken,
        client_id: this.creds.appKey,
        client_secret: this.creds.appSecret,
      }),
    });
    if (!res.ok) throw await failOf(res, "تجديد رمز الدخول");
    const body = (await res.json()) as { access_token?: unknown };
    if (typeof body.access_token !== "string") throw new Error("Dropbox: لم يُعد رمز دخول.");
    this.token = body.access_token;
    return this.token;
  }

  private async rpc<T>(endpoint: string, arg: object, what: string): Promise<T> {
    const res = await this.http(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.auth()}`, "Content-Type": "application/json" },
      body: JSON.stringify(arg),
    });
    if (!res.ok) throw await failOf(res, what);
    return (await res.json()) as T;
  }

  /** يرفع ملفاً (حتى 150MB) إلى جذر مجلد التطبيق، ويستبدل ملف اليوم إن أعيد التشغيل */
  async upload(name: string, data: Buffer): Promise<void> {
    const res = await this.http("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.auth()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path: `/${name}`, mode: "overwrite", mute: true }),
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw await failOf(res, `رفع ${name}`);
  }

  /** أسماء الملفات في جذر مجلد التطبيق */
  async list(): Promise<string[]> {
    type Page = { entries: { ".tag": string; name: string }[]; cursor: string; has_more: boolean };
    const names: string[] = [];
    let page = await this.rpc<Page>("files/list_folder", { path: "" }, "قراءة المجلد");
    for (;;) {
      for (const e of page.entries) if (e[".tag"] === "file") names.push(e.name);
      if (!page.has_more) break;
      page = await this.rpc<Page>("files/list_folder/continue", { cursor: page.cursor }, "قراءة المجلد");
    }
    return names;
  }

  async remove(name: string): Promise<void> {
    await this.rpc("files/delete_v2", { path: `/${name}` }, `حذف ${name}`);
  }
}
