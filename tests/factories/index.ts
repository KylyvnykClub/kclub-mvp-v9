import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { deterministicClock, deterministicIdSource } from "@/domain/context.js";
import type { Clock, IdSource } from "@/domain/context.js";

export interface FactoryContext<TSchema extends Record<string, unknown>> {
  db: NodePgDatabase<TSchema>;
  clock: Clock;
  ids: IdSource;
}

const DEFAULT_EPOCH = new Date("2026-01-01T00:00:00Z");

export function createFactoryContext<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
  options?: { epoch?: Date },
): FactoryContext<TSchema> {
  return {
    db,
    clock: deterministicClock(options?.epoch ?? DEFAULT_EPOCH),
    ids: deterministicIdSource(),
  };
}
