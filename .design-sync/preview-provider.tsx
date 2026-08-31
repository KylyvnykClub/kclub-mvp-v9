import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

/**
 * Preview wrapper for claude.ai/design cards: some kclub components (DialogContent)
 * read next-intl context for accessibility strings. Ships in the bundle via
 * cfg.extraEntries and is applied to every preview via cfg.provider.
 */
const messages = {
  common: {
    close: "Close",
  },
};

export function DsPreviewProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
