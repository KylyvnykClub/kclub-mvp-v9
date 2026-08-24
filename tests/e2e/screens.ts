import type { E2eEnv } from "./env";

/**
 * AC-06's ten screens, recorded here so they are not re-decided each time.
 *
 * ux.md §2 lists thirty-eight screens and marks no subset of ten, while
 * src/app has twenty-two routes - several §2 entries are steps inside one route
 * (registration) or sections of one page (My card, VIP upgrade and My
 * subscription are all dashboard/profile), and one is dormant entirely
 * (Register - enter code, switched off by ADR 0012).
 *
 * These ten are the highest distinct-user-goal screens among the routes that
 * exist, and together they cover all four flows in ux.md §3. The rationale and
 * the expansion path live in
 * docs/delivery/production-launch-evidence.md's AC-06 row.
 */

export type ScreenSession = "none" | "member" | "vip";

export interface Screen {
  /** The ux.md §2 row this audits. */
  name: string;
  /** Path builder - some screens address seeded data. */
  path: (env: E2eEnv) => string;
  session: ScreenSession;
  /** Why it is one of the ten, in the terms ux.md §2 uses. */
  goal: string;
}

export const SCREENS: readonly Screen[] = [
  {
    name: "Home",
    path: () => "/en",
    session: "none",
    goal: "Decide whether this club is real and worth joining",
  },
  {
    name: "Sign in",
    path: () => "/en/login",
    session: "none",
    goal: "Return",
  },
  {
    name: "Register",
    path: () => "/en/register",
    session: "none",
    goal: "Start membership",
  },
  {
    name: "Catalogue",
    path: () => "/en/directory",
    session: "none",
    goal: "Find a trusted business",
  },
  {
    name: "Partner detail",
    path: (env) => `/en/directory/${env.companySlug}`,
    session: "none",
    goal: "Decide to contact them, and see the discount",
  },
  {
    name: "Card verification",
    path: (env) => `/en/card/${env.cardToken}`,
    session: "none",
    goal: "Confirm a card in front of them is real",
  },
  {
    name: "Legal",
    path: () => "/en/legal",
    session: "none",
    goal: "Read the versioned documents accepted at registration",
  },
  {
    name: "My card, VIP upgrade and subscription",
    path: () => "/en/dashboard/profile",
    session: "member",
    goal: "Show membership, understand and buy VIP, manage the subscription",
  },
  {
    name: "Submit a company",
    path: () => "/en/dashboard/company/new",
    session: "member",
    goal: "Apply to the catalogue",
  },
  {
    name: "Referrals",
    path: () => "/en/dashboard/referrals",
    session: "vip",
    goal: "Track introductions made, and act on incoming ones",
  },
];

/**
 * The locale set for the `lang` check in ux.md §8. Running every screen in
 * every locale would triple the suite to re-prove one rule, so one non-English
 * locale is scanned across the public screens instead.
 */
export const SECONDARY_LOCALE = "ru";
