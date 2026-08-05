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

export async function getLegalDocument(id: string): Promise<LegalDocument | null> {
  try {
    const filePath = path.join(CONTENT_PATH, `${id}.mdx`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    
    const { data, content } = matter(fileContent);

    return {
      id,
      title: data.title || id,
      version: data.version || "1.0",
      lastUpdated: data.lastUpdated || new Date().toISOString().split("T")[0],
      content,
    };
  } catch (error) {
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
      })
    );

    return docs.filter((d): d is LegalDocument => d !== null);
  } catch (error) {
    return [];
  }
}
