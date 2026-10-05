"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SignInForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};
      if (!res.ok) {
        throw new Error(data.error ?? "Could not send code");
      }
      setStep("code");
      setStatus("Code sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};
      if (!res.ok) {
        throw new Error(data.error ?? "Could not sign in");
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      {step === "phone" ? (
        <form onSubmit={(event) => void sendCode(event)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-[12px] text-mute">
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 206 555 0100"
              className="field"
              autoComplete="tel"
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !phone.trim()}>
            {busy ? "Sending…" : "Text me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void verifyCode(event)} className="flex flex-col gap-4">
          <p className="text-[14px] text-mute">Enter the 6-digit code sent to {phone}.</p>
          <label className="flex flex-col gap-2 text-[12px] text-mute">
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              className="field"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn" disabled={busy || code.trim().length < 6}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="btn btn-text self-start"
            onClick={() => {
              setStep("phone");
              setCode("");
              setStatus("");
            }}
          >
            Use a different number
          </button>
        </form>
      )}
      {status ? <p className="mt-4 text-[13px] text-mute">{status}</p> : null}
    </div>
  );
}
