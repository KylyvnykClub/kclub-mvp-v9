"use client";

import { useState } from "react";
import { moderateCompanyAction } from "@/actions/company";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function ModerateActions({ companyId }: { companyId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleApprove = async () => {
    if (
      !confirm(
        "Are you sure you want to approve this company for the public directory?",
      )
    )
      return;

    setIsLoading(true);
    const res = await moderateCompanyAction(companyId, "approved");
    setIsLoading(false);

    if (res.success) {
      alert("Company approved successfully!");
      router.refresh();
    } else {
      alert(`Error: ${res.error}`);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt("Reason for rejection (will be saved in DB):");
    if (reason === null) return; // cancelled

    setIsLoading(true);
    const res = await moderateCompanyAction(companyId, "rejected", reason);
    setIsLoading(false);

    if (res.success) {
      alert("Company rejected.");
      router.refresh();
    } else {
      alert(`Error: ${res.error}`);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleApprove()}
        disabled={isLoading}
        className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
      >
        <Check className="w-4 h-4 mr-1" /> Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleReject()}
        disabled={isLoading}
        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
      >
        <X className="w-4 h-4 mr-1" /> Reject
      </Button>
    </div>
  );
}
