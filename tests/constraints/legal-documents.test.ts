import { existsSync, readFileSync } from "node:fs";
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

/** Every document exists in every locale; English is authoritative. */
const LOCALE_SUFFIXES = [".en.mdx", ".ru.mdx", ".uk.mdx"] as const;

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
      const file = readFileSync(join(LEGAL_DIR, `${id}.ru.mdx`), "utf-8");
      const parsed = matter(file);

      expect(parsed.data.authoritative, id).toBe(false);
      expect(parsed.content.trim().length, id).toBeGreaterThan(1000);
    }
  });

  it("does not contain mojibake or extracted Word metadata", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      for (const suffix of LOCALE_SUFFIXES.filter((suffix) =>
        existsSync(join(LEGAL_DIR, `${id}${suffix}`)),
      )) {
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

describe("constraint: legal documents share one formatted shape", () => {
  const documents = LEGAL_DOCUMENT_IDS.flatMap((id) =>
    LOCALE_SUFFIXES.filter((suffix) =>
      existsSync(join(LEGAL_DIR, `${id}${suffix}`)),
    ).map((suffix) => ({
      name: `${id}${suffix}`,
      parsed: matter(readFileSync(join(LEGAL_DIR, `${id}${suffix}`), "utf-8")),
    })),
  );

  // Owner decision 2026-10-01: each locale names its documents in its own
  // language - no "TERMS OF USE" on the Ukrainian index. Upper case in every
  // locale, so the index still reads as one set; Latin is allowed in ru/uk
  // only for the words the glossary leaves untranslated.
  it("names every document in its own language, in upper case", () => {
    for (const { name, parsed } of documents) {
      const title = String(parsed.data.title);
      if (name.endsWith(".en.mdx")) {
        expect(title, name).toMatch(/^[A-Z][A-Z /]+$/);
      } else {
        expect(title, name).toMatch(/^[А-ЯЁІЇЄҐ][А-ЯЁІЇЄҐ' A-Z]+$/);
        expect(
          title.replace(/BUSINESS INTRODUCTIONS|COOKIE/g, ""),
          `${name} has untranslated Latin in its title`,
        ).not.toMatch(/[A-Z]/);
      }
    }
  });

  // Stripping the repeated title once cut the first section off four
  // documents in every language. Each translation carries the same sections
  // as the English text, starting from section 1.
  it("keeps every section, from section 1, in every locale", () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      const headings = (suffix: string) =>
        readFileSync(join(LEGAL_DIR, `${id}${suffix}`), "utf-8")
          .split("\n")
          .filter((line) => /^##? /.test(line));
      const english = headings(".en.mdx");
      expect(
        english.some((line) => line.startsWith("## 1. ")),
        id,
      ).toBe(true);
      for (const suffix of [".ru.mdx", ".uk.mdx"]) {
        expect(headings(suffix).length, `${id}${suffix}`).toBe(english.length);
        expect(
          headings(suffix).some((line) => line.startsWith("## 1. ")),
          `${id}${suffix}`,
        ).toBe(true);
      }
    }
  });

  it("does not name another document in English inside a ru/uk text", () => {
    const englishNames =
      /\b(Terms of Use|Privacy Policy|Cookie Policy|Club Rules|Partner Rules|Refund Policy|Disclaimer|Contact Us|Business Introduction Rules)\b/;
    for (const { name, parsed } of documents) {
      if (name.endsWith(".en.mdx")) continue;
      expect(parsed.content, name).not.toMatch(englishNames);
    }
  });

  it("does not repeat the title, version or operator above the body", () => {
    // The page template states all of this once, in the same place, for every
    // document. A cover block inside the content is the old, ragged shape.
    const COVER = [
      /^## KYLYVNYK CLUB\.?$/m,
      /^(Effective Date|Version|Platform Operator|Managed by)\b/m,
      /^(Дата вступления|Версия|Оператор платформы|Управляется)/m,
      /^(Дата набрання|Версія|Оператор платформи)/m,
      /^kylyvnykclub@gmail\.com$/m,
    ];
    for (const { name, parsed } of documents) {
      const preamble = parsed.content.split(/^## \d+\./m)[0] ?? "";
      for (const pattern of COVER) {
        expect(
          preamble,
          `${name} repeats ${pattern} above the body`,
        ).not.toMatch(pattern);
      }
    }
  });

  it("reserves `##` for numbered sections and the preamble callout", () => {
    for (const { name, parsed } of documents) {
      const [preamble = "", ...sections] = parsed.content.split(/^(?=## )/m);
      expect(preamble, `${name} starts with a heading`).not.toMatch(/^## /);
      for (const section of sections) {
        const heading = section.split("\n")[0] ?? "";
        expect(heading, `${name}: ${heading}`).toMatch(
          /^## (\d+\.(?!\d)|IMPORTANT NOTICE|ВАЖНОЕ УВЕДОМЛЕНИЕ|ВАЖЛИВЕ ПОВІДОМЛЕННЯ)/,
        );
      }
    }
  });

  it("keeps bullet lists tight, so spacing does not vary by document", () => {
    for (const { name, parsed } of documents) {
      expect(
        parsed.content,
        `${name} has a blank line inside a list`,
      ).not.toMatch(/^- .*\n\n- /m);
    }
  });
});

describe("constraint: a locale is never served another locale's translation (FR-093)", () => {
  it("serves every document in Ukrainian on /uk, never the Russian text", async () => {
    const { getLegalDocument } = await import("@/lib/mdx");
    for (const id of LEGAL_DOCUMENT_IDS) {
      const doc = await getLegalDocument(id, "uk");
      expect(doc, id).not.toBeNull();
      // ы, э, ъ, ё exist in Russian and not in Ukrainian; і, ї, є the reverse.
      expect(doc!.content, `${id} on /uk is Russian`).not.toMatch(/[ыэъё]/i);
      expect(doc!.content, `${id} on /uk is not Ukrainian`).toMatch(/[іїє]/i);
      expect(doc!.authoritative, id).toBe(false);
    }
  });

  it("serves the Russian text on /ru", async () => {
    const { getLegalDocument } = await import("@/lib/mdx");
    for (const id of LEGAL_DOCUMENT_IDS) {
      const doc = await getLegalDocument(id, "ru");
      expect(doc!.content, id).toMatch(/[ыэ]/i);
    }
  });
});
