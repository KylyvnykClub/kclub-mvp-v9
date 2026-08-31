import { Skeleton } from "kclub";

export function LoadingCard() {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        maxWidth: 360,
      }}
    >
      <Skeleton style={{ width: 48, height: 48, borderRadius: 9999 }} />
      <div style={{ display: "grid", gap: 8, flex: 1 }}>
        <Skeleton style={{ height: 16, width: "70%" }} />
        <Skeleton style={{ height: 12, width: "100%" }} />
        <Skeleton style={{ height: 12, width: "85%" }} />
      </div>
    </div>
  );
}
