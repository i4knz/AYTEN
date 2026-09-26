// Upcoming retail occasions in Saudi Arabia. Hijri dates use the Umm al-Qura
// calendar via Intl; religious dates announced by moon sighting can differ by
// a day, and the UI says so. Gregorian dates are fixed.

export interface Occasion {
  key: string;
  title: string;
  date: Date;
  daysLeft: number;
  tip: string;
  approximate: boolean;
  couponCode?: string;
}

const HIJRI = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });

function hijriParts(d: Date) {
  const parts = HIJRI.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: get("day"), month: get("month") };
}

const HIJRI_OCCASIONS = [
  { key: "ramadan", month: 9, day: 1, title: "بداية شهر رمضان", tip: "جهّز عروض رمضان وسلال الهدايا قبلها بأسبوعين؛ الطلبات تزيد في الأسبوع الأول والعشر الأواخر.", coupon: "RAMADAN" },
  { key: "eid_fitr", month: 10, day: 1, title: "عيد الفطر", tip: "أعلن آخر موعد للطلب يضمن التوصيل قبل العيد، وفعّل كوبون العيد.", coupon: "EID" },
  { key: "hajj_season", month: 12, day: 1, title: "بداية ذي الحجة", tip: "موسم هدايا ومستلزمات الحج والأضاحي.", coupon: undefined },
  { key: "eid_adha", month: 12, day: 10, title: "عيد الأضحى", tip: "عروض العيد وهدايا العائلة؛ راجع مواعيد الشحن مع شركات التوصيل.", coupon: "ADHA" },
  { key: "hijri_new_year", month: 1, day: 1, title: "رأس السنة الهجرية", tip: "فرصة لرسالة تهنئة لعملائك مع عرض بسيط.", coupon: undefined },
] as const;

function fixed(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -3)); // midnight Riyadh
}

function lastFridayOfNovember(year: number) {
  const d = new Date(Date.UTC(year, 10, 30, 12));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return fixed(year, 11, d.getUTCDate());
}

export function upcomingOccasions(now = new Date(), horizonDays = 120): Occasion[] {
  const DAY = 86_400_000;
  const today = new Date(Math.floor((now.getTime() + 3 * 3600_000) / DAY) * DAY - 3 * 3600_000);
  const result: Occasion[] = [];
  const add = (o: Omit<Occasion, "daysLeft">) => {
    const daysLeft = Math.round((o.date.getTime() - today.getTime()) / DAY);
    if (daysLeft >= 0 && daysLeft <= horizonDays && !result.some((r) => r.key === o.key)) result.push({ ...o, daysLeft });
  };

  // Hijri: walk day by day through the horizon.
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(today.getTime() + i * DAY + 12 * 3600_000);
    const h = hijriParts(d);
    for (const o of HIJRI_OCCASIONS) {
      if (h.month === o.month && h.day === o.day) {
        add({ key: o.key, title: o.title, date: new Date(today.getTime() + i * DAY), tip: o.tip, approximate: true, couponCode: o.coupon });
      }
    }
  }

  const y = today.getUTCFullYear();
  for (const year of [y, y + 1]) {
    add({ key: `founding_${year}`, title: "يوم التأسيس", date: fixed(year, 2, 22), tip: "عروض بالطابع الوطني وتغليف خاص.", approximate: false, couponCode: "FOUNDING" });
    add({ key: `national_${year}`, title: "اليوم الوطني السعودي", date: fixed(year, 9, 23), tip: "من أكبر مواسم التخفيضات؛ ابدأ الإعلان قبلها بأسبوع.", approximate: false, couponCode: "SAUDI" });
    add({ key: `mothers_${year}`, title: "يوم الأم", date: fixed(year, 3, 21), tip: "هدايا وبطاقات إهداء.", approximate: false });
    add({ key: `singles_${year}`, title: "عروض 11.11", date: fixed(year, 11, 11), tip: "موسم تسوق إلكتروني عالمي يتابعه العملاء في المنطقة.", approximate: false, couponCode: "1111" });
    add({ key: `white_friday_${year}`, title: "الجمعة البيضاء", date: lastFridayOfNovember(year), tip: "أعلى موسم تخفيضات في السنة؛ جهّز المخزون والشحن مسبقاً.", approximate: false, couponCode: "WHITEFRIDAY" });
    add({ key: `new_year_${year}`, title: "رأس السنة الميلادية", date: fixed(year + 1, 1, 1), tip: "عروض نهاية العام.", approximate: false });
  }

  // Government salaries in Saudi Arabia are paid on the 27th of each Gregorian month
  // (moved to a working day when it falls on a weekend). [Approximate]
  for (let m = 0; m < 5; m++) {
    const d = new Date(Date.UTC(y, today.getUTCMonth() + m, 27, -3));
    add({ key: `salary_${d.getUTCFullYear()}_${d.getUTCMonth() + 1}`, title: "صرف رواتب الموظفين", date: d, tip: "استعد لموجة الإنفاق بعد الراتب بعروض جذابة على منتجاتك.", approximate: true });
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}
