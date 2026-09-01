import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled block of a console screen - a chart, a table, a queue. Every
 * section shares this header so the screens cannot drift on where the title,
 * the description and the section-level action sit. `action` is the slot for
 * a "view all" link or a small control, rendered top-right.
 */
export function ConsoleSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-5 pb-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className={cn("flex-1 p-5 pt-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
