/**
 * Sends a burst of wrong-password logins and prints each response, as the
 * before-and-after evidence for the login rate limit (#71,
 * docs/security/rate-limiting.md).
 *
 *   node scripts/login-burst.mjs [attempts] [email | --spray]
 *
 * Defaults: 20 attempts against agustin@roomsync.test, a seed account, on
 * http://localhost:4000 (override with API_URL). `--spray` uses a different
 * email on every attempt instead, which shows the per-IP limit rather than
 * the per-account one. Needs Node 20+ for fetch.
 */
const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const attempts = Number(process.argv[2] ?? 20);
const target = process.argv[3] ?? "agustin@roomsync.test";
const spray = target === "--spray";
const emailFor = (attempt) =>
  spray ? `guess-${attempt}@roomsync.test` : target;

console.log(`POST ${apiUrl}/api/auth/login x ${attempts}, ${spray ? "a different email each time" : `email ${target}`}, wrong password\n`);
console.log("attempt  status  code                 retry-after");

const counts = {};

for (let attempt = 1; attempt <= attempts; attempt++) {
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailFor(attempt), password: `wrong-password-${attempt}` }),
  });
  const body = await res.json().catch(() => ({}));
  const code = body.error?.code ?? "-";
  const retryAfter = res.headers.get("retry-after") ?? "-";

  counts[res.status] = (counts[res.status] ?? 0) + 1;
  console.log(
    `${String(attempt).padStart(7)}  ${String(res.status).padEnd(6)}  ${code.padEnd(19)}  ${retryAfter}`
  );
}

const summary = Object.entries(counts)
  .map(([status, n]) => `${n} x ${status}`)
  .join(", ");
console.log(`\n${summary}`);
