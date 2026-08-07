import { eq } from "drizzle-orm";

import type { DbClient } from "./db";
import { profiles } from "./schema";

export async function findProfileByMemberId(db: DbClient, memberId: string) {
  return db.query.profiles.findFirst({
    where: eq(profiles.memberId, memberId),
  });
}

export type ProfileView = Awaited<ReturnType<typeof findProfileByMemberId>>;

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  website?: string;
}

export interface ProfileUpdate {
  bio?: string | null;
  industry?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  socialLinks?: SocialLinks | null;
}

export async function upsertProfile(
  db: DbClient,
  memberId: string,
  values: ProfileUpdate,
): Promise<void> {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.memberId, memberId),
  });

  if (existing) {
    await db
      .update(profiles)
      .set(values)
      .where(eq(profiles.memberId, memberId));
  } else {
    await db.insert(profiles).values({
      memberId,
      ...values,
    });
  }
}
