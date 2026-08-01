"use server";

import { redirect } from "next/navigation";

import {
  createDashboardSession,
  deleteDashboardSession,
  verifyDashboardPassword,
} from "@/shared/auth/server";
import { getSafeReturnPath } from "@/shared/auth";

function loginErrorUrl(error: "configuration" | "invalid", returnPath: string) {
  const params = new URLSearchParams({ error });

  if (returnPath !== "/") {
    params.set("next", returnPath);
  }

  return `/login?${params.toString()}`;
}

export async function login(formData: FormData): Promise<void> {
  const password = formData.get("password");
  const returnPath = getSafeReturnPath(formData.get("next"));
  let passwordIsValid = false;

  try {
    passwordIsValid =
      typeof password === "string" && verifyDashboardPassword(password);
  } catch (error) {
    console.error(
      "Dashboard authentication is not configured correctly.",
      error,
    );
    redirect(loginErrorUrl("configuration", returnPath));
  }

  if (!passwordIsValid) {
    redirect(loginErrorUrl("invalid", returnPath));
  }

  try {
    await createDashboardSession();
  } catch (error) {
    console.error("Unable to create the dashboard session.", error);
    redirect(loginErrorUrl("configuration", returnPath));
  }

  redirect(returnPath);
}

export async function logout(): Promise<void> {
  await deleteDashboardSession();
  redirect("/login");
}
