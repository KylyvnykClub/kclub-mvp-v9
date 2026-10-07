import { env } from "@/env";
import { sendEmail } from "./email";

/**
 * The emails of a business partner's subscription (ADR 0044 §6): the terms
 * confirmed at application, the dates and amount at publication, the reminder
 * before the first charge, a payment that needs the cardholder, a cancelled
 * renewal and an EU withdrawal. Every one names the amount and the way to
 * cancel, because each is sent at a moment the partner may want to.
 *
 * None of these depends on the advertising consent: they are about a contract
 * the partner has, not marketing.
 */

type Locale = "en" | "ru" | "uk";

const SIGN_OFF: Record<Locale, string> = {
  en: "Best,\nKYLYVNYK CLUB · Kylyvnyk Consulting LLC",
  ru: "С уважением,\nKYLYVNYK CLUB · Kylyvnyk Consulting LLC",
  uk: "З повагою,\nKYLYVNYK CLUB · Kylyvnyk Consulting LLC",
};

function cancelLink(locale: Locale): string {
  return `${env.server.NEXT_PUBLIC_APP_URL}/${locale}/dashboard/profile?tab=companies`;
}

/** A calendar date in UTC, the clock every date here is counted on. */
function day(date: Date, locale: Locale): string {
  return `${new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date)} (UTC)`;
}

export async function sendApplicationTermsEmail(params: {
  to: string;
  locale: Locale;
  companyName: string;
  /** The disclosure lines shown above the boxes. */
  disclosure: string[];
  /** The text of every box ticked, as recorded. */
  consents: string[];
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: `Your application for ${params.companyName}: the terms you accepted`,
    ru: `Ваша заявка «${params.companyName}»: принятые условия`,
    uk: `Ваша заявка «${params.companyName}»: прийняті умови`,
  }[locale];
  const intro = {
    en: `We have received the application for "${params.companyName}". For your records, here are the terms shown to you and what you agreed to.`,
    ru: `Мы получили заявку «${params.companyName}». Для ваших записей — условия, которые вам были показаны, и то, с чем вы согласились.`,
    uk: `Ми отримали заявку «${params.companyName}». Для ваших записів — умови, які вам було показано, і те, з чим ви погодилися.`,
  }[locale];
  const agreed = {
    en: "You agreed:",
    ru: "Вы согласились:",
    uk: "Ви погодилися:",
  }[locale];
  const manage = {
    en: "Withdraw the application or cancel the auto-renewal here:",
    ru: "Отозвать заявку или отменить автопродление можно здесь:",
    uk: "Відкликати заявку або скасувати автопродовження можна тут:",
  }[locale];

  return sendEmail(
    params.to,
    subject,
    [
      intro,
      params.disclosure.map((line) => `• ${line}`).join("\n"),
      agreed,
      params.consents.map((line) => `☑ ${line}`).join("\n"),
      `${manage}\n${cancelLink(locale)}`,
      SIGN_OFF[locale],
    ].join("\n\n"),
  );
}

export async function sendListingPublishedEmail(params: {
  to: string;
  locale: Locale;
  companyName: string;
  publishedAt: Date;
  /** Null when there is no free month: the first charge is now. */
  firstChargeAt: Date | null;
  price: string;
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: `${params.companyName} is published in KYLYVNYK CLUB`,
    ru: `«${params.companyName}» опубликован в KYLYVNYK CLUB`,
    uk: `«${params.companyName}» опубліковано в KYLYVNYK CLUB`,
  }[locale];
  const published = day(params.publishedAt, locale);
  const body = params.firstChargeAt
    ? {
        en: `Your listing was published on ${published}. Your free month runs until ${day(params.firstChargeAt, locale)}. On that date ${params.price} will be charged to your saved card, and then every month until you cancel.\n\nTo stop it, cancel the auto-renewal before that date - nothing will be charged and the listing stays up until the free month ends.`,
        ru: `Ваш бизнес опубликован ${published}. Бесплатный месяц действует до ${day(params.firstChargeAt, locale)}. В этот день с сохранённой карты будет списано ${params.price}, далее — ежемесячно до отмены.\n\nЧтобы этого не было, отмените автопродление до этой даты — ничего не спишется, а размещение сохранится до конца бесплатного месяца.`,
        uk: `Ваш бізнес опубліковано ${published}. Безкоштовний місяць діє до ${day(params.firstChargeAt, locale)}. Цього дня зі збереженої картки буде списано ${params.price}, далі — щомісяця до скасування.\n\nЩоб цього не сталося, скасуйте автопродовження до цієї дати — нічого не спишеться, а розміщення збережеться до кінця безкоштовного місяця.`,
      }[locale]
    : {
        en: `Your listing was published on ${published}. ${params.price} has been charged for the first month and will be charged every month until you cancel.`,
        ru: `Ваш бизнес опубликован ${published}. За первый месяц списано ${params.price}; далее — ежемесячно до отмены.`,
        uk: `Ваш бізнес опубліковано ${published}. За перший місяць списано ${params.price}; далі — щомісяця до скасування.`,
      }[locale];
  const cancel = {
    en: "Cancel the auto-renewal directly:",
    ru: "Отменить автопродление напрямую:",
    uk: "Скасувати автопродовження напряму:",
  }[locale];

  return sendEmail(
    params.to,
    subject,
    [body, `${cancel}\n${cancelLink(locale)}`, SIGN_OFF[locale]].join("\n\n"),
  );
}

export async function sendTrialEndingEmail(params: {
  to: string;
  locale: Locale;
  companyName: string;
  firstChargeAt: Date;
  price: string;
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: `Your free month for ${params.companyName} ends on ${day(params.firstChargeAt, locale)}`,
    ru: `Бесплатный месяц «${params.companyName}» заканчивается ${day(params.firstChargeAt, locale)}`,
    uk: `Безкоштовний місяць «${params.companyName}» закінчується ${day(params.firstChargeAt, locale)}`,
  }[locale];
  const body = {
    en: `On ${day(params.firstChargeAt, locale)} ${params.price} will be charged to your saved card for the next month of your listing, and then every month until you cancel. If you do not want this, cancel the auto-renewal before that date.`,
    ru: `${day(params.firstChargeAt, locale)} с сохранённой карты будет списано ${params.price} за следующий месяц размещения, далее — ежемесячно до отмены. Если вы этого не хотите, отмените автопродление до этой даты.`,
    uk: `${day(params.firstChargeAt, locale)} зі збереженої картки буде списано ${params.price} за наступний місяць розміщення, далі — щомісяця до скасування. Якщо ви цього не хочете, скасуйте автопродовження до цієї дати.`,
  }[locale];

  return sendEmail(
    params.to,
    subject,
    [body, cancelLink(locale), SIGN_OFF[locale]].join("\n\n"),
  );
}

export async function sendPaymentActionRequiredEmail(params: {
  to: string;
  locale: Locale;
  hostedInvoiceUrl: string;
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: "Your bank asks you to confirm a KYLYVNYK CLUB payment",
    ru: "Банк просит подтвердить платёж KYLYVNYK CLUB",
    uk: "Банк просить підтвердити платіж KYLYVNYK CLUB",
  }[locale];
  const body = {
    en: "Your bank needs you to confirm the latest payment before it can go through. Confirm it on Stripe's secure page:",
    ru: "Ваш банк просит подтвердить последний платёж, прежде чем он пройдёт. Подтвердите его на защищённой странице Stripe:",
    uk: "Ваш банк просить підтвердити останній платіж, перш ніж він пройде. Підтвердіть його на захищеній сторінці Stripe:",
  }[locale];

  return sendEmail(
    params.to,
    subject,
    [`${body}\n${params.hostedInvoiceUrl}`, SIGN_OFF[locale]].join("\n\n"),
  );
}

export async function sendRenewalCancelledEmail(params: {
  to: string;
  locale: Locale;
  companyName: string;
  endsAt: Date;
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: `Auto-renewal cancelled for ${params.companyName}`,
    ru: `Автопродление «${params.companyName}» отменено`,
    uk: `Автопродовження «${params.companyName}» скасовано`,
  }[locale];
  const body = {
    en: `Nothing more will be charged. Your listing stays published until ${day(params.endsAt, locale)} and is then removed. Cancelling renewal is not a withdrawal or a refund of what was already paid; see the Refund Policy.`,
    ru: `Больше ничего не будет списано. Размещение сохранится до ${day(params.endsAt, locale)}, затем будет снято. Отмена продления — это не отказ от договора и не возврат уже оплаченного; см. Политику возврата.`,
    uk: `Більше нічого не буде списано. Розміщення збережеться до ${day(params.endsAt, locale)}, потім його буде знято. Скасування продовження — це не відмова від договору і не повернення вже сплаченого; див. Політику повернення.`,
  }[locale];

  return sendEmail(params.to, subject, [body, SIGN_OFF[locale]].join("\n\n"));
}

export async function sendWithdrawalConfirmedEmail(params: {
  to: string;
  locale: Locale;
  companyName: string;
  withdrawnAt: Date;
  refunded: boolean;
}): Promise<boolean> {
  const { locale } = params;
  const subject = {
    en: `Withdrawal confirmed: ${params.companyName}`,
    ru: `Отказ от договора подтверждён: «${params.companyName}»`,
    uk: `Відмову від договору підтверджено: «${params.companyName}»`,
  }[locale];
  const body = {
    en: `We confirm that on ${day(params.withdrawnAt, locale)} you withdrew from the contract for "${params.companyName}". The subscription has ended, the listing is removed and nothing more will be charged.${params.refunded ? " Everything you paid is being refunded to your card; your bank decides how quickly it appears." : ""}`,
    ru: `Подтверждаем: ${day(params.withdrawnAt, locale)} вы отказались от договора по «${params.companyName}». Подписка завершена, размещение снято, больше ничего не будет списано.${params.refunded ? " Всё оплаченное возвращается на вашу карту; срок зачисления зависит от банка." : ""}`,
    uk: `Підтверджуємо: ${day(params.withdrawnAt, locale)} ви відмовилися від договору щодо «${params.companyName}». Підписку завершено, розміщення знято, більше нічого не буде списано.${params.refunded ? " Усе сплачене повертається на вашу картку; строк зарахування залежить від банку." : ""}`,
  }[locale];

  return sendEmail(params.to, subject, [body, SIGN_OFF[locale]].join("\n\n"));
}
