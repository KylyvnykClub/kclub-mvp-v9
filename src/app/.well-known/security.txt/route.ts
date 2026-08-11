/**
 * GET /.well-known/security.txt
 *
 * Security contact discovery for researchers and automated scanners.
 * See docs/security.md §9.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DISCLOSURE_WINDOW_DAYS = 90;

export function GET(): Response {
  const origin = (
    process.env["NEXT_PUBLIC_APP_URL"] ?? "https://kclub.com"
  ).replace(/\/$/, "");
  const expires = new Date(
    Date.now() + DISCLOSURE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return new Response(
    [
      "Contact: mailto:security@kclub.com",
      `Expires: ${expires}`,
      "Preferred-Languages: en, ru, uk",
      `Canonical: ${origin}/.well-known/security.txt`,
      "",
    ].join("\n"),
    {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    },
  );
}
