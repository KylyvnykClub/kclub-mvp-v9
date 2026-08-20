import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export function AdminSearchInput({
  defaultValue,
  placeholder,
  submitLabel,
  paramName = "q",
}: {
  defaultValue?: string;
  placeholder: string;
  submitLabel: string;
  paramName?: string;
}) {
  return (
    <form className="flex max-w-sm gap-2">
      <Input
        type="search"
        name={paramName}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
      <Button
        type="submit"
        variant="outline"
        size="icon"
        aria-label={submitLabel}
      >
        <Search className="size-4" />
      </Button>
    </form>
  );
}
