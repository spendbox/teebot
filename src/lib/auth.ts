import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "teebot_session";

export function sessionToken(): string {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) throw new Error("DASHBOARD_PASSWORD is not set");
  return createHmac("sha256", password).update("teebot-session-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isValidSession(token: string | undefined): boolean {
  if (!token || !process.env.DASHBOARD_PASSWORD) return false;
  return safeEqual(token, sessionToken());
}

export async function requireAuth(): Promise<void> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) throw new Error("Not logged in");
}
