import Image from "next/image";

import { MAP_HEIGHT, MAP_STEP, MAP_WIDTH } from "@/lib/dotted-world-map";
import { landDotsPath } from "@/lib/world-map-path";

/**
 * The hero's backdrop: a night sky, a city on the horizon, and the curve of
 * the planet under it.
 *
 * The reference is a rendered montage - Earth's limb with the Eiffel Tower and
 * the Statue of Liberty composited onto it - and this repository does not own
 * that artwork. What it does own is a licensed night-skyline photograph and the
 * world's coordinates, so the composition is rebuilt from those rather than
 * approximated with a single stock image:
 *
 *   - the sky is drawn, not photographed, so it costs nothing and never clashes
 *     with the gold;
 *   - the city band is `hero-city.jpg`, cropped to its horizon and faded at both
 *     edges, so it reads as a lit skyline rather than as an aerial photograph;
 *   - the planet is a curve, and the city lights on it are the same dotted world
 *     map the finance dashboard plots, clipped to the limb. The continents are
 *     really the continents.
 *
 * The geometry is drawn in a 100x100 box with `preserveAspectRatio="none"`, so
 * the horizon sits at the same fraction of the panel on a phone and on a
 * desktop instead of the curve flattening out as the viewport widens.
 *
 * Decorative in full: `aria-hidden`, no title, no role.
 */

/** The limb: a shallow dome whose crown sits at 58% of the panel's height. */
const HORIZON = "M-5,73 Q50,45 105,73";
const PLANET_BODY = `${HORIZON} L105,105 L-5,105 Z`;

/** Slightly finer than the console's dots: these are city lights, not data. */
const LAND_PATH = landDotsPath(MAP_STEP * 0.34);

export function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Night sky. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #04060b 0%, #070d1a 42%, #0b1526 56%, #06080e 70%)",
        }}
      />

      {/* The city, sitting on the horizon. Anchored so the photograph's own
          skyline lands just above the limb, and masked top and bottom so
          neither the sky nor the planet shows a seam. */}
      <div
        className="absolute inset-x-0"
        style={{
          // The band ends where the limb crowns (59%), so the skyline stands on
          // the planet rather than floating above it.
          top: "36%",
          height: "24%",
          maskImage:
            "linear-gradient(180deg, transparent 0%, #000 28%, #000 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, #000 28%, #000 88%, transparent 100%)",
        }}
      >
        <Image
          src="/brand/backgrounds/hero-city.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-[1.6] object-cover object-[center_46%] opacity-90"
        />
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id="kc-planet-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1526" />
            <stop offset="45%" stopColor="#070a12" />
            <stop offset="100%" stopColor="#05070c" />
          </linearGradient>

          {/* The atmosphere: bright on the limb, gone within a few percent. */}
          <linearGradient id="kc-planet-rim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#f2d489" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0.15" />
          </linearGradient>

          <filter
            id="kc-rim-glow"
            x="-20%"
            y="-200%"
            width="140%"
            height="500%"
          >
            <feGaussianBlur stdDeviation="1.6" />
          </filter>

          <clipPath id="kc-planet-clip">
            <path d={PLANET_BODY} />
          </clipPath>
        </defs>

        <path d={PLANET_BODY} fill="url(#kc-planet-body)" />

        {/* City lights on the night side: the real world map, laid over the
            limb and clipped to it. */}
        <g clipPath="url(#kc-planet-clip)" opacity="0.5">
          <g
            transform={`translate(-6 58) scale(${112 / MAP_WIDTH} ${46 / MAP_HEIGHT})`}
          >
            <path d={LAND_PATH} fill="#e8c66a" />
          </g>
        </g>

        {/* Glow first, hairline second, so the limb has a core and a halo. */}
        <path
          d={HORIZON}
          fill="none"
          stroke="url(#kc-planet-rim)"
          strokeWidth="1.6"
          filter="url(#kc-rim-glow)"
          opacity="0.75"
        />
        <path
          d={HORIZON}
          fill="none"
          stroke="url(#kc-planet-rim)"
          strokeWidth="0.35"
          opacity="0.9"
        />
      </svg>

      {/* Gold wash behind the emblem, then clean ground under the type. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 30%, rgba(212,175,55,0.20) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(72% 46% at 50% 64%, rgba(5,7,12,0.93) 0%, rgba(5,7,12,0.74) 48%, transparent 84%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#07090f] to-transparent" />
    </div>
  );
}
