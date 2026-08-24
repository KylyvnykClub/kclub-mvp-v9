import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs/promises";
import path from "path";
import { db } from "../src/data/db";
import {
  businessCategories,
  businessCategoryTranslations,
} from "../src/data/schema";

async function seed() {
  const filePath = path.join(process.cwd(), "data", "business_categories.csv");
  const content = await fs.readFile(filePath, "utf-8");
  const translationsPath = path.join(
    process.cwd(),
    "data",
    "business_category_translations.csv",
  );
  const translationsContent = await fs.readFile(translationsPath, "utf-8");

  const lines = content.split("\n").filter((line) => line.trim() !== "");

  // Skip header
  const dataLines = lines.slice(1);

  const categories = dataLines
    .map((line) => {
      // Split by comma, but ignore commas inside quotes
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line
        .split(regex)
        .map((p) => p.trim().replace(/^"|"$/g, ""));

      if (
        parts.length !== 5 ||
        !parts[0] ||
        !parts[1] ||
        !parts[2] ||
        !parts[3] ||
        !parts[4]
      ) {
        console.warn("Invalid line:", line);
        return null;
      }

      return {
        id: parseInt(parts[0], 10),
        block: parts[1],
        category: parts[2],
        subcategory: parts[3],
        status: parts[4],
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  console.log(`Parsed ${categories.length} categories. Inserting into DB...`);

  // Insert in chunks to avoid query size limits (SQLite can handle ~999 vars)
  // Since each row has 5 columns, chunks of 150 rows = 750 vars
  const chunkSize = 150;
  for (let i = 0; i < categories.length; i += chunkSize) {
    const chunk = categories.slice(i, i + chunkSize);
    await db
      .insert(businessCategories)
      .values(chunk)
      .onConflictDoUpdate({
        target: businessCategories.id,
        set: {
          block: sql`EXCLUDED.block`,
          category: sql`EXCLUDED.category`,
          subcategory: sql`EXCLUDED.subcategory`,
          status: sql`EXCLUDED.status`,
        },
      });
    console.log(`Inserted chunk ${i / chunkSize + 1}`);
  }

  const translationLines = translationsContent
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(1);
  const translations = translationLines.map((line) => {
    const parts = line
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((part) => part.trim().replace(/^"|"$/g, "").replaceAll('""', '"'));
    if (parts.length !== 5 || parts.some((part) => !part)) {
      throw new Error(`Invalid classifier translation: ${line}`);
    }
    return {
      businessCategoryId: Number(parts[0]!),
      locale: parts[1]!,
      block: parts[2]!,
      category: parts[3]!,
      subcategory: parts[4]!,
    };
  });

  if (translations.length !== categories.length * 3) {
    throw new Error(
      `Expected ${categories.length * 3} translations, found ${translations.length}`,
    );
  }

  for (let i = 0; i < translations.length; i += chunkSize) {
    const chunk = translations.slice(i, i + chunkSize);
    await db
      .insert(businessCategoryTranslations)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          businessCategoryTranslations.businessCategoryId,
          businessCategoryTranslations.locale,
        ],
        set: {
          block: sql`EXCLUDED.block`,
          category: sql`EXCLUDED.category`,
          subcategory: sql`EXCLUDED.subcategory`,
        },
      });
  }

  console.log(`Seeded ${translations.length} classifier translations.`);
}

import { sql } from "drizzle-orm";

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
