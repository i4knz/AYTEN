"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";
import {
  contrastWarnings,
  defaultSection,
  FEATURE_ICONS,
  FONTS,
  PRESETS,
  RADII,
  SECTION_LABELS,
  themeCssVars,
  type Section,
  type SectionType,
  type ThemeConfig,
} from "@/themes/config";
import { RenderSections, type StorefrontData } from "@/themes/sections";
import { discardDraftAction, publishThemeAction, saveDraftAction, uploadThemeImageAction } from "./actions";

const inputCls = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";
type Tab = "presets" | "style" | "sections" | "footer";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-soft">
      {label}
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <span className="flex items-center gap-2">
        <span className="ltr font-mono text-xs text-ink-soft">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line" aria-label={label} />
      </span>
    </label>
  );
}

function ImageField({ storeId, value, mediaBase, onChange }: { storeId: string; value: string | null; mediaBase: string; onChange: (key: string | null) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-ink-soft">الصورة</span>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaBase + value} alt="" className="h-24 w-full rounded-lg object-cover" />
      )}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="رفع صورة القسم"
          disabled={pending}
          className="min-w-0 flex-1 text-xs file:me-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("image", file);
            start(async () => {
              const r = await uploadThemeImageAction(storeId, fd);
              if (r.ok && r.key) {
                setError(null);
                onChange(r.key);
              } else setError(r.message ?? "تعذر الرفع");
            });
          }}
        />
        {value && (
          <button type="button" className="text-red-700" onClick={() => onChange(null)}>
            إزالة
          </button>
        )}
      </div>
      {pending && <span className="text-ink-soft">جارٍ الرفع…</span>}
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}

function SectionFields({ section, update, storeId, mediaBase, categories }: { section: Section; update: (s: Section) => void; storeId: string; mediaBase: string; categories: { name: string; slug: string }[] }) {
  // Settings are edited generically but always re-validated on the server.
  const set = (patch: Record<string, unknown>) => update({ ...section, settings: { ...section.settings, ...patch } } as Section);
  const s = section.settings as Record<string, unknown>;
  const text = (key: string, label: string, max: number, area = false) => (
    <Row label={label}>
      {area ? (
        <textarea value={String(s[key] ?? "")} maxLength={max} rows={3} onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
      ) : (
        <input value={String(s[key] ?? "")} maxLength={max} onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
      )}
    </Row>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <Row label={label}>
      <select value={String(s[key])} onChange={(e) => set({ [key]: e.target.value })} className={inputCls}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  );
  const num = (key: string, label: string, min: number, max: number) => (
    <Row label={`${label} (${s[key]})`}>
      <input type="range" min={min} max={max} value={Number(s[key])} onChange={(e) => set({ [key]: Number(e.target.value) })} />
    </Row>
  );
  const link = (key: string, label: string) => (
    <Row label={label}>
      <input value={String(s[key] ?? "")} maxLength={300} dir="ltr" placeholder="/categories/… أو https://…" onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
    </Row>
  );

  switch (section.type) {
    case "announcement":
      return <>{text("text", "النص", 140)}{link("link", "الرابط (اختياري)")}</>;
    case "hero":
      return (
        <>
          {text("title", "العنوان", 80)}
          {text("subtitle", "النص الفرعي", 200, true)}
          {text("buttonText", "نص الزر", 30)}
          {link("buttonLink", "رابط الزر")}
          <ImageField storeId={storeId} value={section.settings.image} mediaBase={mediaBase} onChange={(k) => set({ image: k })} />
          {select("align", "المحاذاة", [["start", "بداية"], ["center", "وسط"]])}
          {select("height", "الارتفاع", [["sm", "صغير"], ["md", "متوسط"], ["lg", "كبير"]])}
          {num("overlay", "تعتيم الصورة %", 0, 80)}
        </>
      );
    case "categories":
      return <>{text("title", "العنوان", 60)}{select("style", "الشكل", [["circles", "دوائر"], ["cards", "بطاقات"]])}</>;
    case "products":
      return (
        <>
          {text("title", "العنوان", 60)}
          {select("source", "المصدر", [["latest", "الأحدث"], ["sale", "المخفّضة"], ["category", "من تصنيف"]])}
          {section.settings.source === "category" && select("categorySlug", "التصنيف", [["", "اختر"], ...categories.map((c) => [c.slug, c.name] as [string, string])])}
          {num("limit", "عدد المنتجات", 2, 24)}
          {num("columns", "الأعمدة على الشاشة الكبيرة", 2, 5)}
        </>
      );
    case "image_text":
      return (
        <>
          {text("title", "العنوان", 80)}
          {text("body", "النص", 600, true)}
          <ImageField storeId={storeId} value={section.settings.image} mediaBase={mediaBase} onChange={(k) => set({ image: k })} />
          {select("imageSide", "موضع الصورة", [["start", "يمين"], ["end", "يسار"]])}
          {text("buttonText", "نص الزر (اختياري)", 30)}
          {link("buttonLink", "رابط الزر")}
        </>
      );
    case "features":
      return (
        <div className="flex flex-col gap-2">
          {section.settings.items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-lg border border-line p-2">
              <div className="flex gap-1">
                <select
                  value={item.icon}
                  aria-label="الأيقونة"
                  onChange={(e) => set({ items: section.settings.items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}
                  className={inputCls}
                >
                  {FEATURE_ICONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {{ truck: "توصيل", shield: "أمان", return: "استرجاع", support: "دعم", gift: "هدية", clock: "وقت" }[ic]}
                    </option>
                  ))}
                </select>
                <button type="button" className="px-2 text-red-700" aria-label="حذف الميزة" onClick={() => set({ items: section.settings.items.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <input value={item.title} maxLength={40} placeholder="العنوان" aria-label="عنوان الميزة" onChange={(e) => set({ items: section.settings.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className={inputCls} />
              <input value={item.body} maxLength={100} placeholder="الوصف" aria-label="وصف الميزة" onChange={(e) => set({ items: section.settings.items.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} className={inputCls} />
            </div>
          ))}
          {section.settings.items.length < 4 && (
            <button type="button" className="text-xs text-brand" onClick={() => set({ items: [...section.settings.items, { icon: "gift", title: "", body: "" }] })}>
              + إضافة ميزة
            </button>
          )}
        </div>
      );
    case "reviews":
      return <>{text("title", "العنوان", 60)}{num("limit", "العدد", 2, 12)}<p className="text-xs text-ink-soft">تظهر التقييمات الموثقة المعتمدة فقط (4 نجوم فأكثر).</p></>;
    case "faq":
      return (
        <div className="flex flex-col gap-2">
          {text("title", "العنوان", 60)}
          {section.settings.items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-lg border border-line p-2">
              <input value={item.q} maxLength={150} placeholder="السؤال" aria-label="السؤال" onChange={(e) => set({ items: section.settings.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={inputCls} />
              <textarea value={item.a} maxLength={600} rows={2} placeholder="الإجابة" aria-label="الإجابة" onChange={(e) => set({ items: section.settings.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} className={inputCls} />
              <button type="button" className="self-end text-xs text-red-700" onClick={() => set({ items: section.settings.items.filter((_, j) => j !== i) })}>
                حذف
              </button>
            </div>
          ))}
          {section.settings.items.length < 12 && (
            <button type="button" className="text-xs text-brand" onClick={() => set({ items: [...section.settings.items, { q: "", a: "" }] })}>
              + إضافة سؤال
            </button>
          )}
        </div>
      );
    case "rich_text":
      return <>{text("title", "العنوان", 80)}{text("body", "النص", 2000, true)}{select("align", "المحاذاة", [["center", "وسط"], ["start", "بداية"]])}</>;
    case "whatsapp_cta":
      return <>{text("title", "العنوان", 80)}{text("body", "النص", 200, true)}{text("buttonText", "نص الزر", 30)}</>;
  }
}

export function ThemeEditor({
  storeId,
  storeName,
  storeUrl,
  initial,
  hasDraft,
  data,
  categories,
}: {
  storeId: string;
  storeName: string;
  storeUrl: string;
  initial: ThemeConfig;
  hasDraft: boolean;
  data: StorefrontData;
  categories: { name: string; slug: string }[];
}) {
  const [theme, setTheme] = useState<ThemeConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("sections");
  const [open, setOpen] = useState<string | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const update = (t: ThemeConfig) => {
    setTheme(t);
    setDirty(true);
    setMessage(null);
  };
  const updateSection = (s: Section) => update({ ...theme, sections: theme.sections.map((x) => (x.id === s.id ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...theme.sections];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    update({ ...theme, sections: next });
  };
  const warnings = contrastWarnings(theme);
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>, clean: boolean) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: !!r.ok, text: r.message ?? "" });
      if (r.ok && clean) setDirty(false);
    });

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-8 lg:flex-row">
      <aside className="flex flex-col border-b border-line bg-surface lg:w-96 lg:shrink-0 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between gap-2 border-b border-line p-3">
          <h1 className="font-bold">تصميم المتجر</h1>
          <span className="text-xs text-ink-soft">{dirty ? "تغييرات غير محفوظة" : hasDraft ? "مسودة محفوظة" : "مطابق للمنشور"}</span>
        </div>
        <nav className="grid grid-cols-4 border-b border-line text-xs" aria-label="أقسام المحرر">
          {(
            [
              ["presets", "القوالب"],
              ["style", "الألوان والخط"],
              ["sections", "الأقسام"],
              ["footer", "الرأس والتذييل"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className="border-b-2 border-transparent px-1 py-2.5 aria-pressed:border-brand aria-pressed:font-semibold">
              {l}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-3 lg:max-h-[calc(100dvh-12rem)]">
          {tab === "presets" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-soft">اختيار قالب يستبدل الألوان والخط والأقسام. يمكنك تعديل كل شيء بعدها.</p>
              {PRESETS.map((p) => {
                const t = p.build();
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => confirm(`تطبيق قالب «${p.label}»؟ ستُستبدل الأقسام الحالية.`) && update(p.build())}
                    className="flex items-center gap-3 rounded-xl border border-line p-3 text-start hover:border-brand aria-pressed:border-brand"
                    aria-pressed={theme.preset === p.key}
                  >
                    <span className="flex overflow-hidden rounded-lg border border-line">
                      {[t.colors.primary, t.colors.background, t.colors.surface, t.colors.text].map((c) => (
                        <span key={c} className="size-6" style={{ background: c }} />
                      ))}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{p.label}</span>
                      <span className="block text-xs text-ink-soft">{p.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "style" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <ColorField label="اللون الأساسي (الأزرار)" value={theme.colors.primary} onChange={(v) => update({ ...theme, colors: { ...theme.colors, primary: v } })} />
                <ColorField label="الخلفية" value={theme.colors.background} onChange={(v) => update({ ...theme, colors: { ...theme.colors, background: v } })} />
                <ColorField label="خلفية البطاقات" value={theme.colors.surface} onChange={(v) => update({ ...theme, colors: { ...theme.colors, surface: v } })} />
                <ColorField label="النص" value={theme.colors.text} onChange={(v) => update({ ...theme, colors: { ...theme.colors, text: v } })} />
                <ColorField label="النص الثانوي" value={theme.colors.muted} onChange={(v) => update({ ...theme, colors: { ...theme.colors, muted: v } })} />
              </div>
              {warnings.map((w) => (
                <Alert key={w} tone="warning">{w}</Alert>
              ))}
              <Row label="الخط">
                <select value={theme.font} onChange={(e) => update({ ...theme, font: e.target.value as ThemeConfig["font"] })} className={inputCls}>
                  {Object.entries(FONTS).map(([k, f]) => (
                    <option key={k} value={k}>{f.label}</option>
                  ))}
                </select>
              </Row>
              <Row label="استدارة الزوايا">
                <select value={theme.radius} onChange={(e) => update({ ...theme, radius: e.target.value as ThemeConfig["radius"] })} className={inputCls}>
                  {Object.keys(RADII).map((k) => (
                    <option key={k} value={k}>{{ none: "حادة", sm: "خفيفة", md: "متوسطة", lg: "كبيرة", full: "دائرية" }[k]}</option>
                  ))}
                </select>
              </Row>
              <Row label="شكل صور المنتجات">
                <select value={theme.productCard.aspect} onChange={(e) => update({ ...theme, productCard: { ...theme.productCard, aspect: e.target.value as "square" | "portrait" } })} className={inputCls}>
                  <option value="square">مربعة</option>
                  <option value="portrait">طولية</option>
                </select>
              </Row>
              <Row label="بطاقة المنتج">
                <select value={theme.productCard.style} onChange={(e) => update({ ...theme, productCard: { ...theme.productCard, style: e.target.value as "plain" | "card" } })} className={inputCls}>
                  <option value="plain">بسيطة</option>
                  <option value="card">داخل بطاقة</option>
                </select>
              </Row>
            </div>
          )}

          {tab === "sections" && (
            <div className="flex flex-col gap-2">
              {theme.sections.map((s, i) => (
                <div key={s.id} className={`rounded-xl border ${open === s.id ? "border-brand" : "border-line"}`}>
                  <div className="flex items-center gap-1 p-2">
                    <button type="button" className="min-w-0 flex-1 truncate text-start text-sm font-medium" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                      <span className={s.visible ? "" : "text-ink-faint line-through"}>{SECTION_LABELS[s.type]}</span>
                    </button>
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30" aria-label="تحريك للأعلى"><ArrowUp className="size-4" /></button>
                    <button type="button" disabled={i === theme.sections.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30" aria-label="تحريك للأسفل"><ArrowDown className="size-4" /></button>
                    <button type="button" onClick={() => updateSection({ ...s, visible: !s.visible })} className="p-1" aria-label={s.visible ? "إخفاء القسم" : "إظهار القسم"}>
                      {s.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                    <button type="button" onClick={() => confirm("حذف القسم؟") && update({ ...theme, sections: theme.sections.filter((x) => x.id !== s.id) })} className="p-1 text-red-700" aria-label="حذف القسم">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {open === s.id && (
                    <div className="flex flex-col gap-2 border-t border-line p-3">
                      <SectionFields section={s} update={updateSection} storeId={storeId} mediaBase={data.mediaBase} categories={categories} />
                    </div>
                  )}
                </div>
              ))}
              {theme.sections.length < 20 && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <Plus className="size-4 text-brand" aria-hidden />
                  <select
                    value=""
                    aria-label="إضافة قسم"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const sec = defaultSection(e.target.value as SectionType);
                      update({ ...theme, sections: [...theme.sections, sec] });
                      setOpen(sec.id);
                    }}
                    className={inputCls}
                  >
                    <option value="">إضافة قسم…</option>
                    {Object.entries(SECTION_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {tab === "footer" && (
            <div className="flex flex-col gap-3">
              <Row label="محاذاة الشعار في الترويسة">
                <select value={theme.header.align} onChange={(e) => update({ ...theme, header: { ...theme.header, align: e.target.value as "start" | "center" } })} className={inputCls}>
                  <option value="start">بداية</option>
                  <option value="center">وسط</option>
                </select>
              </Row>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={theme.header.showCategories} onChange={(e) => update({ ...theme, header: { ...theme.header, showCategories: e.target.checked } })} className="accent-brand" />
                إظهار التصنيفات أسفل الترويسة
              </label>
              <Row label="نبذة في التذييل">
                <textarea value={theme.footer.about} maxLength={300} rows={3} onChange={(e) => update({ ...theme, footer: { ...theme.footer, about: e.target.value } })} className={inputCls} />
              </Row>
              {(["instagram", "tiktok", "snapchat", "x"] as const).map((k) => (
                <Row key={k} label={{ instagram: "إنستغرام", tiktok: "تيك توك", snapchat: "سناب شات", x: "إكس" }[k] + " (اسم المستخدم)"}>
                  <input value={theme.footer[k]} maxLength={60} dir="ltr" onChange={(e) => update({ ...theme, footer: { ...theme.footer, [k]: e.target.value.replace(/[^\w.@-]/g, "") } })} className={inputCls} />
                </Row>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-line p-3">
          {message && <Alert tone={message.ok ? "success" : "error"}>{message.text}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => run(() => publishThemeAction(storeId, theme), true)}>
              نشر التصميم
            </Button>
            <Button type="button" tone="secondary" disabled={pending || !dirty} onClick={() => run(() => saveDraftAction(storeId, theme), true)}>
              حفظ كمسودة
            </Button>
            {hasDraft && !dirty && (
              <Button type="button" tone="ghost" disabled={pending} onClick={() => confirm("تجاهل المسودة والعودة للتصميم المنشور؟") && start(() => discardDraftAction(storeId))}>
                تجاهل المسودة
              </Button>
            )}
          </div>
          <a href={storeUrl} target="_blank" rel="noopener" className="text-xs text-brand">عرض المتجر المنشور ↗</a>
        </div>
      </aside>

      <section className="flex flex-1 flex-col bg-muted" aria-label="معاينة">
        <div className="flex items-center justify-center gap-1 p-2">
          <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} className="rounded-lg p-2 aria-pressed:bg-surface" aria-label="معاينة الجوال"><Smartphone className="size-4" /></button>
          <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} className="rounded-lg p-2 aria-pressed:bg-surface" aria-label="معاينة الكمبيوتر"><Monitor className="size-4" /></button>
        </div>
        <div className="flex flex-1 justify-center overflow-auto px-2 pb-4">
          <div
            className={`overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-sm ${device === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-6xl"}`}
            style={{ ...themeCssVars(theme), fontFamily: "var(--font-store)" } as CSSProperties}
          >
            <div className={`flex items-center gap-2 border-b border-line px-4 py-3 ${theme.header.align === "center" ? "justify-center" : ""}`}>
              <span className="flex size-9 items-center justify-center rounded-(--radius) bg-(--store) font-bold text-(--on-store)">{storeName.slice(0, 1)}</span>
              <span className="font-bold">{storeName}</span>
            </div>
            <div className="px-4 py-6">
              <RenderSections theme={theme} data={data} preview />
            </div>
            <div className="border-t border-line bg-muted px-4 py-4 text-xs text-ink-soft">{theme.footer.about || `© ${storeName}`}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
