/**
 * IPv4 CIDR / exact-IP allowlist matching for the maintenance-mode bypass
 * (Phase 01a §2). IPv6 entries are matched as an exact string only — no
 * prefix-length support — which is a documented limitation, not a bug.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const trimmed = cidr.trim();
  const slash = trimmed.indexOf("/");
  if (slash === -1) return ip === trimmed;

  const range = trimmed.slice(0, slash);
  const bits = Number(trimmed.slice(slash + 1));
  if (ip.includes(":") || range.includes(":")) return false; // no IPv6 CIDR support

  const ipNum = ipv4ToInt(ip);
  const rangeNum = ipv4ToInt(range);
  if (ipNum === null || rangeNum === null) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

export function isIpAllowlisted(
  ip: string | null | undefined,
  allowlist: string[] | null | undefined,
): boolean {
  if (!ip || !allowlist?.length) return false;
  return allowlist.some((entry) => ipInCidr(ip, entry));
}
