/**
 * The FR-020 card renumbering, shared by the manual tool
 * (`pnpm db:renumber-cards`) and the deployment's data migrations
 * (`tools/data-migrations.ts`). Opens nothing itself: the caller brings a
 * client that supports transactions, because each card's new serial and its
 * audit entry are written together.
 */

import type { DbClient } from "../src/data/db";
import { listCardSerials, renumberCard } from "../src/data/members";
import { planCardSerialBackfill } from "../src/lib/card-serial";

export async function backfillCardSerials(
  db: DbClient,
  options: { apply: boolean; log: (line: string) => void },
): Promise<number> {
  const rows = await listCardSerials(db);
  const plan = planCardSerialBackfill(rows);

  options.log(
    `cards: ${rows.length}, already UA-10001 form: ${rows.length - plan.length}, to renumber: ${plan.length}`,
  );

  for (const { cardId, from, country } of plan) {
    if (!options.apply) {
      options.log(`  ${cardId}  ${from}  ->  ${country}-<next>`);
      continue;
    }
    const serial = await renumberCard(db, cardId, country);
    options.log(`  ${cardId}  ${from}  ->  ${serial}`);
  }

  return plan.length;
}
