import { Label, Textarea } from "kclub";

export function WithLabel() {
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      <Label htmlFor="about">Company description</Label>
      <Textarea
        id="about"
        rows={4}
        defaultValue="Boutique legal practice advising founders on EU market entry, contracts, and compliance."
      />
    </div>
  );
}

export function Disabled() {
  return (
    <Textarea
      style={{ maxWidth: 420 }}
      disabled
      placeholder="Moderation notes are read-only after approval."
    />
  );
}
