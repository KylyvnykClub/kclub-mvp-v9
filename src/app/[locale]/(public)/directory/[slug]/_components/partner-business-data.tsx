/**
 * The sidebar's "business data" table. One row per field of the business card
 * as specified in requirements.md §4 - country of registration, service
 * countries, working format, both administrative levels, city, block, category
 * and subcategories. A field the partner did not fill is dropped rather than
 * rendered empty: the levels are conditionally required by country, so a blank
 * row would read as missing data rather than as not applicable.
 */
export type BusinessDataRow =
  | { label: string; value: string; tags?: never }
  | { label: string; tags: string[]; value?: never };

export function PartnerBusinessData({
  title,
  rows,
}: {
  title: string;
  rows: BusinessDataRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </span>
      </div>

      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-3 last:border-b-0"
          >
            <dt className="max-w-[9.5rem] shrink-0 text-xs leading-snug text-muted-foreground">
              {row.label}
            </dt>
            {row.tags ? (
              <dd className="flex flex-wrap justify-end gap-1.5">
                {row.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[11px] leading-relaxed text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            ) : (
              <dd className="text-right text-[13px] leading-snug text-foreground">
                {row.value}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
