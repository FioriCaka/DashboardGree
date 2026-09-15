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
	deleteAccount,
	forgotPassword,
	login,
	profile,
	register,
	resetPassword,
	updateProfile,
	uploadAvatar,
	uploadAvatarMiddleware,
} from "./auth.js";
import resourceRoutes from "./routes/resources.js";
import shopRoutes from "./routes/shop.js";
import notificationRoutes from "./routes/notifications.js";
import webRoutes from "./routes/web.js";
import plannerRoutes from "./routes/planner.js";
import { startScheduledNotificationDispatcher } from "./push.js";
import { errorHandler } from "./http/errors.js";

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", config.uploadDir);
const thumbsCacheDir = path.join(uploadsDir, ".cache");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: isAllowedOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Dynamic WebP thumbnail generator with caching
app.get("/uploads/thumb/*", async (req, res, next) => {
	try {
		const relativePath = req.params[0] || "";
		const safeRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, "");
		const sourceFilePath = path.join(uploadsDir, safeRelative);

		if (!fs.existsSync(sourceFilePath)) {
			return res.status(404).send("Not found");
		}

		const ext = path.extname(safeRelative).toLowerCase();
		if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) {
			return res.sendFile(sourceFilePath);
		}

		const targetWidth = Math.min(Math.max(parseInt(req.query.w, 10) || 600, 50), 1920);
		const targetQuality = Math.min(Math.max(parseInt(req.query.q, 10) || 80, 20), 100);
		const cacheKey = `${safeRelative.replace(/[\/\\]/g, "_")}-w${targetWidth}-q${targetQuality}.webp`;
		const cacheFilePath = path.join(thumbsCacheDir, cacheKey);

		if (fs.existsSync(cacheFilePath)) {
			res.setHeader("Content-Type", "image/webp");
			res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
			return res.sendFile(cacheFilePath);
		}

		await fsPromises.mkdir(thumbsCacheDir, { recursive: true });
		await sharp(sourceFilePath)
			.rotate()
			.resize({ width: targetWidth, withoutEnlargement: true })
			.webp({ quality: targetQuality })
			.toFile(cacheFilePath);

		res.setHeader("Content-Type", "image/webp");
		res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		return res.sendFile(cacheFilePath);
	} catch (err) {
		console.error("Thumbnail generation error:", err);
		const fallbackPath = path.join(uploadsDir, path.normalize(req.params[0] || ""));
		if (fs.existsSync(fallbackPath)) {
			return res.sendFile(fallbackPath);
		}
		next(err);
	}
});

app.use(
	"/uploads",
	express.static(uploadsDir, {
		maxAge: "30d",
		immutable: true,
		setHeaders: (res) => {
			res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
		},
	}),
);

app.get(["/health", "/status"], (_req, res) => res.json({ status: "ok" }));
app.post("/api/register", register);
app.post("/api/login", login);
app.post("/api/forgot-password", forgotPassword);
app.post("/api/reset-password", resetPassword);
app.use("/api", webRoutes);

app.use("/api", authRequired);
app.get("/api/user", profile);
app.get("/api/profile", profile);
app.put("/api/profile", updateProfile);
app.post("/api/profile/avatar", uploadAvatarMiddleware, uploadAvatar);
app.post("/api/profile/change-password", changePassword);
app.delete("/api/profile", deleteAccount);
app.post("/api/logout", (_req, res) => res.json({ message: "Logged out" }));
app.use("/api", resourceRoutes);
app.use("/api", shopRoutes);
app.use("/api", notificationRoutes);
app.use("/api", plannerRoutes);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
	console.log(`Gree API listening on http://${config.host}:${config.port}`);
});

startScheduledNotificationDispatcher();

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
