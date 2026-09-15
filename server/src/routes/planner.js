import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { sendPush } from "../push.js";

const router = Router();

// Helper to auto-create tables if they don't exist yet
async function createPlannerTablesIfNotExist() {
	await query(`
		CREATE TABLE IF NOT EXISTS planner_plans (
		  id BIGSERIAL PRIMARY KEY,
		  title VARCHAR(255) NOT NULL,
		  description TEXT,
		  color_code VARCHAR(30) DEFAULT '#0078D4',
		  is_favorite BOOLEAN DEFAULT FALSE,
		  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS planner_buckets (
		  id BIGSERIAL PRIMARY KEY,
		  plan_id BIGINT NOT NULL REFERENCES planner_plans(id) ON DELETE CASCADE,
		  name VARCHAR(190) NOT NULL,
		  order_index INTEGER NOT NULL DEFAULT 0,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS planner_tasks (
		  id BIGSERIAL PRIMARY KEY,
		  plan_id BIGINT NOT NULL REFERENCES planner_plans(id) ON DELETE CASCADE,
		  bucket_id BIGINT NOT NULL REFERENCES planner_buckets(id) ON DELETE CASCADE,
		  title VARCHAR(255) NOT NULL,
		  description TEXT,
		  progress_status VARCHAR(50) NOT NULL DEFAULT 'not_started',
		  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
		  start_date DATE,
		  due_date DATE,
		  completed_at TIMESTAMPTZ,
		  cover_image_url TEXT,
		  preview_type VARCHAR(50) DEFAULT 'checklist',
		  order_index INTEGER NOT NULL DEFAULT 0,
		  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS planner_task_assignees (
		  task_id BIGINT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
		  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		  PRIMARY KEY (task_id, user_id)
		);

		CREATE TABLE IF NOT EXISTS planner_checklists (
		  id BIGSERIAL PRIMARY KEY,
		  task_id BIGINT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
		  title VARCHAR(255) NOT NULL,
		  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
		  order_index INTEGER NOT NULL DEFAULT 0,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS planner_labels (
		  id BIGSERIAL PRIMARY KEY,
		  plan_id BIGINT NOT NULL REFERENCES planner_plans(id) ON DELETE CASCADE,
		  name VARCHAR(100) NOT NULL,
		  color_code VARCHAR(30) NOT NULL
		);

		CREATE TABLE IF NOT EXISTS planner_task_labels (
		  task_id BIGINT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
		  label_id BIGINT NOT NULL REFERENCES planner_labels(id) ON DELETE CASCADE,
		  PRIMARY KEY (task_id, label_id)
		);

		CREATE TABLE IF NOT EXISTS planner_comments (
		  id BIGSERIAL PRIMARY KEY,
		  task_id BIGINT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
		  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
		  comment TEXT NOT NULL,
		  is_system_log BOOLEAN DEFAULT FALSE,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS planner_attachments (
		  id BIGSERIAL PRIMARY KEY,
		  task_id BIGINT NOT NULL REFERENCES planner_tasks(id) ON DELETE CASCADE,
		  file_name VARCHAR(255) NOT NULL,
		  file_url TEXT NOT NULL,
		  file_type VARCHAR(100),
		  file_size BIGINT,
		  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);
}

// Helper to ensure at least 1 plan exists with default buckets
async function ensureDefaultPlan(userId) {
	await createPlannerTablesIfNotExist();
	const res = await query(`SELECT * FROM planner_plans ORDER BY id ASC LIMIT 1`);
	if (res.rows.length > 0) {
		return res.rows[0];
	}

	const newPlan = await query(
		`INSERT INTO planner_plans (title, description, color_code, is_favorite, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING *`,
		["General Work Plan", "Main company tasks and project board", "#0078D4", true, userId || null]
	);
	const plan = newPlan.rows[0];

	// Create default buckets
	const defaultBuckets = ["To Do", "In Progress", "Review", "Completed"];
	for (let i = 0; i < defaultBuckets.length; i++) {
		await query(
			`INSERT INTO planner_buckets (plan_id, name, order_index) VALUES ($1, $2, $3)`,
			[plan.id, defaultBuckets[i], i]
		);
	}

	// Create default color labels
	const defaultLabels = [
		{ name: "Urgent Repair", color: "#d13438" },
		{ name: "Maintenance", color: "#0078d4" },
		{ name: "Parts Needed", color: "#ff8c00" },
		{ name: "Inspection", color: "#107c41" },
		{ name: "HVAC Install", color: "#8764b8" },
	];
	for (const l of defaultLabels) {
		await query(
			`INSERT INTO planner_labels (plan_id, name, color_code) VALUES ($1, $2, $3)`,
			[plan.id, l.name, l.color]
		);
	}

	return plan;
}

// ── GET ALL PLANS ─────────────────────────────────────────────────────────────
router.get("/planner/plans", async (req, res, next) => {
	try {
		await ensureDefaultPlan(req.user?.id);
		const result = await query(
			`SELECT p.*, 
				(SELECT COUNT(*) FROM planner_tasks t WHERE t.plan_id = p.id) as task_count,
				(SELECT COUNT(*) FROM planner_tasks t WHERE t.plan_id = p.id AND t.progress_status = 'completed') as completed_count
			 FROM planner_plans p
			 ORDER BY p.is_favorite DESC, p.created_at DESC`
		);
		res.json(result.rows);
	} catch (err) {
		next(err);
	}
});

// ── CREATE PLAN ──────────────────────────────────────────────────────────────
router.post("/planner/plans", async (req, res, next) => {
	try {
		await createPlannerTablesIfNotExist();
		const schema = z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			color_code: z.string().optional().default("#0078D4"),
		});
		const { title, description, color_code } = schema.parse(req.body);

		const result = await query(
			`INSERT INTO planner_plans (title, description, color_code, created_by)
			 VALUES ($1, $2, $3, $4) RETURNING *`,
			[title, description || null, color_code, req.user?.id || null]
		);
		const plan = result.rows[0];

		// Create standard default buckets
		const defaultBuckets = ["To Do", "In Progress", "Completed"];
		for (let i = 0; i < defaultBuckets.length; i++) {
			await query(
				`INSERT INTO planner_buckets (plan_id, name, order_index) VALUES ($1, $2, $3)`,
				[plan.id, defaultBuckets[i], i]
			);
		}

		res.status(201).json(plan);
	} catch (err) {
		next(err);
	}
});

// ── UPDATE PLAN ──────────────────────────────────────────────────────────────
router.put("/planner/plans/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const schema = z.object({
			title: z.string().optional(),
			description: z.string().optional(),
			color_code: z.string().optional(),
			is_favorite: z.boolean().optional(),
		});
		const data = schema.parse(req.body);

		const result = await query(
			`UPDATE planner_plans 
			 SET title = COALESCE($1, title),
				 description = COALESCE($2, description),
				 color_code = COALESCE($3, color_code),
				 is_favorite = COALESCE($4, is_favorite),
				 updated_at = NOW()
			 WHERE id = $5 RETURNING *`,
			[data.title, data.description, data.color_code, data.is_favorite, id]
		);
		res.json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

// ── DELETE PLAN ──────────────────────────────────────────────────────────────
router.delete("/planner/plans/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		await query(`DELETE FROM planner_plans WHERE id = $1`, [id]);
		res.json({ message: "Plan deleted." });
	} catch (err) {
		next(err);
	}
});

// ── GET FULL PLAN DETAILS (Buckets, Tasks, Assignees, Checklists, Labels) ────
router.get("/planner/plans/:id/full", async (req, res, next) => {
	try {
		const { id } = req.params;

		const planRes = await query(`SELECT * FROM planner_plans WHERE id = $1`, [id]);
		if (planRes.rows.length === 0) {
			return res.status(404).json({ message: "Plan not found" });
		}
		const plan = planRes.rows[0];

		// Buckets
		const bucketsRes = await query(
			`SELECT * FROM planner_buckets WHERE plan_id = $1 ORDER BY order_index ASC, id ASC`,
			[id]
		);

		// Labels
		const labelsRes = await query(
			`SELECT * FROM planner_labels WHERE plan_id = $1 ORDER BY id ASC`,
			[id]
		);

		// Tasks with assignees, checklists, label IDs, comments count, attachments count
		const tasksRes = await query(
			`SELECT t.*,
				(
					SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'last_name', u.last_name, 'email', u.email)), '[]')
					FROM planner_task_assignees ta
					JOIN users u ON u.id = ta.user_id
					WHERE ta.task_id = t.id
				) as assignees,
				(
					SELECT COALESCE(json_agg(json_build_object('id', c.id, 'title', c.title, 'is_completed', c.is_completed, 'order_index', c.order_index) ORDER BY c.order_index ASC, c.id ASC), '[]')
					FROM planner_checklists c
					WHERE c.task_id = t.id
				) as checklist,
				(
					SELECT COALESCE(json_agg(tl.label_id), '[]')
					FROM planner_task_labels tl
					WHERE tl.task_id = t.id
				) as label_ids,
				(
					SELECT COUNT(*)::int FROM planner_comments cm WHERE cm.task_id = t.id
				) as comment_count,
				(
					SELECT COUNT(*)::int FROM planner_attachments att WHERE att.task_id = t.id
				) as attachment_count
			 FROM planner_tasks t
			 WHERE t.plan_id = $1
			 ORDER BY t.order_index ASC, t.id ASC`,
			[id]
		);

		res.json({
			plan,
			buckets: bucketsRes.rows,
			labels: labelsRes.rows,
			tasks: tasksRes.rows,
		});
	} catch (err) {
		next(err);
	}
});

// ── CREATE BUCKET ─────────────────────────────────────────────────────────────
router.post("/planner/buckets", async (req, res, next) => {
	try {
		const schema = z.object({
			plan_id: z.coerce.number(),
			name: z.string().min(1),
		});
		const { plan_id, name } = schema.parse(req.body);

		const maxOrderRes = await query(
			`SELECT COALESCE(MAX(order_index), -1) as max_idx FROM planner_buckets WHERE plan_id = $1`,
			[plan_id]
		);
		const newOrder = maxOrderRes.rows[0].max_idx + 1;

		const result = await query(
			`INSERT INTO planner_buckets (plan_id, name, order_index) VALUES ($1, $2, $3) RETURNING *`,
			[plan_id, name, newOrder]
		);
		res.status(201).json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

// ── UPDATE / REORDER BUCKET ───────────────────────────────────────────────────
router.put("/planner/buckets/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const schema = z.object({
			name: z.string().optional(),
			order_index: z.number().optional(),
		});
		const data = schema.parse(req.body);

		const result = await query(
			`UPDATE planner_buckets 
			 SET name = COALESCE($1, name),
				 order_index = COALESCE($2, order_index)
			 WHERE id = $3 RETURNING *`,
			[data.name, data.order_index, id]
		);
		res.json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

// ── DELETE BUCKET ─────────────────────────────────────────────────────────────
router.delete("/planner/buckets/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		await query(`DELETE FROM planner_buckets WHERE id = $1`, [id]);
		res.json({ message: "Bucket deleted." });
	} catch (err) {
		next(err);
	}
});

// ── CREATE TASK ───────────────────────────────────────────────────────────────
router.post("/planner/tasks", async (req, res, next) => {
	try {
		const schema = z.object({
			plan_id: z.coerce.number(),
			bucket_id: z.coerce.number(),
			title: z.string().min(1),
			description: z.string().optional(),
			priority: z.enum(["low", "medium", "important", "urgent"]).optional().default("medium"),
			progress_status: z.enum(["not_started", "in_progress", "completed"]).optional().default("not_started"),
			start_date: z.string().nullable().optional(),
			due_date: z.string().nullable().optional(),
			assignee_ids: z.array(z.coerce.number()).optional(),
			label_ids: z.array(z.coerce.number()).optional(),
		});
		const payload = schema.parse(req.body);

		const maxOrderRes = await query(
			`SELECT COALESCE(MAX(order_index), -1) as max_idx FROM planner_tasks WHERE bucket_id = $1`,
			[payload.bucket_id]
		);
		const newOrder = maxOrderRes.rows[0].max_idx + 1;

		const taskRes = await query(
			`INSERT INTO planner_tasks 
				(plan_id, bucket_id, title, description, priority, progress_status, start_date, due_date, order_index, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING *`,
			[
				payload.plan_id,
				payload.bucket_id,
				payload.title,
				payload.description || null,
				payload.priority,
				payload.progress_status,
				payload.start_date || null,
				payload.due_date || null,
				newOrder,
				req.user?.id || null,
			]
		);
		const task = taskRes.rows[0];

		// Insert Assignees
		if (payload.assignee_ids && payload.assignee_ids.length > 0) {
			for (const uid of payload.assignee_ids) {
				await query(
					`INSERT INTO planner_task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
					[task.id, uid]
				);
				// Send push notification to assigned user
				sendPush("user", uid, "New Task Assigned", `You were assigned task: ${task.title}`).catch(() => {});
			}
		}

		// Insert Labels
		if (payload.label_ids && payload.label_ids.length > 0) {
			for (const lid of payload.label_ids) {
				await query(
					`INSERT INTO planner_task_labels (task_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
					[task.id, lid]
				);
			}
		}

		// Add activity comment
		await query(
			`INSERT INTO planner_comments (task_id, user_id, comment, is_system_log) VALUES ($1, $2, $3, true)`,
			[task.id, req.user?.id || null, `Task created by ${req.user?.name || "System"}`]
		);

		res.status(201).json(task);
	} catch (err) {
		next(err);
	}
});

// ── BATCH REORDER / MOVE TASKS (Drag & Drop) ──────────────────────────────────
router.put("/planner/tasks/batch-reorder", async (req, res, next) => {
	try {
		const schema = z.object({
			tasks: z.array(
				z.object({
					id: z.coerce.number(),
					bucket_id: z.coerce.number(),
					order_index: z.number(),
				})
			),
		});
		const { tasks } = schema.parse(req.body);

		for (const item of tasks) {
			await query(
				`UPDATE planner_tasks 
				 SET bucket_id = $1, order_index = $2, updated_at = NOW() 
				 WHERE id = $3`,
				[item.bucket_id, item.order_index, item.id]
			);
		}

		res.json({ message: "Tasks reordered successfully." });
	} catch (err) {
		next(err);
	}
});

// ── UPDATE TASK DETAILS ───────────────────────────────────────────────────────
router.put("/planner/tasks/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const schema = z.object({
			title: z.string().optional(),
			description: z.string().nullable().optional(),
			bucket_id: z.coerce.number().optional(),
			priority: z.enum(["low", "medium", "important", "urgent"]).optional(),
			progress_status: z.enum(["not_started", "in_progress", "completed"]).optional(),
			start_date: z.string().nullable().optional(),
			due_date: z.string().nullable().optional(),
			preview_type: z.string().optional(),
			assignee_ids: z.array(z.coerce.number()).optional(),
			label_ids: z.array(z.coerce.number()).optional(),
		});
		const payload = schema.parse(req.body);

		let completedAtClause = "";
		if (payload.progress_status === "completed") {
			completedAtClause = ", completed_at = NOW()";
		} else if (payload.progress_status && payload.progress_status !== "completed") {
			completedAtClause = ", completed_at = NULL";
		}

		const taskRes = await query(
			`UPDATE planner_tasks 
			 SET title = COALESCE($1, title),
				 description = COALESCE($2, description),
				 bucket_id = COALESCE($3, bucket_id),
				 priority = COALESCE($4, priority),
				 progress_status = COALESCE($5, progress_status),
				 start_date = $6,
				 due_date = $7,
				 preview_type = COALESCE($8, preview_type),
				 updated_at = NOW()
				 ${completedAtClause}
			 WHERE id = $9 RETURNING *`,
			[
				payload.title,
				payload.description,
				payload.bucket_id,
				payload.priority,
				payload.progress_status,
				payload.start_date === undefined ? undefined : payload.start_date,
				payload.due_date === undefined ? undefined : payload.due_date,
				payload.preview_type,
				id,
			]
		);

		if (taskRes.rows.length === 0) {
			return res.status(404).json({ message: "Task not found" });
		}
		const updatedTask = taskRes.rows[0];

		// Sync Assignees if provided
		if (payload.assignee_ids !== undefined) {
			await query(`DELETE FROM planner_task_assignees WHERE task_id = $1`, [id]);
			for (const uid of payload.assignee_ids) {
				await query(
					`INSERT INTO planner_task_assignees (task_id, user_id) VALUES ($1, $2)`,
					[id, uid]
				);
			}
		}

		// Sync Labels if provided
		if (payload.label_ids !== undefined) {
			await query(`DELETE FROM planner_task_labels WHERE task_id = $1`, [id]);
			for (const lid of payload.label_ids) {
				await query(
					`INSERT INTO planner_task_labels (task_id, label_id) VALUES ($1, $2)`,
					[id, lid]
				);
			}
		}

		res.json(updatedTask);
	} catch (err) {
		next(err);
	}
});

// ── DELETE TASK ───────────────────────────────────────────────────────────────
router.delete("/planner/tasks/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		await query(`DELETE FROM planner_tasks WHERE id = $1`, [id]);
		res.json({ message: "Task deleted." });
	} catch (err) {
		next(err);
	}
});

// ── CHECKLIST ITEMS ───────────────────────────────────────────────────────────
router.post("/planner/tasks/:id/checklist", async (req, res, next) => {
	try {
		const { id } = req.params;
		const schema = z.object({ title: z.string().min(1) });
		const { title } = schema.parse(req.body);

		const maxOrderRes = await query(
			`SELECT COALESCE(MAX(order_index), -1) as max_idx FROM planner_checklists WHERE task_id = $1`,
			[id]
		);
		const newOrder = maxOrderRes.rows[0].max_idx + 1;

		const result = await query(
			`INSERT INTO planner_checklists (task_id, title, order_index) VALUES ($1, $2, $3) RETURNING *`,
			[id, title, newOrder]
		);
		res.status(201).json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

router.put("/planner/checklist/:checklistId", async (req, res, next) => {
	try {
		const { checklistId } = req.params;
		const schema = z.object({
			title: z.string().optional(),
			is_completed: z.boolean().optional(),
		});
		const data = schema.parse(req.body);

		const result = await query(
			`UPDATE planner_checklists 
			 SET title = COALESCE($1, title),
				 is_completed = COALESCE($2, is_completed)
			 WHERE id = $3 RETURNING *`,
			[data.title, data.is_completed, checklistId]
		);
		res.json(result.rows[0]);
	} catch (err) {
		next(err);
	}
});

router.delete("/planner/checklist/:checklistId", async (req, res, next) => {
	try {
		const { checklistId } = req.params;
		await query(`DELETE FROM planner_checklists WHERE id = $1`, [checklistId]);
		res.json({ message: "Checklist item deleted." });
	} catch (err) {
		next(err);
	}
});

// ── COMMENTS ──────────────────────────────────────────────────────────────────
router.get("/planner/tasks/:id/comments", async (req, res, next) => {
	try {
		const { id } = req.params;
		const result = await query(
			`SELECT c.*, u.name as user_name, u.last_name as user_last_name 
			 FROM planner_comments c
			 LEFT JOIN users u ON u.id = c.user_id
			 WHERE c.task_id = $1
			 ORDER BY c.created_at ASC`,
			[id]
		);
		res.json(result.rows);
	} catch (err) {
		next(err);
	}
});

router.post("/planner/tasks/:id/comments", async (req, res, next) => {
	try {
		const { id } = req.params;
		const schema = z.object({ comment: z.string().min(1) });
		const { comment } = schema.parse(req.body);

		const result = await query(
			`INSERT INTO planner_comments (task_id, user_id, comment)
			 VALUES ($1, $2, $3) RETURNING *`,
			[id, req.user?.id || null, comment]
		);
		const newComment = result.rows[0];
		newComment.user_name = req.user?.name || "User";
		newComment.user_last_name = req.user?.last_name || "";

		res.status(201).json(newComment);
	} catch (err) {
		next(err);
	}
});

// ── GET ASSIGNEE USERS ────────────────────────────────────────────────────────
router.get("/planner/users", async (_req, res, next) => {
	try {
		const result = await query(
			`SELECT id, name, last_name, email, role_id FROM users WHERE deleted_at IS NULL ORDER BY name ASC`
		);
		res.json(result.rows);
	} catch (err) {
		next(err);
	}
});

export default router;
