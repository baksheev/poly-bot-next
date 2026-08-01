import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth";
import { getSafeReturnPath } from "@/shared/auth";
import { hasDashboardSession } from "@/shared/auth/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const metadata = {
  title: "Sign in · Poly Bot",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnPath = getSafeReturnPath(params.next);

  if (await hasDashboardSession()) {
    redirect(returnPath);
  }

  const error =
    params.error === "invalid" || params.error === "configuration"
      ? params.error
      : undefined;

  return <LoginForm error={error} returnPath={returnPath} />;
}
