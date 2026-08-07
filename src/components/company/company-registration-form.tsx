"use client";

import { useState, useEffect, useActionState } from "react";
import Link from "next/link";
import {
  registerCompanyAction,
  getBlocksAction,
  getCategoriesByBlockAction,
  getSubcategoriesByCategoryAction,
} from "@/actions/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CompanyRegistrationForm() {
  const [state, action, pending] = useActionState(registerCompanyAction, null);

  const [blocks, setBlocks] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<
    { id: number; subcategory: string }[]
  >([]);

  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");

  useEffect(() => {
    void getBlocksAction().then(setBlocks);
  }, []);

  useEffect(() => {
    if (selectedBlock) {
      void getCategoriesByBlockAction(selectedBlock).then(setCategories);
      setSelectedCategory("");
      setSelectedSubcategory("");
    } else {
      setCategories([]);
    }
  }, [selectedBlock]);

  useEffect(() => {
    if (selectedBlock && selectedCategory) {
      void getSubcategoriesByCategoryAction(
        selectedBlock,
        selectedCategory,
      ).then(setSubcategories);
      setSelectedSubcategory("");
    } else {
      setSubcategories([]);
    }
  }, [selectedBlock, selectedCategory]);

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <p className="text-sm text-red-500 bg-red-500/10 p-3 rounded-none border border-red-500/20">
          {state.error}
        </p>
      )}
      {state?.success && (
        <div className="text-sm text-green-500 bg-green-500/10 p-4 rounded-none border border-green-500/20">
          <p className="font-bold mb-2">Company registered successfully!</p>
          <Link
            href="/dashboard/profile"
            className="underline hover:text-green-400"
          >
            Return to Profile
          </Link>
        </div>
      )}

      {!state?.success && (
        <>
          <div className="space-y-4">
            <h2 className="font-serif text-xl border-b border-border/50 pb-2">
              Business Category
            </h2>

            <div className="space-y-2">
              <Label htmlFor="block">Business Block</Label>
              <select
                id="block"
                className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                required
              >
                <option value="">Select a block...</option>
                {blocks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={!selectedBlock}
                required
              >
                <option value="">Select a category...</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessCategoryId">Subcategory (Activity)</Label>
              <select
                id="businessCategoryId"
                name="businessCategoryId"
                className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
                disabled={!selectedCategory}
                required
              >
                <option value="">Select specific activity...</option>
                {subcategories.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.subcategory}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h2 className="font-serif text-xl border-b border-border/50 pb-2">
              Company Details
            </h2>

            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Acme Corp"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="legalName">Legal Entity Name (Optional)</Label>
              <Input
                id="legalName"
                name="legalName"
                placeholder="e.g. Acme Corporation LLC"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxId">Tax ID / EDRPOU (Optional)</Label>
                <Input id="taxId" name="taxId" placeholder="12345678" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website (Optional)</Label>
                <Input
                  id="website"
                  name="website"
                  placeholder="https://acme.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL (Optional)</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                placeholder="https://acme.com/logo.png"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  placeholder="e.g. Ukraine"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="e.g. Kyiv" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Briefly describe your company's core business..."
                rows={4}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h2 className="font-serif text-xl border-b border-border/50 pb-2">
              Partner Details
            </h2>
            <p className="text-sm text-muted-foreground">
              This information will be displayed in the public Partners
              Directory.
            </p>

            <div className="space-y-2">
              <Label htmlFor="discount">Provided Discount</Label>
              <Input
                id="discount"
                name="discount"
                placeholder="e.g. 15% discount for KCLUB members"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  placeholder="partners@acme.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  placeholder="+380991234567"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={pending || !selectedSubcategory}
            className="w-full"
          >
            {pending ? "Registering..." : "Register Company"}
          </Button>
        </>
      )}
    </form>
  );
}
