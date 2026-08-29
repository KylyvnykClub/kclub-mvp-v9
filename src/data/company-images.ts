import { count, eq } from "drizzle-orm";

import type { DbClient } from "./db";
import { companies, companyImages } from "./schema";

export async function listImagesByCompany(db: DbClient, companyId: string) {
  return db.query.companyImages.findMany({
    where: eq(companyImages.companyId, companyId),
    orderBy: (image, { asc }) => [asc(image.createdAt)],
  });
}

export type CompanyImageRow = Awaited<
  ReturnType<typeof listImagesByCompany>
>[number];

export async function countImagesByCompany(
  db: DbClient,
  companyId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(companyImages)
    .where(eq(companyImages.companyId, companyId));
  return row?.value ?? 0;
}

export async function insertCompanyImage(
  db: DbClient,
  companyId: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(companyImages)
    .values({ companyId })
    .returning({ id: companyImages.id });
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function deleteCompanyImageRow(
  db: DbClient,
  imageId: string,
): Promise<void> {
  await db.delete(companyImages).where(eq(companyImages.id, imageId));
}

/**
 * One image joined to the facts every caller needs to decide who may see or
 * delete it. The ownership filter lives here rather than at call sites
 * (security.md §1: broken object-level authorization mitigation).
 */
export async function findImageWithCompany(db: DbClient, imageId: string) {
  const [row] = await db
    .select({
      imageId: companyImages.id,
      companyId: companyImages.companyId,
      ownerId: companies.ownerId,
      moderationStatus: companies.moderationStatus,
    })
    .from(companyImages)
    .innerJoin(companies, eq(companies.id, companyImages.companyId))
    .where(eq(companyImages.id, imageId))
    .limit(1);
  return row ?? null;
}

/**
 * Every gallery object a member's erasure owes a DELETE: image rows of all
 * companies they own. Collected before eraseMemberTx removes the rows, so
 * the R2 keys are still derivable afterwards (ADR 0022).
 */
export async function listCompanyImageRefsByOwner(
  db: DbClient,
  ownerId: string,
): Promise<{ companyId: string; imageId: string }[]> {
  return db
    .select({
      companyId: companyImages.companyId,
      imageId: companyImages.id,
    })
    .from(companyImages)
    .innerJoin(companies, eq(companies.id, companyImages.companyId))
    .where(eq(companies.ownerId, ownerId));
}
