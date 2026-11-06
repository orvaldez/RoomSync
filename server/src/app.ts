import express from "express";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import householdRoutes from "./routes/household.routes";
import invitationRoutes from "./routes/invitation.routes";
import expenseRoutes from "./routes/expense.routes";
import choreRoutes from "./routes/chore.routes";
import balanceRoutes from "./routes/balance.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import { buildSessionMiddleware, isBehindTlsProxy } from "./middleware/session";
import { TRUSTED_PROXIES } from "./middleware/trusted-proxies";
import { errorHandler } from "./middleware/error-handler";
import { securityHeaders } from "./middleware/security-headers";

const app = express();

// Don't advertise the framework and its version (threat model S4).
app.disable("x-powered-by");

// Trust the host's proxies, so `req.secure` reflects the browser's
// connection rather than the plain HTTP the proxy forwards (required for the
// `secure: true` session cookie to be set at all in production), and `req.ip`
// is the visitor rather than a proxy (the per-IP rate limits and the security
// log). Trusted by address, not by count, because the count differs between
// paths on Render; see middleware/trusted-proxies.ts.
//
// Deliberately not enabled outside production: trusting a proxy that isn't
// there lets any client spoof its address through X-Forwarded-For.
if (isBehindTlsProxy()) {
  app.set("trust proxy", TRUSTED_PROXIES);
}

// First, so every response carries them, errors and 404s included.
app.use(securityHeaders());

app.use(express.json());

// Before the routes: every handler below can read req.session.
app.use(buildSessionMiddleware());

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", householdRoutes);
app.use("/api", invitationRoutes);
app.use("/api", expenseRoutes);
app.use("/api", choreRoutes);
app.use("/api", balanceRoutes);
app.use("/api", dashboardRoutes);

// Registered last: Express only reaches an error handler after the routes.
app.use(errorHandler);

export default app;
