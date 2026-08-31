import { Avatar, AvatarFallback } from "kclub";

export function Initials() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar>
        <AvatarFallback>GK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AC</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>VS</AvatarFallback>
      </Avatar>
    </div>
  );
}
