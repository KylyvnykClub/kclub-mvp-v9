import { z } from "zod";
import { serverSchema, clientSchema } from "./env.schema";

export { serverSchema, clientSchema };
export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function validateEnv() {
  const serverResult = serverSchema.safeParse(process.env);
  const clientResult = clientSchema.safeParse(process.env);

  if (!serverResult.success || !clientResult.success) {
    const issues = [
      ...(serverResult.success ? [] : serverResult.error.issues),
      ...(clientResult.success ? [] : clientResult.error.issues),
    ];

    const missing = issues.map((i) => {
      const path = i.path.join(".");
      return `  ${path}: ${i.message}`;
    });

    throw new Error(
      [
        "",
        "Invalid environment variables:",
        ...missing,
        "",
        "Copy .env.example to .env.local and fill in the values.",
        "See docs/technology.md for service details.",
        "",
      ].join("\n"),
    );
  }

  return {
    server: serverResult.data,
    client: clientResult.data,
  };
}

export const env = validateEnv();
