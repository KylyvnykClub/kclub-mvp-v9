import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest.js";

describe("constraint: PWA installability (FR-096)", () => {
  it("publishes an installable web app manifest", () => {
    const webManifest = manifest();

    expect(webManifest.name).toBe("KYLYVNYK CLUB");
    expect(webManifest.short_name).toBe("KYLYVNYK CLUB");
    expect(webManifest.display).toBe("standalone");
    expect(webManifest.start_url).toBe("/en/dashboard/profile");
    expect(webManifest.icons?.length).toBeGreaterThanOrEqual(2);
    expect(
      webManifest.icons?.some((icon) => icon.purpose?.includes("maskable")),
    ).toBe(true);
  });

  it("declares every manifest icon at its real size", () => {
    for (const icon of manifest().icons ?? []) {
      const png = readFileSync(`public${icon.src}`);
      // PNG IHDR: width and height are the big-endian words at 16 and 20.
      const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      expect(size, icon.src).toBe(icon.sizes);
    }
  });

  it("serves a favicon and touch icon from the app root", () => {
    // Next.js links these from every page; browsers also ask for
    // /favicon.ico on their own. Without them the tab showed no icon.
    for (const file of ["favicon.ico", "icon.png", "apple-icon.png"]) {
      expect(existsSync(`src/app/${file}`), file).toBe(true);
    }
  });

  it("registers a service worker from the locale layout", () => {
    const registerSource = readFileSync(
      "src/components/pwa-register.tsx",
      "utf8",
    );
    const layoutSource = readFileSync("src/app/[locale]/layout.tsx", "utf8");

    expect(registerSource).toContain("navigator.serviceWorker.register");
    expect(registerSource).toContain('"/sw.js"');
    expect(layoutSource).toContain("<PwaRegister />");
    expect(layoutSource).toContain('manifest: "/manifest.webmanifest"');
  });

  it("caches opened membership cards for offline use", () => {
    const serviceWorker = readFileSync("public/sw.js", "utf8");
    const offlineShell = readFileSync("public/offline.html", "utf8");

    expect(serviceWorker).toContain("url.pathname");
    expect(serviceWorker).toContain("(en|ru|uk)");
    expect(serviceWorker).toContain("card");
    expect(serviceWorker).toContain("networkFirst(request)");
    expect(serviceWorker).toContain("cache.put(request, response.clone())");
    expect(offlineShell).toContain("Previously opened membership card pages");
  });
});
