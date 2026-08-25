import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readE2eEnv, STORAGE_STATE } from "../env";
import { SCREENS, SECONDARY_LOCALE, type ScreenSession } from "../screens";

/**
 * AC-06: WCAG 2.1 AA over the ten recorded screens.
 *
 * The bar is testing.md §3's: no serious or critical violation. Moderate and
 * minor findings are reported in the run output but do not fail the suite, so
 * that a real regression is not buried under advisory noise - and so that the
 * threshold is a decision written down here rather than an accident of whatever
 * axe reports today.
 */

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function storageFor(session: ScreenSession): string | undefined {
  if (session === "member") return STORAGE_STATE.member;
  if (session === "vip") return STORAGE_STATE.vip;
  return undefined;
}

async function scan(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });

  // A 404 or a 429 would produce a clean axe report of the wrong page, which
  // is the most dangerous way for this suite to be green.
  expect(
    response?.status(),
    `${url} did not render - an audit of an error page proves nothing`,
  ).toBeLessThan(400);

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const blocking = results.violations.filter((v) =>
    BLOCKING_IMPACTS.has(String(v.impact)),
  );
  const advisory = results.violations.filter(
    (v) => !BLOCKING_IMPACTS.has(String(v.impact)),
  );

  if (advisory.length > 0) {
    console.log(
      `[a11y] ${url} - ${advisory.length} advisory finding(s): ${advisory
        .map((v) => `${v.id} (${v.impact})`)
        .join(", ")}`,
    );
  }

  return blocking;
}

function describeViolations(violations: Awaited<ReturnType<typeof scan>>) {
  return violations
    .map(
      (v) =>
        `\n  ${v.impact?.toUpperCase()} ${v.id}: ${v.help}\n    ${v.nodes
          .slice(0, 5)
          .map(
            (n) =>
              // The summary carries the measured ratio and the two colours,
              // which is the difference between "contrast is wrong somewhere"
              // and a token someone can actually change.
              `${n.target.join(" ")}\n      ${(n.failureSummary ?? "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .join("\n      ")}`,
          )
          .join("\n    ")}\n    ${v.helpUrl}`,
    )
    .join("");
}

for (const screen of SCREENS) {
  test.describe(`AC-06: ${screen.name}`, () => {
    test.use({ storageState: storageFor(screen.session) });

    test(`AC-06: "${screen.goal}" has no serious or critical axe violation`, async ({
      page,
    }) => {
      const url = screen.path(readE2eEnv());
      const violations = await scan(page, url);

      expect(
        violations,
        `${screen.name} (${url})${describeViolations(violations)}`,
      ).toEqual([]);
    });
  });
}

test.describe("AC-06: the secondary locale", () => {
  // ux.md §8 requires `lang` to be set correctly per locale. axe's html-has-lang
  // and valid-lang rules check exactly that, so the cheapest honest proof is to
  // run the public screens once more under a non-English locale rather than
  // triple the whole suite.
  for (const screen of SCREENS.filter((s) => s.session === "none")) {
    test(`AC-06: ${screen.name} is clean in ${SECONDARY_LOCALE} too`, async ({
      page,
    }) => {
      const url = screen
        .path(readE2eEnv())
        .replace(/^\/en\b/, `/${SECONDARY_LOCALE}`);
      const violations = await scan(page, url);

      expect(
        violations,
        `${screen.name} in ${SECONDARY_LOCALE} (${url})${describeViolations(violations)}`,
      ).toEqual([]);
    });
  }
});
