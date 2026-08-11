"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createReferralAction } from "@/actions/referral";
import { toast } from "sonner";

export interface ReferralDialogTranslations {
  title: string;
  description: string;
  clientName: string;
  contactChannel: string;
  serviceNeeded: string;
  note: string;
  consentLabel: string;
  consentError?: string;
  sendAction: string;
  successMessage?: string;
  errorMessage?: string;
}

export function SendReferralDialog({
  recipientCompanyId,
  translations: t,
}: {
  recipientCompanyId: string;
  translations: ReferralDialogTranslations;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    clientName: "",
    contactChannel: "",
    serviceNeeded: "",
    note: "",
    consentAttested: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.consentAttested) {
      toast.error(t.consentError || "You must attest to client consent");
      return;
    }

    startTransition(async () => {
      try {
        await createReferralAction({
          recipientCompanyId,
          clientName: formData.clientName,
          contactChannel: formData.contactChannel,
          serviceNeeded: formData.serviceNeeded,
          note: formData.note,
          consentAttested: true,
        });
        toast.success(t.successMessage || "Lead sent!");
        setOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : undefined;
        toast.error(message || t.errorMessage || "An error occurred");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full font-serif mt-4">
          {t.sendAction || "Send Referral"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-background border-border/50">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {t.title || "Send a Lead"}
          </DialogTitle>
          <DialogDescription>
            {t.description || "Connect a client with this partner."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clientName">{t.clientName}</Label>
            <Input
              id="clientName"
              required
              value={formData.clientName}
              onChange={(e) =>
                setFormData({ ...formData, clientName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactChannel">{t.contactChannel}</Label>
            <Input
              id="contactChannel"
              required
              value={formData.contactChannel}
              onChange={(e) =>
                setFormData({ ...formData, contactChannel: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serviceNeeded">{t.serviceNeeded}</Label>
            <Input
              id="serviceNeeded"
              required
              value={formData.serviceNeeded}
              onChange={(e) =>
                setFormData({ ...formData, serviceNeeded: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">{t.note}</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) =>
                setFormData({ ...formData, note: e.target.value })
              }
            />
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="consent"
              checked={formData.consentAttested}
              onCheckedChange={(c) =>
                setFormData({ ...formData, consentAttested: c === true })
              }
            />
            <Label
              htmlFor="consent"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t.consentLabel}
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {t.sendAction}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
