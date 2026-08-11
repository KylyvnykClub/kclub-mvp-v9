import { describe, expect, it } from "vitest";
import { GET } from "./.well-known/security.txt/route";

describe("/.well-known/security.txt", () => {
  it("publishes the security contact and canonical URL", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("Contact: mailto:security@kclub.com");
    expect(body).toContain("Preferred-Languages: en, ru, uk");
    expect(body).toContain("/.well-known/security.txt");
  });

  it("sets an Expires timestamp in the future", async () => {
    const body = await GET().text();
    const expires = body
      .split("\n")
      .find((line) => line.startsWith("Expires: "))
      ?.replace("Expires: ", "");

    expect(expires).toBeDefined();
    expect(new Date(expires!).getTime()).toBeGreaterThan(Date.now());
  });
});
