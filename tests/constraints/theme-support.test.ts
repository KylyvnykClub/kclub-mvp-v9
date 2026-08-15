import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FR-092: a light and a dark theme, following the operating system by default,
 * with a manual override that persists.
 *
 * The behaviour belongs to next-themes; what this repository owns is the
 * configuration it is given, and a switch that actually reaches it. Both are
 * one edit away from silently regressing - `defaultTheme="dark"` would still
 * render, still pass a build, and quietly stop following the system.
 */

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const PROVIDER = read("src/components/theme-provider.tsx");
const TOGGLE = read("src/components/theme-toggle.tsx");
const LAYOUT = read("src/app/[locale]/layout.tsx");

describe("constraint: theme support (FR-092)", () => {
  it("follows the operating system by default", () => {
    expect(PROVIDER).toMatch(/defaultTheme=["']system["']/);
    expect(PROVIDER).toMatch(/enableSystem/);
  });

  it("drives the theme through the class attribute the stylesheet keys on", () => {
    expect(PROVIDER).toMatch(/attribute=["']class["']/);
  });

  it("wraps the application, so the theme reaches every page", () => {
    expect(LAYOUT).toMatch(/<ThemeProvider/);
  });

  it("offers a manual override rather than only following the system", () => {
    expect(TOGGLE).toMatch(/useTheme/);
    expect(TOGGLE).toMatch(/setTheme/);
  });

  it("offers both themes by name", () => {
    expect(TOGGLE).toMatch(/["']light["']/);
    expect(TOGGLE).toMatch(/["']dark["']/);
  });

  it("defines both palettes, so the dark theme is a design and not an inversion", () => {
    const styles = read("src/app/globals.css");

    expect(styles).toMatch(/:root/);
    expect(styles).toMatch(/\.dark/);
  });
});
