import { Expo } from "expo-server-sdk";
import { query } from "./db/pool.js";

const expo = new Expo();

async function ensureScheduledNotificationsTable() {
	await query(`
    create table if not exists scheduled_notifications (
      id bigserial primary key,
      target_type varchar(10) not null check (target_type in ('client', 'user')),
      target_id bigint not null,
      title varchar(255) not null,
      body text not null,
      data jsonb,
      send_at timestamptz not null,
      sent_at timestamptz,
      status varchar(20) not null default 'pending',
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

	await query(
		"create index if not exists idx_scheduled_notifications_send_at on scheduled_notifications(status, send_at)",
	);
	await query(
		"create index if not exists idx_scheduled_notifications_target on scheduled_notifications(target_type, target_id)",
	);
}

/**
 * Upsert a push token for a user (client or staff).
 */
export async function saveToken(userType, userId, token) {
	await query(
		`insert into push_tokens (user_type, user_id, token, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_type, user_id)
     do update set token = excluded.token, updated_at = now()`,
		[userType, userId, token],
	);
}

/**
 * Remove the push token for a user (e.g., on logout).
 */
export async function removeToken(userType, userId) {
	await query("delete from push_tokens where user_type = $1 and user_id = $2", [
		userType,
		userId,
	]);
}

/**
 * Send a push notification to one or more specific users.
 * @param {Array<{type: string, id: number}>} recipients  – array of {type, id}
 * @param {string} title
 * @param {string} body
 * @param {object} data  – extra payload for the app
 */
export async function sendPush(recipients, title, body, data = {}) {
	if (!recipients.length) return;

	// Load tokens for all recipients in one query
	const placeholders = recipients
		.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
		.join(", ");
	const params = recipients.flatMap((r) => [r.type, r.id]);
	const result = await query(
		`select token from push_tokens where (user_type, user_id) in (${placeholders})`,
		params,
	);

	const messages = [];
	for (const row of result.rows) {
		if (!Expo.isExpoPushToken(row.token)) continue;
		messages.push({ to: row.token, sound: "default", title, body, data });
	}
	if (!messages.length) return;

	const chunks = expo.chunkPushNotifications(messages);
	for (const chunk of chunks) {
		try {
			await expo.sendPushNotificationsAsync(chunk);
		} catch (err) {
			console.error("Push send error:", err);
		}
	}
}

/**
 * Send a push notification to ALL clients.
 */
export async function sendPushToAllClients(title, body, data = {}) {
	const result = await query(
		"select token from push_tokens where user_type = 'client'",
	);
	const messages = result.rows
		.filter((r) => Expo.isExpoPushToken(r.token))
		.map((r) => ({ to: r.token, sound: "default", title, body, data }));
	if (!messages.length) return;

	const chunks = expo.chunkPushNotifications(messages);
	for (const chunk of chunks) {
		try {
			await expo.sendPushNotificationsAsync(chunk);
		} catch (err) {
			console.error("Push send error:", err);
		}
	}
}

export async function schedulePushNotification({
	targetType,
	targetId,
	title,
	body,
	data = {},
	sendAt,
}) {
	await query(
		`insert into scheduled_notifications
      (target_type, target_id, title, body, data, send_at, status, updated_at)
     values ($1, $2, $3, $4, $5, $6, 'pending', now())`,
		[targetType, targetId, title, body, JSON.stringify(data), sendAt],
	);
}

export async function dispatchDueScheduledNotifications() {
	const result = await query(
		`select id, target_type, target_id, title, body, data
     from scheduled_notifications
     where status = 'pending' and send_at <= now()
     order by send_at asc
     limit 25`,
	);

	for (const row of result.rows) {
		try {
			await sendPush(
				[{ type: row.target_type, id: row.target_id }],
				row.title,
				row.body,
				row.data ?? {},
			);
			await query(
				`update scheduled_notifications
         set status = 'sent', sent_at = now(), updated_at = now(), error_message = null
         where id = $1`,
				[row.id],
			);
		} catch (error) {
			await query(
				`update scheduled_notifications
         set status = 'failed', updated_at = now(), error_message = $2
         where id = $1`,
				[row.id, error?.message ?? "Failed to dispatch notification"],
			);
			console.error("Scheduled notification dispatch failed:", error);
		}
	}
}

export function startScheduledNotificationDispatcher() {
	const run = () => {
		dispatchDueScheduledNotifications().catch((error) => {
			console.error("Notification dispatcher error:", error);
		});
	};

	ensureScheduledNotificationsTable()
		.then(run)
		.catch((error) => {
			console.error("Notification dispatcher init error:", error);
		});
	return setInterval(run, 60 * 1000);
}
