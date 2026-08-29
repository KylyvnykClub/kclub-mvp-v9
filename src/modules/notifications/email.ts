import { Resend } from "resend";
import { env } from "@/env";

const resend = env.server.RESEND_API_KEY
  ? new Resend(env.server.RESEND_API_KEY)
  : null;

type Locale = "en" | "ru" | "uk";

const PAYMENT_FAILED_SUBJECTS: Record<Locale, string> = {
  en: "Action needed: your KYLYVNYK CLUB payment failed",
  ru: "Требуется действие: платёж KYLYVNYK CLUB не прошёл",
  uk: "Потрібна дія: платіж KYLYVNYK CLUB не пройшов",
};

const PAYMENT_FAILED_BODIES: Record<Locale, (name: string) => string> = {
  en: (name) =>
    `Hi ${name},\n\nYour latest payment for KYLYVNYK CLUB could not be processed. Your VIP access remains active while we retry over the next 14 days.\n\nPlease update your payment method in the billing portal to avoid losing access.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (name) =>
    `Привет, ${name}!\n\nВаш последний платёж за KYLYVNYK CLUB не прошёл. Ваш VIP-доступ сохраняется на время повторных попыток в течение 14 дней.\n\nПожалуйста, обновите способ оплаты в личном кабинете, чтобы не потерять доступ.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (name) =>
    `Привіт, ${name}!\n\nВаш останній платіж за KYLYVNYK CLUB не пройшов. Ваш VIP-доступ збережено на час повторних спроб протягом 14 днів.\n\nБудь ласка, оновіть спосіб оплати в особистому кабінеті, щоб не втратити доступ.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const GRACE_EXPIRY_SUBJECTS: Record<Locale, string> = {
  en: "Final notice: your KYLYVNYK CLUB VIP access expires soon",
  ru: "Последнее уведомление: ваш VIP-доступ KYLYVNYK CLUB скоро истечёт",
  uk: "Останнє повідомлення: ваш VIP-доступ KYLYVNYK CLUB скоро закінчиться",
};

const GRACE_EXPIRY_BODIES: Record<Locale, (name: string) => string> = {
  en: (name) =>
    `Hi ${name},\n\nWe have been unable to process your payment for KYLYVNYK CLUB after multiple attempts. Your VIP access will be revoked soon unless you update your payment method.\n\nPlease visit the billing portal in your account to update your card.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (name) =>
    `Привет, ${name}!\n\nМы не смогли списать оплату за KYLYVNYK CLUB после нескольких попыток. Ваш VIP-доступ будет отключён, если вы не обновите способ оплаты.\n\nПожалуйста, перейдите в раздел оплаты в личном кабинете, чтобы обновить карту.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (name) =>
    `Привіт, ${name}!\n\nМи не змогли списати оплату за KYLYVNYK CLUB після кількох спроб. Ваш VIP-доступ буде вимкнено, якщо ви не оновите спосіб оплати.\n\nБудь ласка, перейдіть до розділу оплати в особистому кабінеті, щоб оновити картку.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const COMPANY_APPROVED_SUBJECTS: Record<Locale, string> = {
  en: "Your company has been approved on KYLYVNYK CLUB",
  ru: "Ваша компания одобрена на KYLYVNYK CLUB",
  uk: "Вашу компанію схвалено на KYLYVNYK CLUB",
};

const COMPANY_APPROVED_BODIES: Record<Locale, (companyName: string) => string> =
  {
    en: (companyName) =>
      `Congratulations!\n\nYour company "${companyName}" has been approved and is now live in the KYLYVNYK CLUB Partner Catalogue.\n\nMembers can now discover your business and access your offers.\n\nBest,\nKYLYVNYK CLUB`,
    ru: (companyName) =>
      `Поздравляем!\n\nВаша компания «${companyName}» одобрена и теперь доступна в Каталоге партнёров KYLYVNYK CLUB.\n\nУчастники клуба теперь могут найти ваш бизнес и воспользоваться вашими предложениями.\n\nС уважением,\nKYLYVNYK CLUB`,
    uk: (companyName) =>
      `Вітаємо!\n\nВашу компанію «${companyName}» схвалено, і тепер вона доступна в Каталозі партнерів KYLYVNYK CLUB.\n\nУчасники клубу тепер можуть знайти ваш бізнес та скористатися вашими пропозиціями.\n\nЗ повагою,\nKYLYVNYK CLUB`,
  };

const COMPANY_REJECTED_SUBJECTS: Record<Locale, string> = {
  en: "Your company submission was not approved",
  ru: "Ваша заявка на компанию не одобрена",
  uk: "Вашу заявку на компанію не схвалено",
};

const COMPANY_REJECTED_BODIES: Record<
  Locale,
  (companyName: string, reason: string) => string
> = {
  // The refund sentence is conditional on purpose: the email is sent by the
  // daily outbox drain and the refund itself may still be retrying (ADR 0019).
  en: (companyName, reason) =>
    `Hello,\n\nYour company "${companyName}" was not approved for the KYLYVNYK CLUB Partner Catalogue.\n\nReason: ${reason}\n\nIf you had already paid for the listing, the subscription has been cancelled and the payment is being refunded to your card. Banks usually take 5–10 business days to show it.\n\nYou may update your listing and resubmit.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (companyName, reason) =>
    `Здравствуйте!\n\nВаша компания «${companyName}» не была одобрена для Каталога партнёров KYLYVNYK CLUB.\n\nПричина: ${reason}\n\nЕсли вы уже оплатили размещение, подписка отменена, а платёж возвращается на вашу карту. Обычно банк зачисляет возврат в течение 5–10 рабочих дней.\n\nВы можете обновить данные и подать заявку повторно.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (companyName, reason) =>
    `Доброго дня!\n\nВашу компанію «${companyName}» не було схвалено для Каталогу партнерів KYLYVNYK CLUB.\n\nПричина: ${reason}\n\nЯкщо ви вже оплатили розміщення, підписку скасовано, а платіж повертається на вашу картку. Зазвичай банк зараховує повернення протягом 5–10 робочих днів.\n\nВи можете оновити дані та подати заявку повторно.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

export interface SendEmailParams {
  to: string;
  displayName: string;
  locale: Locale;
}

export async function sendPaymentFailedEmail(
  params: SendEmailParams,
): Promise<boolean> {
  return sendEmail(
    params.to,
    PAYMENT_FAILED_SUBJECTS[params.locale],
    PAYMENT_FAILED_BODIES[params.locale](params.displayName),
  );
}

export async function sendCompanyApprovedEmail(params: {
  to: string;
  companyName: string;
  locale: Locale;
}): Promise<boolean> {
  return sendEmail(
    params.to,
    COMPANY_APPROVED_SUBJECTS[params.locale],
    COMPANY_APPROVED_BODIES[params.locale](params.companyName),
  );
}

export async function sendCompanyRejectedEmail(params: {
  to: string;
  companyName: string;
  reason: string;
  locale: Locale;
}): Promise<boolean> {
  return sendEmail(
    params.to,
    COMPANY_REJECTED_SUBJECTS[params.locale],
    COMPANY_REJECTED_BODIES[params.locale](params.companyName, params.reason),
  );
}

export async function sendGraceExpiryWarningEmail(
  params: SendEmailParams,
): Promise<boolean> {
  return sendEmail(
    params.to,
    GRACE_EXPIRY_SUBJECTS[params.locale],
    GRACE_EXPIRY_BODIES[params.locale](params.displayName),
  );
}

/**
 * The two failure modes are deliberately different, because the callers are
 * outbox workers and the difference decides whether a row is retried.
 *
 * No API key is a configuration fact: retrying cannot fix it, so it returns
 * false and the row is marked processed rather than becoming a poison row that
 * every drain re-selects forever.
 *
 * A Resend error is usually transient - a 429, a 5xx, a network blip - and
 * retrying is exactly the right response, so it throws. The caller's per-row
 * catch then leaves the outbox row unprocessed for the next drain. Returning
 * false here instead would mark the row done and lose the notification
 * silently, which for FR-056's grace warning means the member is never warned
 * at all: the enqueued row still suppresses the next sweep.
 */
async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!resend) {
    console.warn("[notifications] RESEND_API_KEY not set, skipping email");
    return false;
  }

  const { error } = await resend.emails.send({
    from: env.server.EMAIL_FROM,
    to,
    subject,
    text,
  });

  if (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Resend refused the message: ${message}`);
  }

  return true;
}
