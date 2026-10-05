import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "df_session";
const maxAgeSeconds = 60 * 60 * 24 * 90;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("Add SESSION_SECRET or CRON_SECRET to .env");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export async function createSessionCookie(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${userId}.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(cookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function readSessionUserId() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (!value) return null;

  const [userId, expRaw, signature] = value.split(".");
  if (!userId || !expRaw || !signature) return null;

  const payload = `${userId}.${expRaw}`;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return userId;
}

export function makeLoginCode() {
  return String(randomInt(100000, 999999));
}
