import express from "express";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import { errorHandler } from "./middleware/error-handler";

const app = express();

app.use(express.json());
app.use("/api", healthRoutes);
app.use("/api", authRoutes);

// Registered last: Express only reaches an error handler after the routes.
app.use(errorHandler);

export default app;
