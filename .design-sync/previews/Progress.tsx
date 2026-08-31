import { Progress } from "kclub";

export function Values() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
      <Progress value={25} />
      <Progress value={60} />
      <Progress value={90} />
    </div>
  );
}
