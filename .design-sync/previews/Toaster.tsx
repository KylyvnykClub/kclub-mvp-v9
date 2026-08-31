import { useEffect } from "react";
import { Toaster, toast } from "kclub";

export function Notifications() {
  useEffect(() => {
    toast.success("Company approved", {
      description: "Aurora Consulting is now in the partner catalogue.",
      duration: 60000,
    });
    toast("New introduction request", {
      description: "A member wants to connect with your company.",
      duration: 60000,
    });
  }, []);

  return <Toaster position="top-left" expand />;
}
