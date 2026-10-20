"use client";

// Client: the stars are an interactive control and the form reports the
// action's result in place (FR-127).
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";

import {
  deleteOwnReviewAction,
  submitReviewAction,
  type ReviewFormState,
} from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_BODY_MAX, reviewFormSchema } from "@/lib/review-form";

export function ReviewForm({
  companyId,
  own,
}: {
  companyId: string;
  /** The review this member already wrote, if any. */
  own: {
    rating: number;
    body: string;
    status: "pending" | "approved" | "rejected";
  } | null;
}) {
  const t = useTranslations("reviews");
  const router = useRouter();
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [body, setBody] = useState(own?.body ?? "");
  const [clientError, setClientError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [state, formAction, pending] = useActionState(
    async (previous: ReviewFormState | null, formData: FormData) => {
      const result = await submitReviewAction(previous, formData);
      if (result.success) router.refresh();
      return result;
    },
    null,
  );

  const validate = (event: React.FormEvent<HTMLFormElement>) => {
    const check = reviewFormSchema.safeParse({ companyId, rating, body });
    if (!check.success) {
      event.preventDefault();
      setClientError(rating < 1 ? t("errorRating") : t("errorBody"));
      return;
    }
    setClientError(null);
  };

  const status = state?.success ? "pending" : own?.status;
  const error =
    clientError ??
    (state && !state.success
      ? t(`error.${state.error ?? "invalid_input"}`)
      : null);

  return (
    <form
      action={formAction}
      onSubmit={validate}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <p className="text-sm font-medium text-foreground">
        {own ? t("formTitleEdit") : t("formTitle")}
      </p>
      {status && (
        <p className="text-xs text-muted-foreground">
          {t(`ownStatus.${status}`)}
        </p>
      )}

      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className="mb-2 text-xs text-muted-foreground">
          {t("ratingLabel")}
        </legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={t("ratingOutOf", { rating: value })}
              aria-pressed={value === rating}
              className="rounded p-1 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Star
                aria-hidden
                className={`size-6 ${
                  value <= rating
                    ? "fill-accent text-accent"
                    : "fill-transparent text-muted-foreground/50"
                }`}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label
          htmlFor={`review-body-${companyId}`}
          className="text-xs text-muted-foreground"
        >
          {t("bodyLabel")}
        </label>
        <Textarea
          id={`review-body-${companyId}`}
          name="body"
          rows={4}
          maxLength={REVIEW_BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("bodyPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("anonymousNote")}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || deleting}>
          {own ? t("submitEdit") : t("submit")}
        </Button>
        {own && (
          <Button
            type="button"
            variant="outline"
            disabled={pending || deleting}
            onClick={() =>
              startDelete(async () => {
                if (!window.confirm(t("deleteConfirm"))) return;
                const result = await deleteOwnReviewAction(companyId);
                if (result.success) {
                  setRating(0);
                  setBody("");
                  router.refresh();
                }
              })
            }
          >
            {t("delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
