import type { EmailMessage } from "./index";

const PRODUCT_NAME = "Ayten Commerce";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta: { label: string; url: string }) {
  const url = escapeHtml(cta.url);
  return `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111827">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:28px;text-align:right">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
<p style="line-height:1.8;margin:0 0 24px">${body}</p>
<p><a href="${url}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>
<p style="font-size:12px;color:#6b7280;line-height:1.8;margin-top:24px">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr">${url}</span></p>
<p style="font-size:12px;color:#6b7280">إذا لم تطلب هذه الرسالة فتجاهلها.</p>
</div></body></html>`;
}

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  const subject = `أكّد بريدك الإلكتروني — ${PRODUCT_NAME}`;
  const body = `مرحباً ${escapeHtml(name)}، شكراً لتسجيلك. اضغط الزر لتأكيد بريدك الإلكتروني. الرابط صالح لمدة 24 ساعة.`;
  return {
    to,
    subject,
    tag: "email_verify",
    html: layout("تأكيد البريد الإلكتروني", body, { label: "تأكيد البريد", url }),
    text: `مرحباً ${name}، أكّد بريدك الإلكتروني عبر الرابط التالي (صالح 24 ساعة):\n${url}`,
  };
}

export function passwordResetMessage(to: string, name: string, url: string): EmailMessage {
  const subject = `إعادة تعيين كلمة المرور — ${PRODUCT_NAME}`;
  const body = `مرحباً ${escapeHtml(name)}، وصلنا طلب لإعادة تعيين كلمة المرور. الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة. بعد التغيير سيتم تسجيل خروجك من جميع الأجهزة.`;
  return {
    to,
    subject,
    tag: "password_reset",
    html: layout("إعادة تعيين كلمة المرور", body, { label: "تعيين كلمة مرور جديدة", url }),
    text: `مرحباً ${name}، لإعادة تعيين كلمة المرور افتح الرابط التالي (صالح ساعة واحدة):\n${url}`,
  };
}

export function passwordChangedMessage(to: string, name: string, supportUrl: string): EmailMessage {
  return {
    to,
    subject: `تم تغيير كلمة المرور — ${PRODUCT_NAME}`,
    tag: "password_changed",
    html: layout(
      "تم تغيير كلمة المرور",
      `مرحباً ${escapeHtml(name)}، تم تغيير كلمة مرور حسابك الآن. إذا لم تقم بذلك، أعد تعيين كلمة المرور فوراً وتواصل معنا.`,
      { label: "مراجعة أمان الحساب", url: supportUrl },
    ),
    text: `مرحباً ${name}، تم تغيير كلمة مرور حسابك. إذا لم تقم بذلك أعد تعيينها فوراً: ${supportUrl}`,
  };
}

export function invitationMessage(to: string, inviterName: string, storeName: string, roleLabel: string, url: string): EmailMessage {
  const who = inviterName ? `${escapeHtml(inviterName)} يدعوك` : "تمت دعوتك";
  return {
    to,
    subject: `دعوة للانضمام إلى فريق ${storeName} — ${PRODUCT_NAME}`,
    tag: "store_invitation",
    html: layout(
      "دعوة للانضمام إلى فريق متجر",
      `${who} للانضمام إلى فريق متجر <strong>${escapeHtml(storeName)}</strong> بدور <strong>${escapeHtml(roleLabel)}</strong>. الدعوة صالحة لمدة 7 أيام. إذا لم يكن لديك حساب فأنشئه بهذا البريد نفسه.`,
      { label: "قبول الدعوة", url },
    ),
    text: `${inviterName || "تمت دعوتك"} للانضمام إلى فريق متجر ${storeName} بدور ${roleLabel}. لقبول الدعوة (صالحة 7 أيام):\n${url}`,
  };
}
