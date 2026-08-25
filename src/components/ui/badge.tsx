import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-serif text-[0.6875rem] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-[#b17944]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[var(--surface-hover)]",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline: "border-border bg-background text-muted-foreground",
        brand:
          "border-transparent bg-accent/10 text-accent-ink hover:bg-accent/15",
        success:
          "border-transparent bg-[var(--success-subtle)] text-[var(--success)]",
        warning:
          "border-transparent bg-[var(--warning-subtle)] text-[var(--warning)]",
        info: "border-transparent bg-[var(--info-subtle)] text-[var(--info)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
