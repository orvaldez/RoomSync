import type { RequestHandler } from "express";
import { isBehindTlsProxy } from "./session";

/**
 * Security headers on every API response (OWASP A02:2025, security
 * misconfiguration; threat model A4 and S4; docs/security/owasp-review.md).
 *
 * The API only ever answers JSON, so the policy can be as strict as possible:
 * nothing it returns should be rendered, framed, sniffed into another type,
 * or cached. Written out rather than added as a dependency (helmet), because
 * a JSON API needs six fixed headers and each is easier to review here.
 *
 * The client's own headers, such as its Content-Security-Policy, belong to
 * whatever serves the built client, which is Milestone 3's deployment.
 */
export function securityHeaders(nodeEnv = process.env.NODE_ENV): RequestHandler {
  const httpsOnly = isBehindTlsProxy(nodeEnv);

  return (_req, res, next) => {
    // Never treat a response as anything but its declared type.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // JSON has no business loading anything or being framed.
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // Responses carry one household's money and names: keep them out of
    // shared and browser caches.
    res.setHeader("Cache-Control", "no-store");

    // Only where the app is served over HTTPS, paired with the secure cookie
    // and `trust proxy` (see isBehindTlsProxy). Sent over plain HTTP in
    // development it would do nothing, and pinning localhost to HTTPS would
    // only get in the way.
    if (httpsOnly) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }

    next();
  };
}
