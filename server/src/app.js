import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { authRequired, changePassword, login, profile, register, updateProfile } from "./auth.js";
import resourceRoutes from "./routes/resources.js";
import { errorHandler } from "./http/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "..", config.uploadDir)));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/register", register);
app.post("/api/login", login);

app.use("/api", authRequired);
app.get("/api/user", profile);
app.get("/api/profile", profile);
app.put("/api/profile", updateProfile);
app.post("/api/profile/change-password", changePassword);
app.post("/api/logout", (_req, res) => res.json({ message: "Logged out" }));
app.use("/api", resourceRoutes);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Gree API listening on http://localhost:${config.port}`);
});
