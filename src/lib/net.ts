/** Best-effort client IP behind Caddy (D22): first hop of X-Forwarded-For. */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
