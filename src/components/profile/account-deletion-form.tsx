"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestAccountDeletionAction } from "@/actions/profile";
import { Button } from "@/components/ui/button";

export interface AccountDeletionSubscriptionView {
  id: string;
  stripeSubscriptionId: string;
  company: { name: string } | null;
}

export function AccountDeletionForm({
  subscriptions,
}: {
  subscriptions: AccountDeletionSubscriptionView[];
}) {
  const t = useTranslations("dashboard");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      action={(formData) => {
        startTransition(async () => {
          try {
            await requestAccountDeletionAction(formData);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : t("deleteAccountFailed");
            alert(message);
          }
        });
      }}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {t("deleteAccountDesc")}
        </p>

        {subscriptions.length > 0 ? (
          <div className="divide-y divide-border border border-border">
            {subscriptions.map((subscription) => (
              <fieldset key={subscription.id} className="space-y-3 p-4">
                <legend className="text-sm font-bold">
                  {subscription.company
                    ? t("deleteListingSubscription", {
                        name: subscription.company.name,
                      })
                    : t("deleteVipSubscription")}
                </legend>
                <p className="font-mono text-xs text-muted-foreground">
                  {subscription.stripeSubscriptionId}
                </p>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    className="mt-1"
                    type="radio"
                    name={`subscription:${subscription.id}`}
                    value="cancel"
                    required
                  />
                  <span>{t("deleteSubscriptionCancel")}</span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    className="mt-1"
                    type="radio"
                    name={`subscription:${subscription.id}`}
                    value="keep"
                    required
                  />
                  <span>{t("deleteSubscriptionKeep")}</span>
                </label>
              </fieldset>
            ))}
          </div>
        ) : (
          <p className="border border-border p-4 text-sm text-muted-foreground">
            {t("deleteNoActiveSubscriptions")}
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          name="confirmDeletion"
          required
        />
        <span>{t("deleteAccountConfirm")}</span>
      </label>

      <Button type="submit" variant="destructive" disabled={isPending}>
        {isPending ? t("deleteAccountSubmitting") : t("deleteAccountButton")}
      </Button>
    </form>
  );
}
