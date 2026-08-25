import pg from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/data/schema/index.js";
import { hashPassword } from "@/modules/identity/crypto.js";
import { createCardPublicToken, hashCardToken } from "@/lib/card-token.js";

/**
 * The data every e2e screen is audited against.
 *
 * Committed, not rolled back: the application runs in its own process and can
 * only see what a transaction has committed, so the per-test rollback the
 * integration suite relies on (tests/setup/integration-setup.ts) is no use
 * here.
 *
 * Deliberately small. This exists so that ten screens render something real -
 * a catalogue with results, a partner with a discount, a card that resolves -
 * not to reproduce production. Anything an accessibility audit does not look at
 * is not seeded.
 */

export const E2E = {
  memberPhone: "+380000000001",
  vipPhone: "+380000000002",
  password: "e2e-harness-password",
  companySlug: "northern-lights-bakery",
} as const;

export interface SeededFixtures {
  memberId: string;
  vipId: string;
  cardToken: string;
  companySlug: string;
}

export async function seedE2eFixtures(
  connectionString: string,
  authSecret: string,
): Promise<SeededFixtures> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const db = drizzle(client, { schema });
    const passwordHash = await hashPassword(E2E.password);

    const [category] = await db
      .insert(schema.businessCategories)
      .values({
        id: 1,
        block: "Services",
        category: "Food",
        subcategory: "Bakery",
      })
      .onConflictDoNothing()
      .returning({ id: schema.businessCategories.id });

    const categoryId = category?.id ?? 1;

    const [member] = await db
      .insert(schema.members)
      .values({
        phone: E2E.memberPhone,
        passwordHash,
        displayName: "Ada Member",
        country: "PL",
        language: "en",
      })
      .returning({ id: schema.members.id });

    const [vip] = await db
      .insert(schema.members)
      .values({
        phone: E2E.vipPhone,
        passwordHash,
        displayName: "Vera VIP",
        country: "PL",
        language: "en",
      })
      .returning({ id: schema.members.id });

    if (!member || !vip) throw new Error("e2e seed: members were not created");

    // The public token is derived from the card id and the auth secret and
    // stored only as a hash, exactly as registration does it - deriving it here
    // by hand would prove the screen works against a token the application
    // would never issue.
    const [card] = await db
      .insert(schema.cards)
      .values({
        memberId: member.id,
        serial: "KCLUB-E2E001",
        token: "placeholder",
        tier: "free",
      })
      .returning({ id: schema.cards.id });

    if (!card) throw new Error("e2e seed: card was not created");

    const cardToken = createCardPublicToken(card.id, authSecret);
    // cardTokenLookup matches either column (data-storage.md's expand/migrate
    // step is mid-flight), and both hold the hash - the database never holds a
    // usable bearer token.
    await db
      .update(schema.cards)
      .set({
        token: hashCardToken(cardToken),
        tokenHash: hashCardToken(cardToken),
      })
      .where(eq(schema.cards.id, card.id));

    await db.insert(schema.companies).values({
      ownerId: vip.id,
      businessCategoryId: categoryId,
      name: "Northern Lights Bakery",
      slug: E2E.companySlug,
      description:
        "A bakery used by the accessibility harness. Long enough to exercise the description block on the partner page without being lorem ipsum.",
      country: "PL",
      city: "Kraków",
      discount: "15% off for members",
      contactEmail: "hello@example.test",
      moderationStatus: "approved",
    });

    return {
      memberId: member.id,
      vipId: vip.id,
      cardToken,
      companySlug: E2E.companySlug,
    };
  } finally {
    await client.end();
  }
}
