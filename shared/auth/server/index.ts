import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME, SESSION_DURATION_SECONDS } from "../config";
import { createSessionToken, verifySessionToken } from "../session-token";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }

  return secret;
}

function getDashboardPassword(): string {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password || password.length < 16) {
    throw new Error("DASHBOARD_PASSWORD must contain at least 16 characters.");
  }

  return password;
}

export function verifyDashboardPassword(candidate: string): boolean {
  if (!candidate || candidate.length > 512) return false;

  const candidateDigest = createHash("sha256")
    .update(candidate, "utf8")
    .digest();
  const expectedDigest = createHash("sha256")
    .update(getDashboardPassword(), "utf8")
    .digest();

  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function createDashboardSession(): Promise<void> {
  const token = await createSessionToken(getAuthSecret());
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function hasDashboardSession(): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  return verifySessionToken(token, secret);
}

export async function requireDashboardSession(): Promise<void> {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }
}

export async function deleteDashboardSession(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE_NAME);
}
