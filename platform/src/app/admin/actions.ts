"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markInvoicePaid, processPayout, voidInvoice } from "@/server/admin/finance";
import { grantAdmin, revokeAdmin, saveSetting, savePlan, setDefaultPlan, setPlanArchived } from "@/server/admin/platform";
import { reactivateStore, revokeUserSessions, setStoreSubscription, suspendStore } from "@/server/admin/stores";
import { createAnnouncement, deleteAnnouncement, replyAsSupport, saveHelpArticle, updateTicketAdmin } from "@/server/admin/support";
import type { PlatformSettings } from "@/server/platform/settings";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

async function run(fn: (adminId: string) => Promise<unknown>, success: string, revalidate: string): Promise<FormState> {
  const session = await requireSession("/admin");
  try {
    await fn(session.user.id);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(revalidate, "layout");
  return { ok: true, message: success };
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

// Stores
export async function suspendStoreAction(storeId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => suspendStore(a, storeId, str(form, "reason"), meta), "تم إيقاف المتجر وإشعار التاجر.", "/admin");
}
export async function reactivateStoreAction(storeId: string, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => reactivateStore(a, storeId, meta), "أُعيد تفعيل المتجر.", "/admin");
}
export async function setSubscriptionAction(storeId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run(
    (a) => setStoreSubscription(a, storeId, { planId: str(form, "planId"), mode: str(form, "mode"), days: str(form, "days"), reason: str(form, "reason") }, meta),
    "تم تحديث اشتراك المتجر.",
    "/admin",
  );
}
export async function revokeSessionsAction(userId: string, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => revokeUserSessions(a, userId, meta), "تم تسجيل خروج الحساب من كل الأجهزة.", "/admin/merchants");
}

// Finance
export async function markInvoicePaidAction(invoiceId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => markInvoicePaid(a, invoiceId, { method: str(form, "method"), reference: str(form, "reference") }, meta), "تم تأكيد الدفع وتفعيل الاشتراك.", "/admin");
}
export async function voidInvoiceAction(invoiceId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => voidInvoice(a, invoiceId, str(form, "reason"), meta), "أُلغيت الفاتورة.", "/admin");
}
export async function processPayoutAction(payoutId: string, action: "approve" | "pay" | "reject", _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  const labels = { approve: "اعتُمد الطلب.", pay: "سُجّل التحويل وأُشعر التاجر.", reject: "رُفض الطلب وأُعيد المبلغ لرصيد التاجر." };
  return run((a) => processPayout(a, payoutId, action, { reference: str(form, "reference"), note: str(form, "note") }, meta), labels[action], "/admin");
}

// Plans
export async function savePlanAction(planId: string | null, _p: FormState, form: FormData) {
  const session = await requireSession("/admin");
  let id: string;
  try {
    const result = await savePlan(
      session.user.id,
      planId,
      {
        key: str(form, "key"),
        name: str(form, "name"),
        description: str(form, "description"),
        priceMonthly: str(form, "priceMonthly"),
        priceYearly: str(form, "priceYearly"),
        trialDays: str(form, "trialDays"),
        position: str(form, "position"),
        isPublic: form.get("isPublic") === "on",
        products: str(form, "products"),
        staff: str(form, "staff"),
        ordersPerMonth: str(form, "ordersPerMonth"),
        campaigns: form.get("campaigns") === "on",
        advancedReports: form.get("advancedReports") === "on",
        removeBranding: form.get("removeBranding") === "on",
      },
      await getRequestMeta(),
    );
    id = result.id;
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/admin/plans", "layout");
  if (!planId) redirect(`/admin/plans/${id}`);
  return { ok: true, message: "حُفظت الباقة. الأسعار الجديدة تنطبق على الفواتير الجديدة فقط." };
}
export async function setDefaultPlanAction(planId: string, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => setDefaultPlan(a, planId, meta), "أصبحت الباقة الافتراضية للمتاجر الجديدة.", "/admin/plans");
}
export async function archivePlanAction(planId: string, archived: boolean, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => setPlanArchived(a, planId, archived, meta), archived ? "أُرشفت الباقة ولن تُعرض للتجار." : "أُعيدت الباقة.", "/admin/plans");
}

// Support & content
export async function replyTicketAdminAction(ticketId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  const internal = form.get("internal") === "on";
  const status = str(form, "status") || undefined;
  return run((a) => replyAsSupport(a, ticketId, { body: str(form, "body"), internal, status }, meta), internal ? "أُضيفت ملاحظة داخلية." : "أُرسل الرد للتاجر.", "/admin/tickets");
}
export async function updateTicketAdminAction(ticketId: string, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => updateTicketAdmin(a, ticketId, { status: str(form, "status"), priority: str(form, "priority"), assignToMe: form.get("assignToMe") === "on" }, meta), "حُدّثت التذكرة.", "/admin/tickets");
}
export async function saveHelpArticleAction(articleId: string | null, _p: FormState, form: FormData) {
  const session = await requireSession("/admin");
  let id: string;
  try {
    const result = await saveHelpArticle(
      session.user.id,
      articleId,
      { title: str(form, "title"), slug: str(form, "slug"), category: str(form, "category"), body: str(form, "body"), position: str(form, "position"), published: form.get("published") === "on" },
      await getRequestMeta(),
    );
    id = result.id;
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/admin/help", "layout");
  if (!articleId) redirect(`/admin/help/${id}`);
  return { ok: true, message: "حُفظت المقالة." };
}
export async function createAnnouncementAction(_p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => createAnnouncement(a, { title: str(form, "title"), body: str(form, "body"), level: str(form, "level"), days: str(form, "days") }, meta), "نُشر الإعلان في لوحات التجار.", "/admin/announcements");
}
export async function deleteAnnouncementAction(id: string, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => deleteAnnouncement(a, id, meta), "حُذف الإعلان.", "/admin/announcements");
}

// Settings & admins
export async function saveSettingAction(key: keyof PlatformSettings, _p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  const input = Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")));
  return run((a) => saveSetting(a, key, input, meta), "حُفظت الإعدادات.", "/admin");
}
export async function grantAdminAction(_p: FormState, form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => grantAdmin(a, { email: str(form, "email"), role: str(form, "role") }, meta), "أُضيف المشرف.", "/admin/team");
}
export async function revokeAdminAction(userId: string, _p: FormState, _form: FormData) {
  const meta = await getRequestMeta();
  return run((a) => revokeAdmin(a, userId, meta), "أُزيلت الصلاحية.", "/admin/team");
}
