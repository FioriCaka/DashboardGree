import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/gree_app",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  clientOrigin: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
};
