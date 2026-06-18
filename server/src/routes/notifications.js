import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth.js";
import {
	removeToken,
	saveToken,
	sendPush,
	sendPushToAllClients,
} from "../push.js";
import { query } from "../db/pool.js";

const router = Router();

// ─── Save / update push token (called by the app after login) ────────────────
router.post("/push-token", async (req, res, next) => {
	try {
		const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
		await saveToken(req.user.type, req.user.id, token);
		res.json({ message: "Token saved." });
	} catch (err) {
		next(err);
	}
});

// ─── Delete push token on logout ─────────────────────────────────────────────
router.delete("/push-token", async (req, res, next) => {
	try {
		await removeToken(req.user.type, req.user.id);
		res.json({ message: "Token removed." });
	} catch (err) {
		next(err);
	}
});

// ─── Send notification to one or more specific clients (staff/admin only) ────
router.post(
	"/notifications/send",
	requireRoles("admin", "menaxher", "shites", "teknik"),
	async (req, res, next) => {
		try {
			const schema = z.object({
				title: z.string().min(1),
				body: z.string().min(1),
				clientIds: z.array(z.coerce.number()).optional(),
				allClients: z.boolean().optional(),
				data: z.record(z.unknown()).optional(),
			});
			const payload = schema.parse(req.body);

			if (payload.allClients) {
				await sendPushToAllClients(
					payload.title,
					payload.body,
					payload.data ?? {},
				);
			} else {
				const ids = payload.clientIds ?? [];
				if (!ids.length)
					return res
						.status(422)
						.json({ message: "clientIds required when allClients is false." });
				await sendPush(
					ids.map((id) => ({ type: "client", id })),
					payload.title,
					payload.body,
					payload.data ?? {},
				);
			}
			res.json({ message: "Notification sent." });
		} catch (err) {
			next(err);
		}
	},
);

// ─── List clients that have a registered push token (for dashboard UI) ────────
router.get(
	"/notifications/recipients",
	requireRoles("admin", "menaxher", "shites", "teknik"),
	async (_req, res, next) => {
		try {
			const result = await query(
				`select c.id, c.name, c.last_name, c.email, c.phone_number
         from client c
         inner join push_tokens pt on pt.user_type = 'client' and pt.user_id = c.id
         where c.deleted_at is null
         order by c.name`,
			);
			res.json({ data: result.rows });
		} catch (err) {
			next(err);
		}
	},
);

export default router;
