import { Separator } from "kclub";

export function Horizontal() {
  return (
    <div style={{ maxWidth: 360 }}>
      <p style={{ fontWeight: 600 }}>Membership</p>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        Digital card and partner offers.
      </p>
      <Separator style={{ margin: "12px 0" }} />
      <p style={{ fontWeight: 600 }}>Business introductions</p>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        Warm contacts inside the club.
      </p>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", height: 24 }}>
      <span>Catalogue</span>
      <Separator orientation="vertical" />
      <span>Offers</span>
      <Separator orientation="vertical" />
      <span>Support</span>
    </div>
  );
}
