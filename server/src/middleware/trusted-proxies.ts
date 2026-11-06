/**
 * Which proxies Express trusts when it reads the visitor's address from
 * `X-Forwarded-For`, in production (#117). `app.ts` passes this list to
 * `app.set("trust proxy", ...)`; Express then walks the header from the right
 * and takes the first address that isn't one of these as `req.ip`.
 *
 * Why addresses rather than a count: on Render the visitor is a different
 * number of hops away depending on the path, measured with a forged header
 * on November 4, 2026 (`docs/process/deployment.md` §5):
 *
 *   straight to the API:  visitor, Cloudflare, Render (10.x)          → 3
 *   through the site:     visitor, Cloudflare, Cloudflare, Render ×2  → 5
 *
 * The site's `/api` rewrite runs on Cloudflare, so its requests cross
 * Cloudflare and Render twice. No single count is right for both: 3 left the
 * site path logging a Cloudflare address, and 5 let a direct caller choose
 * their own address with a forged header, which walks around the per-IP rate
 * limits (#71) and the security log (#99).
 *
 * Trusting the proxies themselves gets the visitor on both paths. A forged
 * entry sits to the left of the visitor's real address, which the first
 * Cloudflare hop appends, so the walk stops before reaching it.
 *
 * Known gap: a request sent from inside Cloudflare's own network (a
 * Cloudflare Worker, for example) has a Cloudflare source address, which is
 * trusted, so its own forged header would be believed. Accepted for this
 * project (`docs/security/rate-limiting.md`).
 */

/**
 * Cloudflare's published ranges, from https://www.cloudflare.com/ips-v4 and
 * https://www.cloudflare.com/ips-v6, copied on November 6, 2026. They change
 * rarely; the maintenance plan (§2) re-checks them at each milestone.
 */
export const CLOUDFLARE_RANGES: readonly string[] = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/**
 * Everything Express trusts in production: this machine, private networks
 * (Render's own proxies are `10.x`), and Cloudflare. `loopback`, `linklocal`
 * and `uniquelocal` are Express's names for 127.0.0.0/8 and ::1,
 * 169.254.0.0/16 and fe80::/10, and 10.0.0.0/8, 172.16.0.0/12,
 * 192.168.0.0/16 and fc00::/7.
 */
export const TRUSTED_PROXIES: readonly string[] = [
  "loopback",
  "linklocal",
  "uniquelocal",
  ...CLOUDFLARE_RANGES,
];
