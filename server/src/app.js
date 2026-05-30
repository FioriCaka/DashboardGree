import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  authRequired,
  changePassword,
  login,
  profile,
  register,
  updateProfile,
} from "./auth.js";
import resourceRoutes from "./routes/resources.js";
import { errorHandler } from "./http/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet());
app.use(cors({ origin: isAllowedOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", config.uploadDir)),
);

app.get(["/health", "/status"], (_req, res) => res.json({ status: "ok" }));
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

const server = app.listen(config.port, () => {
  console.log(`Gree API listening on http://localhost:${config.port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. The Gree API is probably already running. ` +
        `Stop the existing server or set PORT to another value in server/.env.`,
    );
    process.exit(1);
  }
  throw error;
});

function isAllowedOrigin(origin, callback) {
  if (
    !origin ||
    config.clientOrigin.includes(origin) ||
    isLocalDevOrigin(origin)
  ) {
    return callback(null, true);
  }
  return callback(null, false);
}

function isLocalDevOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
    /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
      origin,
    )
  );
}
