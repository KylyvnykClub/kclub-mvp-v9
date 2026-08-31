import { Button, Popover, PopoverContent, PopoverTrigger } from "kclub";

export function InfoPopover() {
  return (
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline">What is a warm introduction?</Button>
      </PopoverTrigger>
      <PopoverContent style={{ maxWidth: 300 }}>
        A club member connects two businesses with recorded consent — no cold
        outreach, no contact trading.
      </PopoverContent>
    </Popover>
  );
}
