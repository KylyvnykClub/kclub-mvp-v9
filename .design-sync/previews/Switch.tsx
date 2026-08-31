import { Label, Switch } from "kclub";

export function States() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Switch id="s1" defaultChecked />
        <Label htmlFor="s1">Email notifications</Label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Switch id="s2" />
        <Label htmlFor="s2">Public company profile</Label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Switch id="s3" disabled />
        <Label htmlFor="s3" style={{ opacity: 0.5 }}>
          Locked setting
        </Label>
      </div>
    </div>
  );
}
