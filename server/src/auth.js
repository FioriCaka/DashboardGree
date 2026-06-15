import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config.js";
import { HttpError } from "./http/errors.js";
import { query } from "./db/pool.js";

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
		const password = await bcrypt.hash(payload.password, 10);
		const roleResult = await query("select id from roles where name = $1", [
			payload.role,
		]);
		const roleId = roleResult.rows[0]?.id;
		const table = payload.role === "client" ? "client" : "users";
		const result = await query(
			table === "client"
				? `insert into client (name, last_name, email, phone_number, address, nipt, password, role_id, must_change_password)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           returning *, 'client' as type`
				: `insert into users (name, last_name, email, phone_number, address, password, role_id)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning *, 'user' as type`,
			table === "client"
				? [
						payload.name,
						payload.last_name ?? "",
						payload.email,
						payload.phone_number,
						payload.address,
						payload.nipt,
						password,
						roleId,
						false,
					]
				: [
						payload.name,
						payload.last_name,
						payload.email,
						payload.phone_number,
						payload.address,
						password,
						roleId,
					],
		);
		const user = { ...result.rows[0], role: payload.role };
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
			throw new HttpError(401, "Invalid credentials");
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
		];
		const clientFields = [
			"name",
			"last_name",
			"email",
			"phone_number",
			"address",
			"nipt",
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

export async function changePassword(req, res, next) {
	try {
		const schema = z.object({
			current_password: z.string(),
			password: z.string().min(8),
		});
		const payload = schema.parse(req.body);
		if (
			!(await bcrypt.compare(payload.current_password, req.user.password ?? ""))
		) {
			throw new HttpError(422, "Current password is incorrect");
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
		res.json({ message: "Password updated successfully." });
	} catch (error) {
		next(error);
	}
}

export function sanitizeUser(user) {
	const { password, remember_token, ...safe } = user;
	return safe;
}
