"use client";

import { ReactNode, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface AdminDetailSheetTab {
  value: string;
  label: string;
  content: ReactNode;
}

export function AdminDetailSheet({
  trigger,
  title,
  description,
  tabs,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  tabs: AdminDetailSheetTab[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const sheetOpen = isControlled ? open : internalOpen;
  const setSheetOpen = onOpenChange ?? setInternalOpen;

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      {trigger}
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <Tabs defaultValue={tabs[0]?.value} className="mt-4">
          {/*
            Seven tabs wrapped onto a second line and pushed the panel down.
            One scrolling row keeps the header a fixed height at every width.
          */}
          <TabsList className="w-full justify-start overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
