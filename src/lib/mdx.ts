import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const CONTENT_PATH = path.join(process.cwd(), "content/legal");

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

/**
 * A document is stored as `{id}.mdx` when it is the authoritative version
 * (FR-093: the English version is authoritative). Translations, when they
 * exist, are stored as `{id}.{locale}.mdx`; the locale file wins for that
 * locale, otherwise the authoritative version is served.
 */
async function readDocument(filePath: string): Promise<LegalDocument | null> {
  try {
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
  const localizedPath = path.join(CONTENT_PATH, `${id}.${locale}.mdx`);
  const authoritativePath = path.join(CONTENT_PATH, `${id}.mdx`);
  return (
    (await readDocument(localizedPath)) ??
    (await readDocument(authoritativePath))
  );
}

export async function getAllLegalDocuments(
  locale: string,
): Promise<LegalDocument[]> {
  try {
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
