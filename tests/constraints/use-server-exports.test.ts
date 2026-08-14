import { describe, it, expect } from "vitest";
import { Linter, type ESLint } from "eslint";
import { parser } from "typescript-eslint";

// @ts-expect-error - the rule module is plain ESM with no type declarations
import kclubPlugin from "../../tools/eslint/module-boundaries.mjs";

/**
 * Lint invariant: a "use server" file exports async functions and nothing else.
 *
 * Every named export of such a file becomes a callable server endpoint, so the
 * Next.js compiler rejects anything that is not an async function. It only does
 * so during `next build`, which `pnpm verify` does not run - which is exactly
 * how `export const COMPANY_MODERATION_TOPIC` reached main and broke the build
 * with every local gate green.
 *
 * These cases are the ones the compiler error would have caught.
 */

const plugin = kclubPlugin as ESLint.Plugin;
const linter = new Linter();

const config: Linter.Config = {
  plugins: { kclub: plugin },
  languageOptions: { parser },
  rules: { "kclub/no-non-async-export-in-use-server": "error" },
};

function lint(code: string): Linter.LintMessage[] {
  return linter.verify(code, config);
}

describe('constraint: only async exports in a "use server" file', () => {
  it("rejects the exported constant that broke the build", () => {
    const messages = lint(
      ['"use server";', 'export const COMPANY_MODERATION_TOPIC = "x";'].join(
        "\n",
      ),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("COMPANY_MODERATION_TOPIC");
  });

  it("rejects a non-async exported function", () => {
    expect(lint('"use server";\nexport function build() {}')).toHaveLength(1);
  });

  it("rejects a non-async binding exported through a specifier list", () => {
    expect(
      lint('"use server";\nconst topic = "x";\nexport { topic };'),
    ).toHaveLength(1);
  });

  it("rejects a non-async default export", () => {
    expect(
      lint('"use server";\nexport default function build() {}'),
    ).toHaveLength(1);
  });

  it("reports every offending export, not just the first", () => {
    expect(
      lint('"use server";\nexport const a = 1;\nexport const b = 2;'),
    ).toHaveLength(2);
  });

  it("allows async function declarations and async arrow constants", () => {
    expect(
      lint(
        [
          '"use server";',
          "export async function approve() {}",
          "export const reject = async () => {};",
        ].join("\n"),
      ),
    ).toHaveLength(0);
  });

  it("allows type-only exports, which are erased before the compiler sees them", () => {
    expect(
      lint(
        [
          '"use server";',
          "export type Payload = { companyId: string };",
          "export interface Other { id: string }",
        ].join("\n"),
      ),
    ).toHaveLength(0);
  });

  it("leaves files without the directive alone", () => {
    expect(lint('export const COMPANY_MODERATION_TOPIC = "x";')).toHaveLength(
      0,
    );
  });

  it("ignores a mention of the directive that is only a comment", () => {
    expect(
      lint('// lives outside the "use server" file\nexport const topic = "x";'),
    ).toHaveLength(0);
  });
});
