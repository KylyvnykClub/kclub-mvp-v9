import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "kclub";

export function FilterSheet() {
  return (
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filter partners</SheetTitle>
          <SheetDescription>
            Narrow the catalogue by category, country, and city.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter style={{ marginTop: 24 }}>
          <Button variant="outline">Reset</Button>
          <Button>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
