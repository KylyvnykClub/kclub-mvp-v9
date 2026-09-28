import { expect, test } from "@playwright/test";

/**
 * FR-001 / ADR 0027: the sign-in form's country picker must stay open when
 * focus goes back to the number box.
 *
 * On a sign-in form the number box is the username field, and Safari's
 * password AutoFill returns focus to it the moment the country trigger is
 * clicked. The picker used to treat that as "focus left the panel" and close,
 * so on a Mac with saved passwords the country could not be changed at all
 * (reported 2026-09-28 with a screen recording). Playwright's WebKit has no
 * AutoFill panel, so this reproduces its effect directly: open the list, move
 * focus to the number box, and the list must still be there to choose from.
 */
test("FR-001: the phone country list survives focus returning to the number box", async ({
  page,
}) => {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("combobox", { name: "Country" });
  await trigger.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();

  await page.locator("#phone").focus();
  await expect(list).toBeVisible();

  await list.getByRole("option", { name: /Ukraine/ }).click();
  await expect(trigger).toContainText("+380");
  await expect(list).toBeHidden();
});

test("FR-001: the phone country list still closes on a click outside and on Escape", async ({
  page,
}) => {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("combobox", { name: "Country" });
  const list = page.getByRole("listbox");

  await trigger.click();
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();

  await trigger.click();
  await expect(list).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(list).toBeHidden();
});
