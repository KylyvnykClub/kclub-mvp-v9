import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const verificationCheckResponseSchema = z.object({
  status: z.string(),
});

/**
 * Sends a 6-digit verification code to the given E.164 phone number.
 */
export async function sendVerificationCode(phone: string): Promise<boolean> {
  if (env.server.AUTH_DEV_PHONE_BYPASS_ENABLED) {
    logger.info(
      `[DEV BYPASS] Pretending to send Twilio verification code to ${phone}`,
    );
    return true;
  }

  try {
    const auth = Buffer.from(
      `${env.server.TWILIO_ACCOUNT_SID}:${env.server.TWILIO_AUTH_TOKEN}`,
    ).toString("base64");

    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${env.server.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          Channel: "sms",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Twilio Verify API Error (send): ${response.status} ${errorText}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Failed to send Twilio verification code", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Checks if the provided code is correct for the given E.164 phone number.
 */
export async function checkVerificationCode(
  phone: string,
  code: string,
): Promise<boolean> {
  if (env.server.AUTH_DEV_PHONE_BYPASS_ENABLED) {
    // In dev mode, '000000' is universally valid.
    const isValid = code === "000000";
    logger.info(
      `[DEV BYPASS] Checked code '${code}' for ${phone} - Valid: ${isValid}`,
    );
    return isValid;
  }

  try {
    const auth = Buffer.from(
      `${env.server.TWILIO_ACCOUNT_SID}:${env.server.TWILIO_AUTH_TOKEN}`,
    ).toString("base64");

    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${env.server.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          Code: code,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Twilio Verify API Error (check): ${response.status} ${errorText}`,
      );
      return false;
    }

    const data: unknown = await response.json();
    const parsed = verificationCheckResponseSchema.safeParse(data);
    return parsed.success && parsed.data.status === "approved";
  } catch (error) {
    logger.error("Failed to check Twilio verification code", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
