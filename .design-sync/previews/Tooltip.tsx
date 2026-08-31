import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "kclub";

export function OnButton() {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline">Verified badge</Button>
        </TooltipTrigger>
        <TooltipContent>
          Shown after staff approve the company profile.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
