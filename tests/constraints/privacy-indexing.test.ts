import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("constraint: privacy and indexing controls (FR-089, FR-094)", () => {
  it("disallows admin console and APIs in robots.txt", () => {
    const source = readFileSync("src/app/robots.ts", "utf8");

    expect(source).toContain('userAgent: "*"');
    expect(source).toContain('allow: "/"');
    expect(source).toContain('"/*/dashboard/"');
    expect(source).toContain('"/*/card/"');
    expect(source).toContain('"/api/"');
  });

  it("sets noindex metadata on the dashboard shell", () => {
    const source = readFileSync(
      "src/app/[locale]/(dashboard)/dashboard/layout.tsx",
      "utf8",
    );

    expect(source).toContain("robots");
    expect(source).toContain("index: false");
    expect(source).toContain("follow: false");
  });

  it("sets X-Robots-Tag on member export APIs", () => {
    const selfExport = readFileSync(
      "src/app/api/export/member/route.ts",
      "utf8",
    );
    const staffExport = readFileSync(
      "src/app/api/admin/export/member/[memberId]/route.ts",
      "utf8",
    );

    expect(selfExport).toContain("X-Robots-Tag");
    expect(staffExport).toContain("X-Robots-Tag");
  });
});
