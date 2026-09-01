/**
 * Eyebrow heading above a group of tiles or cards. One place for the
 * letterspacing so the overview and the support screen cannot drift.
 */
export function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}
