import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { HttpError } from "./http/errors.js";
import { query } from "./db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", config.uploadDir);

// Auto-ensure avatar columns and password_resets table
query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);
  ALTER TABLE client ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);
  ALTER TABLE sales ADD COLUMN IF NOT EXISTS warranty_doc_url VARCHAR(500);
  ALTER TABLE warranties ADD COLUMN IF NOT EXISTS warranty_doc_url VARCHAR(500);
  CREATE TABLE IF NOT EXISTS password_resets (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    user_type VARCHAR(20) NOT NULL,
    user_id BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`).catch((err) => {
  console.warn("DB migration check error in auth.js:", err.message);
});

const avatarStorage = multer.diskStorage({
	destination: async (_req, _file, cb) => {
		const dir = path.join(uploadsRoot, "avatars");
		await fs.mkdir(dir, { recursive: true });
		cb(null, dir);
	},
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
	},
});

export const uploadAvatarMiddleware = multer({
	storage: avatarStorage,
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
		else cb(new Error("Only JPEG, PNG, WebP or GIF images are allowed"));
	},
}).single("avatar");

const registerSchema = z.object({
	name: z.string().min(1),
	last_name: z.string().optional().nullable(),
	email: z.string().email(),
	phone_number: z.string().trim().min(1),
	address: z.string().optional().nullable(),
	nipt: z.string().optional().nullable(),
	password: z.string().min(8),
	role: z
		.enum(["client", "admin", "teknik", "shites", "menaxher"])
		.default("client"),
});

const loginSchema = z
	.object({
		phone_number: z.string().trim().min(1).optional(),
		email: z.string().email().optional(),
		password: z.string().min(1),
	})
	.refine((payload) => Boolean(payload.phone_number || payload.email), {
		message: "Phone number or email is required",
		path: ["phone_number"],
	});

export function signToken(user) {
	return jwt.sign(
		{ sub: String(user.id), type: user.type, role: user.role },
		config.jwtSecret,
		{ expiresIn: "7d" },
	);
}

export async function loadPrincipal(id, type = "user") {
	const table = type === "client" ? "client" : "users";
	const result = await query(
		`select ${table}.*, roles.name as role
     from ${table}
     left join roles on roles.id = ${table}.role_id
     where ${table}.id = $1 and ${table}.deleted_at is null`,
		[id],
	);
	const principal = result.rows[0];
	return principal ? { ...principal, type } : null;
}

export async function authRequired(req, _res, next) {
	try {
		const header = req.headers.authorization ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : null;
		if (!token) throw new HttpError(401, "Missing bearer token");
		const payload = jwt.verify(token, config.jwtSecret);
		const user = await loadPrincipal(payload.sub, payload.type);
		if (!user) throw new HttpError(401, "Invalid bearer token");
		req.user = user;
		next();
	} catch (error) {
		next(error.status ? error : new HttpError(401, "Invalid bearer token"));
	}
}

export function requireRoles(...roles) {
	return (req, _res, next) => {
		if (!req.user) return next(new HttpError(401, "Authentication required"));
		if (req.user.role === "admin" || roles.includes(req.user.role))
			return next();
		return next(
			new HttpError(403, "You are not authorized to access this resource."),
		);
	};
}

export async function register(req, res, next) {
	try {
		const payload = registerSchema.parse(req.body);
		// Public registration always defaults to client for security
		const assignedRole = "client";
		const password = await bcrypt.hash(payload.password, 10);
		const roleResult = await query("select id from roles where name = $1", [
			assignedRole,
		]);
		const roleId = roleResult.rows[0]?.id;
		const result = await query(
			`insert into client (name, last_name, email, phone_number, address, nipt, password, role_id, must_change_password)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *, 'client' as type`,
			[
				payload.name,
				payload.last_name ?? "",
				payload.email,
				payload.phone_number,
				payload.address,
				payload.nipt,
				password,
				roleId,
				false,
			],
		);
		const user = { ...result.rows[0], role: assignedRole };
		res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
	} catch (error) {
		next(error);
	}
}

export async function login(req, res, next) {
	try {
		const payload = loginSchema.parse(req.body);
		const lookup = payload.phone_number ?? payload.email;
		const result = await query(
			`select
         users.id,
         users.name,
         users.last_name,
         users.email,
         users.phone_number,
         users.address,
         users.city,
         users.experience,
         users.avatar,
         null::varchar as nipt,
         users.role_id,
         users.password,
         users.created_at,
         users.updated_at,
         false as must_change_password,
         roles.name as role,
         'user' as type
       from users left join roles on roles.id = users.role_id
		where (users.phone_number = $1 or users.email = $1) and users.deleted_at is null
       union all
       select
         client.id,
         client.name,
         client.last_name,
         client.email,
         client.phone_number,
         client.address,
         null::varchar as city,
         null::text as experience,
         client.avatar,
         client.nipt,
         client.role_id,
         client.password,
         client.created_at,
         client.updated_at,
         coalesce(client.must_change_password, false) as must_change_password,
         roles.name as role,
         'client' as type
       from client left join roles on roles.id = client.role_id
			 where (client.phone_number = $1 or client.email = $1) and client.deleted_at is null
       limit 1`,
			[lookup],
		);
		const user = result.rows[0];
		if (
			!user ||
			!(await bcrypt.compare(payload.password, user.password ?? ""))
		) {
			throw new HttpError(401, "Kredencialet janë të pasakta");
		}
		res.json({ token: signToken(user), user: sanitizeUser(user) });
	} catch (error) {
		next(error);
	}
}

export function profile(req, res) {
	res.json({ user: sanitizeUser(req.user) });
}

export async function updateProfile(req, res, next) {
	try {
		const userFields = [
			"name",
			"last_name",
			"email",
			"phone_number",
			"address",
			"city",
			"experience",
			"avatar",
		];
		const clientFields = [
			"name",
			"last_name",
			"email",
			"phone_number",
			"address",
			"nipt",
			"avatar",
		];
		const allowed = req.user.type === "client" ? clientFields : userFields;
		const entries = Object.entries(req.body).filter(([key]) =>
			allowed.includes(key),
		);
		if (!entries.length) return res.json({ user: sanitizeUser(req.user) });
		const sets = entries
			.map(([key], index) => `${key} = $${index + 1}`)
			.join(", ");
		const values = entries.map(([, value]) => value);
		const table = req.user.type === "client" ? "client" : "users";
		const result = await query(
			`update ${table} set ${sets}, updated_at = now() where id = $${values.length + 1} returning *`,
			[...values, req.user.id],
		);
		res.json({
			user: sanitizeUser({
				...result.rows[0],
				role: req.user.role,
				type: req.user.type,
			}),
		});
	} catch (error) {
		next(error);
	}
}

export async function uploadAvatar(req, res, next) {
	try {
		if (!req.file) throw new HttpError(400, "Nuk u ngarkua asnjë skedar fotoje.");
		const avatarPath = `/uploads/avatars/${req.file.filename}`;
		const table = req.user.type === "client" ? "client" : "users";

		const result = await query(
			`update ${table} set avatar = $1, updated_at = now() where id = $2 returning *`,
			[avatarPath, req.user.id],
		);

		res.json({
			message: "Fotoja e profilit u përditësua.",
			avatar: avatarPath,
			user: sanitizeUser({
				...result.rows[0],
				role: req.user.role,
				type: req.user.type,
			}),
		});
	} catch (error) {
		next(error);
	}
}

export async function changePassword(req, res, next) {
	try {
		const schema = z.object({
			current_password: z.string(),
			password: z.string().min(8, "Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere."),
		});
		const payload = schema.parse(req.body);
		if (
			!(await bcrypt.compare(payload.current_password, req.user.password ?? ""))
		) {
			throw new HttpError(422, "Fjalëkalimi aktual është i pasaktë.");
		}
		const password = await bcrypt.hash(payload.password, 10);
		const table = req.user.type === "client" ? "client" : "users";
		if (req.user.type === "client") {
			await query(
				"update client set password = $1, must_change_password = false, updated_at = now() where id = $2",
				[password, req.user.id],
			);
		} else {
			await query(
				`update ${table} set password = $1, updated_at = now() where id = $2`,
				[password, req.user.id],
			);
		}
		res.json({ message: "Fjalëkalimi u ndryshua me sukses." });
	} catch (error) {
		next(error);
	}
}

export async function forgotPassword(req, res, next) {
	try {
		const schema = z.object({
			identifier: z.string().trim().min(1, "Ju lutem shkruani numrin e telefonit ose email-in."),
		});
		const { identifier } = schema.parse(req.body);

		const result = await query(
			`select id, 'user' as type, phone_number, email from users where (phone_number = $1 or email = $1) and deleted_at is null
			 union all
			 select id, 'client' as type, phone_number, email from client where (phone_number = $1 or email = $1) and deleted_at is null
			 limit 1`,
			[identifier],
		);
		const user = result.rows[0];
		if (!user) {
			throw new HttpError(404, "Nuk u gjet asnjë llogari me këtë numër telefoni ose email.");
		}

		// Generate 6-digit code
		const code = Math.floor(100000 + Math.random() * 900000).toString();

		await query(
			`insert into password_resets (identifier, code, user_type, user_id, expires_at)
			 values ($1, $2, $3, $4, now() + interval '15 minutes')`,
			[identifier, code, user.type, user.id],
		);

		console.log(`[AUTH] Password reset code for ${identifier}: ${code}`);

		res.json({
			message: "Kodi i verifikimit u dërgua me sukses.",
			code, // Returned for dev/testing convenience
			expires_in: "15 minuta",
		});
	} catch (error) {
		next(error);
	}
}

export async function resetPassword(req, res, next) {
	try {
		const schema = z.object({
			identifier: z.string().trim().min(1),
			code: z.string().trim().min(4, "Kodi i verifikimit është i detyrueshëm."),
			password: z.string().min(8, "Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere."),
		});
		const { identifier, code, password } = schema.parse(req.body);

		const resetResult = await query(
			`select * from password_resets
			 where identifier = $1 and code = $2 and used_at is null and expires_at > now()
			 order by created_at desc limit 1`,
			[identifier, code],
		);
		const resetRecord = resetResult.rows[0];
		if (!resetRecord) {
			throw new HttpError(422, "Kodi i verifikimit është i pasaktë ose ka skaduar.");
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const table = resetRecord.user_type === "client" ? "client" : "users";

		await query(
			`update ${table} set password = $1, updated_at = now() where id = $2 and deleted_at is null`,
			[hashedPassword, resetRecord.user_id],
		);

		await query(
			"update password_resets set used_at = now() where id = $1",
			[resetRecord.id],
		);

		res.json({ message: "Fjalëkalimi u ndryshua me sukses. Tani mund të hyni me fjalëkalimin e ri." });
	} catch (error) {
		next(error);
	}
}

export async function deleteAccount(req, res, next) {
	try {
		const table = req.user.type === "client" ? "client" : "users";
		await query(
			`update ${table} set deleted_at = now(), updated_at = now() where id = $1`,
			[req.user.id],
		);
		res.json({ message: "Llogaria juaj u fshi me sukses." });
	} catch (error) {
		next(error);
	}
}

export function sanitizeUser(user) {
	const { password, remember_token, ...safe } = user;
	return safe;
}
