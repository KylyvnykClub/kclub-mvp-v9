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

/**
 * Approval is not publication (FR-044), and since ADR 0036 it is also the
 * first moment anything may be charged (FR-111). The email therefore says
 * what is true and what is left to do, and carries the link that does it.
 * The old wording announced a listing that was live, which it was not.
 */
const COMPANY_APPROVED_BODIES: Record<
  Locale,
  (companyName: string, link: string) => string
> = {
  en: (companyName, link) =>
    `Congratulations!\n\nYour company "${companyName}" has passed review for the KYLYVNYK CLUB Partner Catalogue.\n\nOne step is left: pay for the listing and it goes live. Nothing has been charged until you do.\n\n${link}\n\nBest,\nKYLYVNYK CLUB`,
  ru: (companyName, link) =>
    `Поздравляем!\n\nВаша компания «${companyName}» прошла проверку для Каталога партнёров KYLYVNYK CLUB.\n\nОстался один шаг: оплатите размещение, и оно будет опубликовано. До этого с вас ничего не списывается.\n\n${link}\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (companyName, link) =>
    `Вітаємо!\n\nВаша компанія «${companyName}» пройшла перевірку для Каталогу партнерів KYLYVNYK CLUB.\n\nЗалишився один крок: оплатіть розміщення, і воно буде опубліковане. До цього з вас нічого не списується.\n\n${link}\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

/**
 * ADR 0037: the approval of a partner whose card was held at application. The
 * approval asked Stripe to capture; the listing goes live when Stripe confirms
 * it, and Stripe sends its own receipt. So this says the payment is being
 * taken - not that it has been, and not that the listing is live.
 */
const COMPANY_APPROVED_HELD_BODIES: Record<
  Locale,
  (companyName: string, link: string) => string
> = {
  en: (companyName, link) =>
    `Congratulations!\n\nYour company "${companyName}" has passed review for the KYLYVNYK CLUB Partner Catalogue.\n\nThe listing fee held on your card is now being charged. As soon as the payment is confirmed your listing goes live in the catalogue, and the payment receipt is emailed to you separately. From then on the listing renews monthly from the same card.\n\n${link}\n\nBest,\nKYLYVNYK CLUB`,
  ru: (companyName, link) =>
    `Поздравляем!\n\nВаша компания «${companyName}» прошла проверку для Каталога партнёров KYLYVNYK CLUB.\n\nСумма, зарезервированная на вашей карте, сейчас списывается. Как только платёж будет подтверждён, размещение появится в каталоге, а чек об оплате придёт вам отдельным письмом. Далее размещение продлевается ежемесячно с этой же карты.\n\n${link}\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (companyName, link) =>
    `Вітаємо!\n\nВаша компанія «${companyName}» пройшла перевірку для Каталогу партнерів KYLYVNYK CLUB.\n\nСума, зарезервована на вашій картці, зараз списується. Щойно платіж буде підтверджено, розміщення з'явиться в каталозі, а чек про оплату надійде вам окремим листом. Далі розміщення подовжується щомісяця з цієї ж картки.\n\n${link}\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const COMPANY_APPROVED_WAIVED_BODIES: Record<
  Locale,
  (companyName: string, link: string) => string
> = {
  en: (companyName, link) =>
    `Congratulations!\n\nYour company "${companyName}" has passed review for the KYLYVNYK CLUB Partner Catalogue.\n\nYou applied through the club's partner link, so the listing is free: it is live in the catalogue now and nothing is charged.\n\n${link}\n\nBest,\nKYLYVNYK CLUB`,
  ru: (companyName, link) =>
    `Поздравляем!\n\nВаша компания «${companyName}» прошла проверку для Каталога партнёров KYLYVNYK CLUB.\n\nВы подали заявку по партнёрской ссылке клуба, поэтому размещение бесплатное: компания уже в каталоге, ничего не списывается.\n\n${link}\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (companyName, link) =>
    `Вітаємо!\n\nВаша компанія «${companyName}» пройшла перевірку для Каталогу партнерів KYLYVNYK CLUB.\n\nВи подали заявку за партнерським посиланням клубу, тому розміщення безоплатне: компанія вже в каталозі, нічого не списується.\n\n${link}\n\nЗ повагою,\nKYLYVNYK CLUB`,
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
  // The refund sentence is conditional on purpose, and since ADR 0036 it is
  // usually false: nothing is charged before approval, so a rejection normally
  // has nothing to give back. It stays for the companies that paid under the
  // old order and for whom the refund may still be retrying through the
  // outbox.
  en: (companyName, reason) =>
    `Hello,\n\nYour company "${companyName}" was not approved for the KYLYVNYK CLUB Partner Catalogue.\n\nReason: ${reason}\n\nIf an amount was reserved on your card, the reservation has been cancelled without any charge, and your bank releases it, usually within a few days. If you had already paid for the listing, the payment is being refunded to your card; banks usually take 5–10 business days to show it.\n\nYou may update your listing and resubmit.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (companyName, reason) =>
    `Здравствуйте!\n\nВаша компания «${companyName}» не была одобрена для Каталога партнёров KYLYVNYK CLUB.\n\nПричина: ${reason}\n\nЕсли на вашей карте была зарезервирована сумма, резерв отменён без списания, и банк освободит её — обычно в течение нескольких дней. Если вы уже оплатили размещение, платёж возвращается на вашу карту; обычно банк зачисляет возврат в течение 5–10 рабочих дней.\n\nВы можете обновить данные и подать заявку повторно.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (companyName, reason) =>
    `Доброго дня!\n\nВашу компанію «${companyName}» не було схвалено для Каталогу партнерів KYLYVNYK CLUB.\n\nПричина: ${reason}\n\nЯкщо на вашій картці було зарезервовано суму, резерв скасовано без списання, і банк звільнить її — зазвичай протягом кількох днів. Якщо ви вже оплатили розміщення, платіж повертається на вашу картку; зазвичай банк зараховує повернення протягом 5–10 робочих днів.\n\nВи можете оновити дані та подати заявку повторно.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const EMAIL_VERIFICATION_SUBJECTS: Record<Locale, string> = {
  en: "Confirm your email address for KYLYVNYK CLUB",
  ru: "Подтвердите адрес электронной почты для KYLYVNYK CLUB",
  uk: "Підтвердьте адресу електронної пошти для KYLYVNYK CLUB",
};

const EMAIL_VERIFICATION_BODIES: Record<
  Locale,
  (name: string, url: string, hours: number) => string
> = {
  en: (name, url, hours) =>
    `Hi ${name},\n\nConfirm this address so it can be used to sign in to KYLYVNYK CLUB and to recover your account if you lose access to your phone number.\n\n${url}\n\nThe link works once and expires in ${hours} hours.\n\nIf you did not ask for this, ignore this message — nothing changes until the link is opened.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (name, url, hours) =>
    `Привет, ${name}!\n\nПодтвердите этот адрес, чтобы использовать его для входа в KYLYVNYK CLUB и для восстановления доступа, если вы потеряете свой номер телефона.\n\n${url}\n\nСсылка одноразовая и действует ${hours} часов.\n\nЕсли вы этого не запрашивали, просто проигнорируйте письмо — без перехода по ссылке ничего не изменится.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (name, url, hours) =>
    `Привіт, ${name}!\n\nПідтвердьте цю адресу, щоб використовувати її для входу в KYLYVNYK CLUB та для відновлення доступу, якщо ви втратите свій номер телефону.\n\n${url}\n\nПосилання одноразове та діє ${hours} годин.\n\nЯкщо ви цього не запитували, просто проігноруйте лист — без переходу за посиланням нічого не зміниться.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const PASSWORD_RESET_SUBJECTS: Record<Locale, string> = {
  en: "Reset your KYLYVNYK CLUB password",
  ru: "Сброс пароля KYLYVNYK CLUB",
  uk: "Скидання пароля KYLYVNYK CLUB",
};

const PASSWORD_RESET_BODIES: Record<
  Locale,
  (name: string, url: string, minutes: number) => string
> = {
  en: (name, url, minutes) =>
    `Hi ${name},\n\nSomeone asked to reset the password on your KYLYVNYK CLUB account. If it was you, set a new one here:\n\n${url}\n\nThe link works once and expires in ${minutes} minutes. Setting a new password signs you out everywhere else.\n\nIf it was not you, ignore this message. Nothing changes until the link is opened, and your current password still works.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (name, url, minutes) =>
    `Привет, ${name}!\n\nКто-то запросил сброс пароля для вашего аккаунта KYLYVNYK CLUB. Если это были вы, задайте новый пароль здесь:\n\n${url}\n\nСсылка одноразовая и действует ${minutes} минут. После смены пароля все остальные сессии будут завершены.\n\nЕсли это были не вы, просто проигнорируйте письмо: без перехода по ссылке ничего не изменится, а текущий пароль продолжит работать.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (name, url, minutes) =>
    `Привіт, ${name}!\n\nХтось запросив скидання пароля для вашого акаунта KYLYVNYK CLUB. Якщо це були ви, задайте новий пароль тут:\n\n${url}\n\nПосилання одноразове та діє ${minutes} хвилин. Після зміни пароля всі інші сесії буде завершено.\n\nЯкщо це були не ви, просто проігноруйте лист: без переходу за посиланням нічого не зміниться, а поточний пароль працюватиме далі.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

const PASSWORD_CHANGED_SUBJECTS: Record<Locale, string> = {
  en: "Your KYLYVNYK CLUB password was changed",
  ru: "Пароль KYLYVNYK CLUB изменён",
  uk: "Пароль KYLYVNYK CLUB змінено",
};

const PASSWORD_CHANGED_BODIES: Record<Locale, (name: string) => string> = {
  en: (name) =>
    `Hi ${name},\n\nThe password on your KYLYVNYK CLUB account has just been changed, and every other session has been signed out.\n\nIf this was not you, contact support immediately — whoever did it can sign in as you.\n\nBest,\nKYLYVNYK CLUB`,
  ru: (name) =>
    `Привет, ${name}!\n\nПароль вашего аккаунта KYLYVNYK CLUB только что изменён, все остальные сессии завершены.\n\nЕсли это были не вы, немедленно свяжитесь с поддержкой: тот, кто это сделал, может входить от вашего имени.\n\nС уважением,\nKYLYVNYK CLUB`,
  uk: (name) =>
    `Привіт, ${name}!\n\nПароль вашого акаунта KYLYVNYK CLUB щойно змінено, усі інші сесії завершено.\n\nЯкщо це були не ви, негайно зв'яжіться з підтримкою: той, хто це зробив, може входити від вашого імені.\n\nЗ повагою,\nKYLYVNYK CLUB`,
};

export interface SendEmailParams {
  to: string;
  displayName: string;
  locale: Locale;
}

/**
 * The link that proves an address belongs to the member (ADR 0032).
 *
 * Sent by the member's own action rather than by the outbox worker, because it
 * is the one email whose failure the member is watching for: they are on the
 * screen that just asked for it, and "we could not send it" is a better answer
 * than a queued row and a blank wait.
 */
export async function sendEmailVerificationEmail(params: {
  to: string;
  displayName: string;
  locale: Locale;
  url: string;
  expiresInHours: number;
}): Promise<boolean> {
  return sendEmail(
    params.to,
    EMAIL_VERIFICATION_SUBJECTS[params.locale],
    EMAIL_VERIFICATION_BODIES[params.locale](
      params.displayName,
      params.url,
      params.expiresInHours,
    ),
  );
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
  /** The price was held on the card and approval asked Stripe to capture it. */
  paymentHeld?: boolean;
  /** ADR 0040: the partner link waived the listing; nothing is charged. */
  listingWaived?: boolean;
}): Promise<boolean> {
  // Straight to the owner's own screen. A partner with no active listing is
  // forwarded from there to the standing screen that carries the button, so
  // one link serves both kinds of owner (FR-110).
  const link = `${env.server.NEXT_PUBLIC_APP_URL}/${params.locale}/dashboard/profile`;

  return sendEmail(
    params.to,
    COMPANY_APPROVED_SUBJECTS[params.locale],
    (params.listingWaived
      ? COMPANY_APPROVED_WAIVED_BODIES
      : params.paymentHeld
        ? COMPANY_APPROVED_HELD_BODIES
        : COMPANY_APPROVED_BODIES)[params.locale](params.companyName, link),
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
 * The link that lets somebody who has forgotten their password set a new one
 * (FR-006, ADR 0032).
 *
 * Sent by the request itself rather than queued, for the same reason the
 * address-verification link is: the member is on the screen that just asked
 * for it.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  displayName: string;
  locale: Locale;
  url: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  return sendEmail(
    params.to,
    PASSWORD_RESET_SUBJECTS[params.locale],
    PASSWORD_RESET_BODIES[params.locale](
      params.displayName,
      params.url,
      params.expiresInMinutes,
    ),
  );
}

/**
 * Told after the fact, not asked before it (security.md §1, the SIM-swap row:
 * sensitive changes notify the member). If the reset was not theirs, this is
 * the message that tells them, and it is worth sending even though it arrives
 * at the address the reset was proved against.
 */
export async function sendPasswordChangedEmail(
  params: SendEmailParams,
): Promise<boolean> {
  return sendEmail(
    params.to,
    PASSWORD_CHANGED_SUBJECTS[params.locale],
    PASSWORD_CHANGED_BODIES[params.locale](params.displayName),
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
