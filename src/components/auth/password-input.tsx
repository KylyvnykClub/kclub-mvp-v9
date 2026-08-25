"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password input that can reveal what it holds, plus an optional inline
 * problem line.
 *
 * Every password field in the product uses this, so the reveal control behaves
 * the same everywhere. It deliberately renders no label: the login form pairs
 * its label with a "forgot password" control on the same row, and the staff
 * form has no label at all, so ownership of the label stays with the caller.
 *
 * Visibility is per instance. A form showing both a password and its
 * confirmation gets two independent toggles, because revealing the
 * confirmation to hunt a typo should not expose the field above it.
 */
export function PasswordInput({
  showLabel,
  hideLabel,
  problem,
  className,
  id,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  showLabel: string;
  hideLabel: string;
  /** Pass to render a problem line; omit and no line is rendered at all. */
  problem?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const problemId = `${id ?? generatedId}-problem`;
  const showsProblem = problem !== undefined;

  return (
    <>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className={cn("pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {showsProblem && (
        // Announced politely rather than asserted: the text changes on every
        // keystroke, and role="alert" would interrupt a screen reader mid-word.
        <p
          id={problemId}
          aria-live="polite"
          className="text-sm text-destructive"
        >
          {problem}
        </p>
      )}
    </>
  );
}
