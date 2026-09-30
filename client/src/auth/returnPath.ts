/**
 * Where to go after logging in or registering: the page `RequireAuth` turned
 * the visitor away from, such as an invitation link (UC-04 step 7), or the
 * dashboard when there was none.
 *
 * Only a path inside this app is accepted. "//evil.example" and full URLs are
 * ignored, so the redirect can never carry someone off-site after they have
 * just typed their password.
 */
export function returnPath(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;

  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }

  return "/";
}
