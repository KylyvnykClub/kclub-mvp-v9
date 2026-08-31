import { Input, Label } from "kclub";

export function WithField() {
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
      <Label htmlFor="email">Work email</Label>
      <Input id="email" type="email" placeholder="name@company.com" />
    </div>
  );
}
