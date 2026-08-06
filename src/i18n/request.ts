import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

async function loadMessages(locale: string): Promise<Messages> {
  const mod = (await (locale === "ru"
    ? import("../../messages/ru.json")
    : locale === "uk"
      ? import("../../messages/uk.json")
      : import("../../messages/en.json"))) as { default: Messages };
  return mod.default;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
