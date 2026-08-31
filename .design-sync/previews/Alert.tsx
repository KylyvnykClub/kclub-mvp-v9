import { Alert, AlertDescription, AlertTitle } from "kclub";

export function Default() {
  return (
    <Alert style={{ maxWidth: 420 }}>
      <AlertTitle>Membership confirmed</AlertTitle>
      <AlertDescription>
        Your digital club card is ready. Show its QR code to partners to claim
        member offers.
      </AlertDescription>
    </Alert>
  );
}

export function Destructive() {
  return (
    <Alert variant="destructive" style={{ maxWidth: 420 }}>
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>
        We could not renew your VIP subscription. Update the card on file and
        try again.
      </AlertDescription>
    </Alert>
  );
}
