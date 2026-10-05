import { NextRequest } from "next/server";
import { normalizePhone, startPhoneVerification, twilioErrorMessage, verifyConfigured } from "@/lib/sms";

export async function POST(request: NextRequest) {
  if (!verifyConfigured()) {
    return Response.json({ error: "Twilio Verify is not configured" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { phone?: string };
    const phone = normalizePhone(String(body.phone ?? "").trim());
    if (!phone || phone.length < 11) {
      return Response.json({ error: "Enter a valid phone number" }, { status: 400 });
    }

    await startPhoneVerification(phone);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("send-code failed", error);
    return Response.json({ error: twilioErrorMessage(error) }, { status: 500 });
  }
}
