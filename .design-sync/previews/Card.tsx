import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "kclub";

export function PartnerCard() {
  return (
    <Card style={{ maxWidth: 380 }}>
      <CardHeader>
        <CardTitle>Aurora Consulting</CardTitle>
        <CardDescription>
          Legal and tax advisory for founders expanding into the EU.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge>Verified partner</Badge>
          <Badge variant="secondary">Consulting</Badge>
        </div>
      </CardContent>
      <CardFooter style={{ display: "flex", gap: 12 }}>
        <Button size="sm">View offer</Button>
        <Button size="sm" variant="outline">
          Contact
        </Button>
      </CardFooter>
    </Card>
  );
}

export function StatCard() {
  return (
    <Card style={{ maxWidth: 260, textAlign: "center" }}>
      <CardHeader>
        <CardDescription>Active members</CardDescription>
        <CardTitle style={{ fontSize: 40 }}>1,248</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>+12% over the last quarter</CardDescription>
      </CardContent>
    </Card>
  );
}
