import express from "express";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";

const app = express();

app.use(express.json());
app.use("/api", healthRoutes);
app.use("/api", authRoutes);

export default app;
