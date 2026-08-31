import { Button } from "kclub";

export function Variants() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Button>Join the club</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Delete</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Become a member</Button>
    </div>
  );
}

export function States() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Button disabled>Processing…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
