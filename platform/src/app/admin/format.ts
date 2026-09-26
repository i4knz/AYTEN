export const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
export const dateTimeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export const STORE_STATUS = {
  draft: { label: "مسودة", tone: "neutral" },
  published: { label: "منشور", tone: "success" },
  paused: { label: "متوقف مؤقتاً", tone: "warning" },
  suspended: { label: "موقوف", tone: "danger" },
} as const;

export const SUB_TONE = { trialing: "info", active: "success", past_due: "warning", expired: "danger", cancelled: "neutral" } as const;

export function num(n: number) {
  return n.toLocaleString("en");
}
