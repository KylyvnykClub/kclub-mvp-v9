/**
 * Marks a field the form refuses to submit without.
 *
 * Hidden from assistive technology, which already hears "required" from the
 * input's own attribute, so the mark is a visual cue and not a second
 * announcement.
 *
 * Shared rather than redeclared per form: registration puts six required
 * fields on one screen since [ADR 0032], and a mark that appears on four of
 * them reads as "these four" rather than "all of them".
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-accent">
      *
    </span>
  );
}
