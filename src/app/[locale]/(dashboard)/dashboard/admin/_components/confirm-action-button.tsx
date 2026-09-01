"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * A button whose action only runs after an explicit confirmation. Used for
 * the console's destructive rows (delete a taxonomy entry, disable a staff
 * account): the server action arrives as a prop, errors surface as toasts
 * instead of an error boundary, and the screen refreshes with filters intact.
 */
export function ConfirmActionButton({
  action,
  label,
  title,
  description,
  confirmLabel,
  successMessage,
  destructive = true,
  icon,
  disabled,
}: {
  /** Bound server action; runs only after the dialog is confirmed. */
  action: () => Promise<void>;
  /** Trigger text, also the accessible name when `icon` replaces it. */
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  destructive?: boolean;
  /** Optional icon-only trigger; `label` becomes aria-label + title. */
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : tCommon("error"),
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {icon ? (
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={label}
            title={label}
            disabled={disabled}
          >
            {icon}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={disabled}>
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={run}
            disabled={isPending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
