import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_PATH = path.join(process.cwd(), "content/legal");

export interface LegalDocument {
  id: string;
  title: string;
  version: string;
  lastUpdated: string;
  content: string;
}

export async function getLegalDocument(
  id: string,
): Promise<LegalDocument | null> {
  try {
    const filePath = path.join(CONTENT_PATH, `${id}.mdx`);
    const fileContent = await fs.readFile(filePath, "utf-8");

    const { data, content } = matter(fileContent);

    const frontmatter = data as Record<string, unknown>;

    return {
      id,
      title: typeof frontmatter.title === "string" ? frontmatter.title : id,
      version:
        typeof frontmatter.version === "string" ? frontmatter.version : "1.0",
      lastUpdated:
        typeof frontmatter.lastUpdated === "string"
          ? frontmatter.lastUpdated
          : new Date().toISOString().slice(0, 10),
      content,
    };
  } catch {
    return null;
  }
}

export async function getAllLegalDocuments(): Promise<LegalDocument[]> {
  try {
    const files = await fs.readdir(CONTENT_PATH);
    const mdxFiles = files.filter((f) => f.endsWith(".mdx"));

    const docs = await Promise.all(
      mdxFiles.map(async (file) => {
        const id = file.replace(/\.mdx$/, "");
        return getLegalDocument(id);
      }),
    );

    return docs.filter((d): d is LegalDocument => d !== null);
  } catch {
    return [];
  }
}
