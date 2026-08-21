"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    /*
      The stock track is bg-secondary, which in this theme is #ffffff in light
      and #18181b in dark - the same colour as the card it sits on, so an empty
      bar was invisible in both. A muted fill plus a border gives it an edge,
      and the indicator uses the brand accent rather than near-black/near-white.
    */
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full border border-border bg-muted",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-accent transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
