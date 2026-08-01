export const AUTH_COOKIE_NAME = "poly-bot-dashboard-session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export function getSafeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }

  try {
    const url = new URL(value, "https://dashboard.local");

    if (url.origin !== "https://dashboard.local" || url.pathname === "/login") {
      return "/";
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}
