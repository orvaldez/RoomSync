import express from "express";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import { buildSessionMiddleware } from "./middleware/session";
import { errorHandler } from "./middleware/error-handler";

const app = express();

app.use(express.json());

// Before the routes: every handler below can read req.session.
app.use(buildSessionMiddleware());

app.use("/api", healthRoutes);
app.use("/api", authRoutes);

// Registered last: Express only reaches an error handler after the routes.
app.use(errorHandler);

export default app;
