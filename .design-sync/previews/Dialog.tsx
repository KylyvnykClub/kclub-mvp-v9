import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "kclub";

export function ConfirmDialog() {
  return (
    <Dialog open>
      <DialogContent style={{ maxWidth: 420 }}>
        <DialogHeader>
          <DialogTitle>Submit for moderation?</DialogTitle>
          <DialogDescription>
            Your company profile will be reviewed by club staff before it
            appears in the partner catalogue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Keep editing</Button>
          <Button>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
