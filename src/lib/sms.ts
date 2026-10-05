import twilio from "twilio";

/** Twilio is used for sign-in codes only. The look itself arrives as a push notification. */
export function verifyConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );
}

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio is not configured");
  }
  return twilio(sid, token);
}

export async function startPhoneVerification(to: string) {
  if (!verifyConfigured()) {
    throw new Error("Twilio Verify is not configured");
  }

  const client = twilioClient();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  await client.verify.v2.services(serviceSid).verifications.create({
    to,
    channel: "sms",
  });
}

export async function checkPhoneVerification(to: string, code: string) {
  if (!verifyConfigured()) {
    throw new Error("Twilio Verify is not configured");
  }

  const client = twilioClient();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const check = await client.verify.v2.services(serviceSid).verificationChecks.create({
    to,
    code,
  });

  if (check.status !== "approved") {
    throw new Error("That code did not work");
  }
}

export function twilioErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const twilioError = error as { message?: string; code?: number };
    if (twilioError.code === 60200) {
      return "Enter a valid phone number.";
    }
    if (twilioError.code === 60203) {
      return "Too many attempts. Wait a minute and try again.";
    }
    if (twilioError.code === 21608) {
      return "On a Twilio trial, add this number as a verified caller ID in Twilio first.";
    }
    if (twilioError.code === 21610) {
      return "This number has opted out of texts from Daily Fit.";
    }
    if (twilioError.code === 21211) {
      return "That phone number is not valid.";
    }
    if (twilioError.code === 572006) {
      return "Twilio trial accounts need Verify for login codes.";
    }
    if (twilioError.message) {
      return twilioError.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Could not send that code";
}

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}
