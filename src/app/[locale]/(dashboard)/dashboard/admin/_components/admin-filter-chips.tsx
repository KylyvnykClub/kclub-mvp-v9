"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface FilterChipOption {
  value: string;
  label: string;
  count?: number;
}

export function AdminFilterChips({
  paramName,
  options,
  allLabel,
}: {
  paramName: string;
  options: FilterChipOption[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(paramName) ?? "";

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(paramName, value);
    } else {
      params.delete(paramName);
    }
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const chips: FilterChipOption[] = [
    { value: "", label: allLabel },
    ...options,
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            onClick={() => navigate(chip.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {chip.label}
            {typeof chip.count === "number" && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
