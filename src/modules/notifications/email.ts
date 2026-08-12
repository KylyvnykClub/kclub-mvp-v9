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

export async function sendGraceExpiryWarningEmail(
  params: SendEmailParams,
): Promise<boolean> {
  return sendEmail(
    params.to,
    GRACE_EXPIRY_SUBJECTS[params.locale],
    GRACE_EXPIRY_BODIES[params.locale](params.displayName),
  );
}

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
    console.error("[notifications] Resend error:", error);
    return false;
  }

  return true;
}
