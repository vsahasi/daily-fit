import { NextRequest } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { checkPhoneVerification, normalizePhone, twilioErrorMessage, verifyConfigured } from "@/lib/sms";
import { revalidateTag } from "next/cache";
import { userFromPhone } from "@/lib/user";

export async function POST(request: NextRequest) {
  if (!verifyConfigured()) {
    return Response.json({ error: "Twilio Verify is not configured" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { phone?: string; code?: string };
    const phone = normalizePhone(String(body.phone ?? "").trim());
    const code = String(body.code ?? "").trim();

    if (!phone || !code) {
      return Response.json({ error: "Phone and code are required" }, { status: 400 });
    }

    await checkPhoneVerification(phone, code);
    const user = await userFromPhone(phone);
    revalidateTag(`user-${user.id}`, "max");
    await createSessionCookie(user.id);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("verify-code failed", error);
    const message = twilioErrorMessage(error);
    const status = message.includes("did not work") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
