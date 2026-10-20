import { z } from "zod";

/** The longest review a member can write; the column is the same width. */
export const REVIEW_BODY_MAX = 1000;

/**
 * A review as the form posts it (FR-127). The same schema validates in the
 * browser and in the action, which treats it as untrusted input.
 */
export const reviewFormSchema = z.object({
  companyId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(REVIEW_BODY_MAX),
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;
