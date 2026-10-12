import { describe, expect, it, vi } from "vitest";

const list = vi.fn();
vi.mock("./company", () => ({ getPartnersListAction: list }));
vi.mock("@/data/db", () => ({ db: {} }));
vi.mock("@/data/companies", () => ({
  listLocalizedCategoryLabels: () => Promise.resolve([]),
}));

const { searchLandingPartnersAction } = await import("./landing-search");

/**
 * The landing renders its partner grid on the server. With the catalogue
 * closed to visitors, the list refuses an anonymous caller - and that refusal
 * must be an empty grid, not a crashed home page (search engines indexed the
 * crash as "Untitled").
 */
describe("landing partner search", () => {
  it("FR-030: a catalogue closed to visitors is an empty grid, not an error", async () => {
    list.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(
      searchLandingPartnersAction({ locale: "uk" }),
    ).resolves.toEqual({ rows: [], total: 0 });
  });

  it("FR-030: any other failure still surfaces", async () => {
    list.mockRejectedValueOnce(new Error("connection refused"));

    await expect(searchLandingPartnersAction({ locale: "en" })).rejects.toThrow(
      "connection refused",
    );
  });
});
