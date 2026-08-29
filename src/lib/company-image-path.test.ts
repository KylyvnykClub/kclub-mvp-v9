import { describe, expect, it } from "vitest";
import {
  COMPANY_GALLERY_MAX_IMAGES,
  companyImageObjectKey,
  companyImageServePath,
} from "./company-image-path";

describe("company image paths", () => {
  it("keys objects under media/companies/{companyId}/{imageId}.webp", () => {
    expect(companyImageObjectKey("c1", "i1")).toBe(
      "media/companies/c1/i1.webp",
    );
  });

  it("derives the serve path from the image id", () => {
    expect(companyImageServePath("i1")).toBe("/api/company-image/i1");
  });

  it("caps the gallery", () => {
    expect(COMPANY_GALLERY_MAX_IMAGES).toBe(10);
  });
});

describe("company logo paths", () => {
  it("keys the logo as one slot per company", async () => {
    const { companyLogoObjectKey, companyLogoServePath } =
      await import("./company-image-path");
    expect(companyLogoObjectKey("c1")).toBe("media/companies/c1/logo.webp");
    expect(companyLogoServePath("c1")).toBe("/api/company-logo/c1");
  });
});
