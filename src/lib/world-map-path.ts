import { MAP_DOTS } from "@/lib/dotted-world-map";

/**
 * The land dots as a single SVG path.
 *
 * 1365 separate `<circle>` elements would be 1365 DOM nodes that never change;
 * one path is one node. Both drawings of this map - the console's revenue chart
 * and the landing hero's planet - want the same geometry at a different dot
 * size, so the builder lives here rather than being written out twice.
 *
 * Call it once at module scope: the result depends only on its argument, and
 * the dots are the same for every render and every viewer.
 */
export function landDotsPath(dotRadius: number): string {
  const parts: string[] = [];

  for (let i = 0; i < MAP_DOTS.length; i += 2) {
    const x = MAP_DOTS[i]!;
    const y = MAP_DOTS[i + 1]!;
    parts.push(
      `M${x - dotRadius} ${y}a${dotRadius} ${dotRadius} 0 1 0 ${dotRadius * 2} 0a${dotRadius} ${dotRadius} 0 1 0 ${-dotRadius * 2} 0`,
    );
  }

  return parts.join("");
}
