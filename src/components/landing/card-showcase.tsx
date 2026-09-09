import Image from "next/image";
import { useTranslations } from "next-intl";

/**
 * The membership card, as the landing page shows it.
 *
 * Built in CSS over the club's emblem rather than as a photograph of a gold
 * plate: the plate carried the previous mark ("KQ", "BUSINESS CLUB") and could
 * not be re-lettered without a new render, while the card here is text the
 * browser draws — so the serial, the tier and the language change with the
 * page, and the only artwork is the emblem itself.
 *
 * Black and gold are the mark's own colours (`--accent`, `#d4af37`). The
 * emblem PNG carries brightness as alpha, so it composites onto the dark card
 * exactly as it was drawn and needs no background of its own.
 */
export function CardShowcase() {
  const t = useTranslations("home");

  return (
    <section className="dark kclub-section overflow-hidden bg-zinc-950 text-white">
      <div className="kclub-shell grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="kclub-eyebrow !text-white/55">
            {t("hero.cardEyebrow")}
          </p>
          <h2 className="mt-6 text-4xl font-black uppercase leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {t("features.items.0.title")}
          </h2>
          <p className="mt-6 max-w-lg text-lg font-light leading-8 text-white/65">
            {t("features.items.0.description")} {t("hero.stats.verified.copy")}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[460px]">
          {/* The glow is the only thing suggesting the card is lit; it sits
              behind and is invisible to a screen reader. */}
          <div
            className="pointer-events-none absolute -inset-10 opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 70% 25%, rgba(212,175,55,0.28), transparent 70%)",
            }}
            aria-hidden="true"
          />

          <div className="relative aspect-[1.586] w-full overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#141210_0%,#0a0a0b_45%,#171308_100%)] shadow-[0_30px_90px_-40px_rgba(212,175,55,0.55)] ring-1 ring-[#d4af37]/25">
            {/* A hairline sheen across the face, and the guilloché-style rules
                a printed card has. Both are decoration and both stay under the
                content. */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.55]"
              style={{
                background:
                  "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 46%, transparent 58%)",
              }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.16]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(115deg, rgba(212,175,55,0.5) 0 1px, transparent 1px 14px)",
                maskImage:
                  "radial-gradient(120% 90% at 15% 0%, black, transparent 65%)",
                WebkitMaskImage:
                  "radial-gradient(120% 90% at 15% 0%, black, transparent 65%)",
              }}
              aria-hidden="true"
            />

            <div className="relative flex h-full flex-col justify-between p-[6.5%]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Image
                    src="/brand/logo/emblem.png"
                    alt=""
                    width={451}
                    height={528}
                    sizes="64px"
                    className="h-11 w-auto sm:h-14"
                    aria-hidden="true"
                  />
                  <Image
                    src="/brand/logo/wordmark.png"
                    alt="KYLYVNYK CLUB"
                    width={503}
                    height={124}
                    sizes="160px"
                    className="h-5 w-auto sm:h-6"
                  />
                </div>
                <span className="rounded-full border border-[#d4af37]/45 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  VIP
                </span>
              </div>

              <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                    {t("hero.cardCaption")}
                  </p>
                  <p className="mt-2 truncate font-mono text-base tracking-[0.28em] text-[#e7d59a] sm:text-xl">
                    KCLUB 000 001
                  </p>
                </div>

                {/* The QR is drawn, not iconised: a real card's code is a grid
                    of squares, and a rounded glyph reads as a placeholder. */}
                <div
                  className="grid shrink-0 grid-cols-4 gap-[3px] rounded-md border border-[#d4af37]/35 bg-black/40 p-2"
                  aria-hidden="true"
                >
                  {[
                    1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0,
                    1, 1, 1, 1,
                  ].map((filled, index) => (
                    <span
                      key={index}
                      className={`size-[5px] rounded-[1px] sm:size-[6px] ${
                        filled ? "bg-[#d4af37]" : "bg-[#d4af37]/15"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
