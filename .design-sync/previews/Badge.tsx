import { Badge } from "kclub";

export function Variants() {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Badge>Verified</Badge>
      <Badge variant="secondary">Consulting</Badge>
      <Badge variant="outline">Pending</Badge>
      <Badge variant="destructive">Suspended</Badge>
    </div>
  );
}
