import { Input, Label } from "kclub";

export function WithLabel() {
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
      <Label htmlFor="company">Company name</Label>
      <Input id="company" placeholder="Aurora Consulting" />
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 320 }}>
      <Input placeholder="Phone number" defaultValue="+48 601 234 567" />
      <Input placeholder="Disabled field" disabled />
    </div>
  );
}
