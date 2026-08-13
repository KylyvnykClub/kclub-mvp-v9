import { eq } from "drizzle-orm";
import { appendAuditEntry } from "./audit-log";
import { listActiveSubscriptionsForDeletion } from "./billing";
import type { Db } from "./db";
import { deleteSessionsByMemberId } from "./identity";
import { accountDeletionRequests, members } from "./schema";

export type DeletionSubscriptionChoice = {
  subscriptionId: string;
  decision: "cancel" | "keep";
};

export async function requestAccountDeletionTx(
  db: Db,
  memberId: string,
  choices: DeletionSubscriptionChoice[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const activeSubscriptions = await listActiveSubscriptionsForDeletion(
      tx,
      memberId,
    );
    const activeIds = new Set(
      activeSubscriptions.map((subscription) => subscription.id),
    );
    const choiceBySubscriptionId = new Map(
      choices.map((choice) => [choice.subscriptionId, choice.decision]),
    );

    if (choiceBySubscriptionId.size !== activeIds.size) {
      throw new Error("Every active subscription requires a deletion decision");
    }

    for (const subscriptionId of activeIds) {
      const decision = choiceBySubscriptionId.get(subscriptionId);
      if (decision !== "cancel" && decision !== "keep") {
        throw new Error(
          "Every active subscription requires a deletion decision",
        );
      }
    }

    for (const choice of choiceBySubscriptionId.keys()) {
      if (!activeIds.has(choice)) {
        throw new Error(
          "Deletion decision references an inactive subscription",
        );
      }
    }

    await tx.insert(accountDeletionRequests).values({
      memberId,
      subscriptionChoices: choices,
    });

    await tx
      .update(members)
      .set({ status: "pending_deletion", updatedAt: new Date() })
      .where(eq(members.id, memberId));

    await deleteSessionsByMemberId(tx, memberId);

    await appendAuditEntry(tx, {
      actorType: "member",
      actorId: memberId,
      action: "member.deletion_requested",
      subjectType: "member",
      subjectId: memberId,
      meta: { subscriptionChoices: choices },
      ip: "unknown",
    });
  });
}
