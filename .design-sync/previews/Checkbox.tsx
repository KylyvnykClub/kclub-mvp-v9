import { Checkbox, Label } from "kclub";

export function States() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Checkbox id="c1" defaultChecked />
        <Label htmlFor="c1">I accept the club rules</Label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Checkbox id="c2" />
        <Label htmlFor="c2">Subscribe to partner offers</Label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Checkbox id="c3" disabled />
        <Label htmlFor="c3" style={{ opacity: 0.5 }}>
          Unavailable option
        </Label>
      </div>
    </div>
  );
}
