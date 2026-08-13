import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

const LEGAL_DIR = join(process.cwd(), "content/legal");

const LEGAL_DOCUMENT_IDS = [
  "terms-of-use",
  "privacy-policy",
  "cookie-policy",
  "club-rules",
  "partner-rules",
  "business-introduction-rules",
  "refund-policy",
  "disclaimer",
  "contact-us",
] as const;

const CORRUPTION_PATTERNS = [
  /Ð|Ñ|�/,
  /[\u4e00-\u9fff]/,
  /[\ua000-\uabff]/,
  /WordDocument|SummaryInformation|Default Paragraph Font|Table Normal/,
];

describe("constraint: legal document localization (FR-093)", () => {
  it("publishes an authoritative English document for every legal document", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      const file = readFileSync(join(LEGAL_DIR, `${id}.en.mdx`), "utf-8");
      const parsed = matter(file);

      expect(parsed.data.authoritative, id).toBe(true);
      expect(parsed.data.version, id).toBe("1.0");
      expect(parsed.content.trim().length, id).toBeGreaterThan(1000);
    }
  });

  it("keeps the Russian source documents non-authoritative", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      const file = readFileSync(join(LEGAL_DIR, `${id}.mdx`), "utf-8");
      const parsed = matter(file);

      expect(parsed.data.authoritative, id).toBe(false);
      expect(parsed.content.trim().length, id).toBeGreaterThan(1000);
    }
  });

  it("does not contain mojibake or extracted Word metadata", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      for (const suffix of [".mdx", ".en.mdx"]) {
        const file = readFileSync(join(LEGAL_DIR, `${id}${suffix}`), "utf-8");
        for (const pattern of CORRUPTION_PATTERNS) {
          expect(file, `${id}${suffix} contains ${pattern}`).not.toMatch(
            pattern,
          );
        }
      }
    }
  });

  it("keeps English localized documents free of Cyrillic body text", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      const file = readFileSync(join(LEGAL_DIR, `${id}.en.mdx`), "utf-8");

      expect(file, `${id}.en.mdx contains Cyrillic`).not.toMatch(
        /[А-Яа-яЁёІіЇїЄєҐґ]/,
      );
    }
  });
});
