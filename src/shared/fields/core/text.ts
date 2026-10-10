/** يزيل أحرف التحكم من النص الملصوق، ويحافظ على الأسطر إن كان الحقل متعدد الأسطر. */
export function cleanPastedText(text: string, multiline: boolean): string {
  // eslint-disable-next-line no-control-regex -- إزالة أحرف التحكم مقصودة
  const noCtrl = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ");
  return multiline ? noCtrl : noCtrl.replace(/\n+/g, " ");
}

/** يطبّع النص العربي للبحث: يتجاهل التشكيل والتطويل والهمزات والتاء المربوطة والألف المقصورة. */
export function normalizeForSearch(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

export const LIMITS = { details: 200, note: 1000, otherReason: 300, supplierName: 100 } as const;
