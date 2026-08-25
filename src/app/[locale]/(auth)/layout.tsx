import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Sign-in and registration are thin, form-only pages with no search value, and
 * they must not be indexed once the public site goes live. This hard noindex
 * overrides the root layout's launch-gated default, so it holds whether or not
 * ALLOW_PUBLIC_INDEXING is set.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
