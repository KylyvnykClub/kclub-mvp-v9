/**
 * Generates the dotted world map the finance dashboard draws.
 *
 * Usage: pnpm map:generate
 *
 * Why a generator rather than a runtime call. `dotted-map` builds its grid by
 * testing every candidate point against country polygons, which is why its
 * README warns the computation can take seconds. Doing that per request would
 * be absurd, and doing it in the browser would ship the polygon data plus turf
 * and proj4 to every staff member. So the whole thing happens here, once, and
 * the component receives coordinates: no map library reaches the client bundle.
 *
 * The output replaces the country outlines in world-map-paths.ts as the map's
 * visual, but that file stays: it is where the per-country anchor points come
 * from, and it is still the only place this repository knows where a country
 * is.
 */

import DottedMap from "dotted-map";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(
  import.meta.dirname,
  "..",
  "src",
  "app",
  "[locale]",
  "(dashboard)",
  "dashboard",
  "admin",
  "_components",
);
const SOURCE = join(COMPONENTS, "world-map-paths.ts");
const OUTPUT = join(COMPONENTS, "dotted-world-map.ts");

/**
 * Dot rows from pole to pole. Sized for the panel it renders in, which is 256px
 * tall: 40 rows puts the dots roughly six pixels apart, which reads as a map
 * rather than as a texture, and keeps the shipped coordinate list near 11 KB.
 * Raising it costs bundle size quadratically.
 */
const HEIGHT = 40;

interface Anchor {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Path length, used only to tell a country from a same-coded enclave. */
  size: number;
}

/**
 * Two ISO codes in world-map-paths.ts are used twice, because Natural Earth
 * carries partially recognised territories with no ISO code of their own and
 * whatever generated that file gave them someone else's:
 *
 *   CN → People's Republic of China, and Turkish Republic of Northern Cyprus
 *   SL → Sierra Leone, and Somaliland
 *
 * The map component this replaces builds its lookup with `new Map(...)`, where
 * the later entry wins - so revenue from China has been plotted on Northern
 * Cyprus, and Sierra Leone's on Somaliland.
 *
 * Resolved by naming the two territories rather than by a rule. The obvious
 * rule - keep the bigger landmass - is wrong here: Somaliland's outline is
 * longer than Sierra Leone's, so it would have quietly taken SL. Neither
 * territory has an ISO 3166-1 code, no payment processor will ever report one,
 * and the map has no way to show them, so they are dropped. The underlying data
 * defect is filed separately.
 */
const NOT_ISO_COUNTRIES = new Set([
  "Turkish Republic of Northern Cyprus",
  "Somaliland",
]);

function readAnchors(): Anchor[] {
  const source = readFileSync(SOURCE, "utf8");
  const pattern =
    /id:\s*"([A-Z]{2})",\s*name:\s*"([^"]+)",\s*d:\s*"([^"]*)",\s*x:\s*([\d.-]+),\s*y:\s*([\d.-]+),/g;

  const all: Anchor[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    all.push({
      id: match[1]!,
      name: match[2]!,
      size: match[3]!.length,
      x: Number(match[4]),
      y: Number(match[5]),
    });
  }

  if (all.length < 150) {
    throw new Error(
      `Only ${all.length} anchors parsed from world-map-paths.ts; the shape of that file probably changed.`,
    );
  }

  const byId = new Map<string, Anchor>();
  for (const anchor of all) {
    if (NOT_ISO_COUNTRIES.has(anchor.name)) {
      console.log(`dropping "${anchor.name}" - miscoded as ${anchor.id}`);
      continue;
    }

    const held = byId.get(anchor.id);
    if (held) {
      // Any duplicate beyond the two known ones is new, and guessing which
      // entry owns the code is exactly how China ended up on Cyprus.
      throw new Error(
        `Unhandled duplicate for ${anchor.id}: "${held.name}" and "${anchor.name}". ` +
          `Decide which one owns the code and add the other to NOT_ISO_COUNTRIES.`,
      );
    }

    byId.set(anchor.id, anchor);
  }

  return [...byId.values()];
}

/**
 * world-map-paths.ts holds each country's label anchor in a 100x40 box, not in
 * degrees, and `dotted-map` wants degrees. The box is a plain equirectangular
 * projection cropped top and bottom, so the inverse is linear in both axes.
 *
 * The latitude constants are fitted rather than assumed, and `checkFit` below
 * re-measures them against countries whose real position is known. If someone
 * regenerates world-map-paths.ts from a different projection, that check fails
 * loudly instead of quietly moving every pin.
 */
const LAT_AT_TOP = 84.163;
const LAT_PER_Y = -3.5779;

const toLng = (x: number) => (x / 100) * 360 - 180;
const toLat = (y: number) => LAT_AT_TOP + LAT_PER_Y * y;

/** Real positions, for checking the inverse projection still holds. */
const KNOWN: Record<string, [lng: number, lat: number]> = {
  US: [-98.5, 39.8],
  BR: [-51.9, -14.2],
  AU: [134.5, -25.7],
  ZA: [24.7, -29.0],
  JP: [138.0, 36.2],
  UA: [31.2, 48.4],
  IN: [79.6, 22.9],
  EG: [29.9, 26.8],
};

const MAX_DEGREES_OFF = 3;

function checkFit(anchors: Anchor[]): void {
  const failures: string[] = [];

  for (const [id, [lng, lat]] of Object.entries(KNOWN)) {
    const anchor = anchors.find((candidate) => candidate.id === id);
    if (!anchor) {
      failures.push(`${id}: missing from world-map-paths.ts`);
      continue;
    }

    const lngOff = Math.abs(toLng(anchor.x) - lng);
    const latOff = Math.abs(toLat(anchor.y) - lat);
    if (lngOff > MAX_DEGREES_OFF || latOff > MAX_DEGREES_OFF) {
      failures.push(
        `${id}: off by ${lngOff.toFixed(2)}° lng, ${latOff.toFixed(2)}° lat`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "The inverse projection no longer matches known country positions:\n  " +
        failures.join("\n  ") +
        "\nRe-fit LAT_AT_TOP and LAT_PER_Y before regenerating.",
    );
  }
}

function main(): void {
  const anchors = readAnchors();
  checkFit(anchors);
  console.log(`anchors: ${anchors.length}, inverse projection checks out`);

  // The background grid, with no pins on it.
  const background = new DottedMap({ height: HEIGHT, grid: "diagonal" });
  const dots = background.getPoints();

  // A second map carrying one pin per country, so each country's grid position
  // can be read off. Pins snap to the grid, so two neighbours can land on the
  // same dot - reported below rather than silently overlapping.
  const pinned = new DottedMap({ height: HEIGHT, grid: "diagonal" });
  for (const anchor of anchors) {
    pinned.addPin({
      lat: toLat(anchor.y),
      lng: toLng(anchor.x),
      data: { id: anchor.id },
    });
  }

  const pins = new Map<string, [number, number]>();
  const occupied = new Map<string, string[]>();
  for (const point of pinned.getPoints()) {
    const id = (point as { data?: { id?: string } }).data?.id;
    if (!id) continue;
    pins.set(id, [round(point.x), round(point.y)]);
    const key = `${round(point.x)},${round(point.y)}`;
    occupied.set(key, [...(occupied.get(key) ?? []), id]);
  }

  const collisions = [...occupied.values()].filter((ids) => ids.length > 1);
  console.log(`dots: ${dots.length}, pins: ${pins.size}`);
  if (collisions.length > 0) {
    console.log(
      `note: ${collisions.length} grid cell(s) hold more than one country, which at this ` +
        `resolution is expected for small neighbours:\n  ` +
        collisions.map((ids) => ids.join(", ")).join("\n  "),
    );
  }

  const missing = anchors.filter((anchor) => !pins.has(anchor.id));
  if (missing.length > 0) {
    throw new Error(
      `No grid position for: ${missing.map((a) => a.id).join(", ")}`,
    );
  }

  const xs = dots.map((dot) => dot.x);
  const ys = dots.map((dot) => dot.y);
  const width = Math.max(...xs);
  const height = Math.max(...ys);

  // A flat array rather than objects: same information, roughly a third of the
  // bytes over the wire, and the component reads it in pairs.
  const flat = dots.flatMap((dot) => [round(dot.x), round(dot.y)]);

  const file = `// GENERATED by tools/generate-dotted-map.ts - do not edit by hand.
// Regenerate with: pnpm map:generate
//
// Land dots and per-country positions for the finance dashboard's revenue map,
// precomputed so that neither dotted-map nor its polygon data reaches the
// browser. Coordinates are in the grid's own units; see MAP_WIDTH/MAP_HEIGHT
// for the viewBox they belong to.

/** Grid extent, for the SVG viewBox. */
export const MAP_WIDTH = ${round(width)};
export const MAP_HEIGHT = ${round(height)};

/** Spacing between neighbouring dots, for choosing a dot radius. */
export const MAP_STEP = ${round(step(xs))};

/** Land dots, flattened as [x0, y0, x1, y1, ...]. */
export const MAP_DOTS: readonly number[] = ${JSON.stringify(flat)};

/** Where each ISO 3166-1 alpha-2 country sits on the grid. */
export const COUNTRY_POSITIONS: Readonly<Record<string, readonly [number, number]>> = ${JSON.stringify(
    Object.fromEntries(
      [...pins.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
  )};
`;

  writeFileSync(OUTPUT, file, "utf8");
  console.log(
    `wrote ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB, ${dots.length} dots)`,
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The smallest non-zero gap between distinct x values: the grid pitch. */
function step(xs: number[]): number {
  const unique = [...new Set(xs)].sort((a, b) => a - b);
  let smallest = Infinity;
  for (let i = 1; i < unique.length; i++) {
    smallest = Math.min(smallest, unique[i]! - unique[i - 1]!);
  }
  return Number.isFinite(smallest) ? smallest : 1;
}

main();
