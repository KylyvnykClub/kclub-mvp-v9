import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboardHeaderSource = readFileSync(
  "src/app/[locale]/(dashboard)/dashboard/_components/dashboard-header.tsx",
  "utf8",
);

describe("constraint: dashboard navigation i18n", () => {
  it("does not hardcode mobile navigation labels", () => {
    expect(dashboardHeaderSource).not.toContain('"Open navigation"');
    expect(dashboardHeaderSource).not.toContain('"Close navigation"');
    expect(dashboardHeaderSource).toContain('tDashboard("openNavigation")');
    expect(dashboardHeaderSource).toContain('tDashboard("closeNavigation")');
  });
});
