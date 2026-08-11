import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const CONTENT_PATH = path.resolve(process.cwd(), "content/legal");
const LEGAL_ID_PATTERN = /^[a-z0-9-]+$/;
const LOCALE_PATTERN = /^[a-z]{2}$/;

const FRONTMATTER_SCHEMA = z.object({
  title: z.string(),
  version: z.string().default("1.0"),
  lastUpdated: z.string().default(""),
  authoritative: z.boolean().default(false),
  order: z.number().int().nonnegative().optional(),
});

export interface LegalDocument {
  id: string;
  title: string;
  version: string;
  lastUpdated: string;
  authoritative: boolean;
  order: number;
  content: string;
}

function resolveContentFile(fileName: string): string | null {
  const resolvedPath = path.resolve(CONTENT_PATH, fileName);
  const contentRoot = `${CONTENT_PATH}${path.sep}`;
  if (!resolvedPath.startsWith(contentRoot)) {
    return null;
  }
  return resolvedPath;
}

/**
 * A document is stored as `{id}.mdx` when it is the authoritative version
 * (FR-093: the English version is authoritative). Translations, when they
 * exist, are stored as `{id}.{locale}.mdx`; the locale file wins for that
 * locale, otherwise the authoritative version is served.
 */
async function readDocument(filePath: string): Promise<LegalDocument | null> {
  try {
    if (!filePath.startsWith(`${CONTENT_PATH}${path.sep}`)) {
      return null;
    }
    // The path is constrained to content/legal by resolveContentFile above.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fileContent = await fs.readFile(filePath, "utf-8");
    const { data, content } = matter(fileContent);
    const parsed = FRONTMATTER_SCHEMA.safeParse(data);
    if (!parsed.success) {
      return null;
    }
    const id = path
      .basename(filePath)
      .replace(/\.mdx$/, "")
      .replace(/\.[a-z]{2}$/, "");
    return {
      id,
      title: parsed.data.title,
      version: parsed.data.version,
      lastUpdated: parsed.data.lastUpdated,
      authoritative: parsed.data.authoritative,
      order: parsed.data.order ?? Number.MAX_SAFE_INTEGER,
      content,
    };
  } catch {
    return null;
  }
}

export async function getLegalDocument(
  id: string,
  locale: string,
): Promise<LegalDocument | null> {
  if (!LEGAL_ID_PATTERN.test(id) || !LOCALE_PATTERN.test(locale)) {
    return null;
  }

  const localizedPath = resolveContentFile(`${id}.${locale}.mdx`);
  const authoritativePath = resolveContentFile(`${id}.mdx`);
  if (!localizedPath || !authoritativePath) {
    return null;
  }

  return (
    (await readDocument(localizedPath)) ??
    (await readDocument(authoritativePath))
  );
}

export async function getAllLegalDocuments(
  locale: string,
): Promise<LegalDocument[]> {
  if (!LOCALE_PATTERN.test(locale)) {
    return [];
  }

  try {
    // CONTENT_PATH is a fixed repository content root.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const files = await fs.readdir(CONTENT_PATH);
    const ids = new Set<string>();
    for (const file of files) {
      if (!file.endsWith(".mdx")) {
        continue;
      }
      const id = file.replace(/\.mdx$/, "").replace(/\.[a-z]{2}$/, "");
      if (id) {
        ids.add(id);
      }
    }
    const docs = await Promise.all(
      [...ids].map((id) => getLegalDocument(id, locale)),
    );
    return docs
      .filter((d): d is LegalDocument => d !== null)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
