import express from "express";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import householdRoutes from "./routes/household.routes";
import invitationRoutes from "./routes/invitation.routes";
import expenseRoutes from "./routes/expense.routes";
import balanceRoutes from "./routes/balance.routes";
import { buildSessionMiddleware, isBehindTlsProxy } from "./middleware/session";
import { errorHandler } from "./middleware/error-handler";

const app = express();

// Trust the first proxy hop, so `req.secure` reflects the browser's
// connection rather than the plain HTTP the proxy forwards. Required for the
// `secure: true` session cookie to be set at all in production.
//
// Deliberately not enabled outside production: trusting a proxy that isn't
// there lets any client spoof its address through X-Forwarded-For.
if (isBehindTlsProxy()) {
  app.set("trust proxy", 1);
}

app.use(express.json());

// Before the routes: every handler below can read req.session.
app.use(buildSessionMiddleware());

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", householdRoutes);
app.use("/api", invitationRoutes);
app.use("/api", expenseRoutes);
app.use("/api", balanceRoutes);

// Registered last: Express only reaches an error handler after the routes.
app.use(errorHandler);

export default app;
