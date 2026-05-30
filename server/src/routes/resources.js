import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/pool.js";
import {
  parsePagination,
  resourceRouter,
  schemas,
  syncTaskTechnicians,
} from "../http/crud.js";
import { requireRoles } from "../auth.js";

const router = Router();

const admin = requireRoles("admin");
const staff = requireRoles("admin", "menaxher", "shites");
const ops = requireRoles("admin", "menaxher", "teknik", "shites");
const manager = requireRoles("admin", "menaxher");

function mount(path, handlers, middlewares = []) {
  const readMiddlewares = Array.isArray(middlewares)
    ? middlewares
    : (middlewares.read ?? []);
  const writeMiddlewares = Array.isArray(middlewares)
    ? middlewares
    : (middlewares.write ?? readMiddlewares);

  router.get(path, readMiddlewares, handlers.list);
  router.post(path, writeMiddlewares, handlers.create);
  router.get(`${path}/:id`, readMiddlewares, handlers.show);
  router.put(`${path}/:id`, writeMiddlewares, handlers.update);
  router.delete(`${path}/:id`, writeMiddlewares, handlers.destroy);
  router.post(`${path}/:id/restore`, writeMiddlewares, handlers.restore);
}

async function lookupId(table, slug) {
  const result = await query(
    `select id from ${table} where slug = $1 limit 1`,
    [slug],
  );
  return result.rows[0]?.id ?? null;
}

const users = resourceRouter({
  table: "users",
  select:
    "users.id, users.name, users.last_name, users.email, users.phone_number, users.address, users.city, users.experience, users.role_id, roles.name as role, users.created_at, users.updated_at, users.deleted_at",
  listJoins: "left join roles on roles.id = users.role_id",
  searchColumns: [
    "users.name",
    "users.email",
    "users.phone_number",
    "roles.name",
  ],
  writable: [
    "name",
    "lastName",
    "email",
    "phoneNumber",
    "address",
    "city",
    "experience",
    "roleId",
    "createdBy",
    "password",
  ],
  schema: schemas.user,
  beforeCreate: async (payload) => ({
    ...payload,
    password: await bcrypt.hash(payload.password ?? "asdasdasd", 10),
  }),
  beforeUpdate: async (payload) =>
    payload.password
      ? { ...payload, password: await bcrypt.hash(payload.password, 10) }
      : payload,
});

const clients = resourceRouter({
  table: "client",
  searchColumns: [
    "client.name",
    "client.last_name",
    "client.email",
    "client.phone_number",
    "client.nipt",
  ],
  writable: [
    "name",
    "lastName",
    "email",
    "phoneNumber",
    "address",
    "nipt",
    "roleId",
    "createdBy",
  ],
  schema: schemas.client,
});

const products = resourceRouter({
  table: "products",
  select: "products.*, categories.name as category_name",
  listJoins: "left join categories on categories.id = products.category_id",
  searchColumns: [
    "products.name",
    "products.sku",
    "products.description",
    "categories.name",
  ],
  writable: [
    "name",
    "description",
    "sku",
    "categoryId",
    "price",
    "oldPrice",
    "image",
    "stock",
    "inStore",
    "inHand",
  ],
  schema: schemas.product,
});

const categories = resourceRouter({
  table: "categories",
  searchColumns: ["categories.name"],
  writable: ["name"],
  schema: schemas.category,
  orderBy: "categories.name asc",
  softDelete: false,
});

const sales = resourceRouter({
  table: "sales",
  select:
    "sales.*, products.name as product_name, client.name as client_name, client.last_name as client_last_name, users.name as seller_name, statuses.slug as status_slug, statuses.label as status_label",
  listJoins:
    "left join products on products.id = sales.product_id left join client on client.id = sales.client_id left join users on users.id = sales.sold_by left join statuses on statuses.id = sales.status_id",
  searchColumns: [
    "products.name",
    "client.name",
    "client.last_name",
    "users.name",
    "sales.payment_method",
  ],
  writable: [
    "productId",
    "clientId",
    "quantity",
    "warranty",
    "installation",
    "mountingPrice",
    "totalPrice",
    "paymentMethod",
    "statusId",
    "soldBy",
    "address",
    "soldAt",
  ],
  schema: schemas.sale,
  beforeCreate: async (payload, req) => ({
    ...payload,
    statusId: payload.statusId ?? (await lookupId("statuses", "pending")),
    soldBy: payload.soldBy ?? req.user.id,
  }),
});

const tasks = resourceRouter({
  table: "tasks",
  select: `tasks.*, statuses.slug as status_slug, statuses.label as status_label, priorities.slug as priority_slug,
    priorities.label as priority_label, sales.id as sale_number,
    coalesce(json_agg(distinct jsonb_build_object('id', tech.id, 'name', tech.name)) filter (where tech.id is not null), '[]') as technicians`,
  listJoins:
    "left join statuses on statuses.id = tasks.status_id left join priorities on priorities.id = tasks.priority_id left join sales on sales.id = tasks.sale_id left join task_technician tt on tt.task_id = tasks.id left join users tech on tech.id = tt.technician_id",
  searchColumns: [
    "tasks.title",
    "tasks.description",
    "statuses.label",
    "priorities.label",
  ],
  groupBy:
    "group by tasks.id, statuses.slug, statuses.label, priorities.slug, priorities.label, sales.id",
  orderBy: "tasks.created_at desc, tasks.id desc",
  writable: [
    "title",
    "description",
    "saleId",
    "technicianJobId",
    "dueDate",
    "statusId",
    "priorityId",
    "createdBy",
  ],
  schema: schemas.task,
  beforeCreate: async (payload, req) => ({
    ...payload,
    statusId: payload.statusId ?? (await lookupId("statuses", "pending")),
    priorityId: payload.priorityId ?? (await lookupId("priorities", "medium")),
    createdBy: payload.createdBy ?? req.user.id,
  }),
  afterCreate: async (row, payload) =>
    syncTaskTechnicians(row.id, payload.technicianIds),
  afterUpdate: async (row, payload) => {
    if (payload.technicianIds)
      await syncTaskTechnicians(row.id, payload.technicianIds);
  },
});

const inspections = resourceRouter({
  table: "inspections",
  select:
    "inspections.*, tasks.title as task_title, users.name as technician_name",
  listJoins:
    "left join tasks on tasks.id = inspections.task_id left join users on users.id = inspections.technician_id",
  searchColumns: [
    "tasks.title",
    "users.name",
    "inspections.status",
    "inspections.notes",
  ],
  writable: [
    "taskId",
    "technicianId",
    "scheduledAt",
    "status",
    "notes",
    "photos",
    "videos",
  ],
  schema: schemas.inspection,
});

const news = resourceRouter({
  table: "news",
  select: "news.*, users.name as creator_name",
  listJoins: "left join users on users.id = news.created_by",
  searchColumns: ["news.title", "news.content", "news.type"],
  writable: ["title", "content", "type", "image", "publishedAt", "createdBy"],
  schema: schemas.news,
  beforeCreate: (payload, req) => ({
    ...payload,
    createdBy: payload.createdBy ?? req.user.id,
  }),
});

const tickets = resourceRouter({
  table: "tickets",
  select:
    "tickets.*, products.name as product_name, opener.name as opener_name, tech.name as technician_name, ticket_client.name as client_name, ticket_client.last_name as client_last_name",
  listJoins:
    "left join products on products.id = tickets.product_id left join users opener on opener.id = tickets.opened_by left join users tech on tech.id = tickets.assigned_to left join client ticket_client on ticket_client.id = tickets.client_id",
  searchColumns: [
    "tickets.title",
    "tickets.description",
    "tickets.status",
    "products.name",
    "opener.name",
    "tech.name",
    "ticket_client.name",
    "ticket_client.last_name",
  ],
  writable: [
    "title",
    "description",
    "productId",
    "clientId",
    "status",
    "openedBy",
    "assignedTo",
    "photos",
    "videos",
    "resolvedAt",
  ],
  schema: schemas.ticket,
  beforeCreate: (payload, req) => ({
    ...payload,
    clientId: req.user.type === "client" ? req.user.id : payload.clientId,
    openedBy:
      req.user.type === "client" ? null : (payload.openedBy ?? req.user.id),
    status: payload.status ?? "new",
  }),
});

const complaints = resourceRouter({
  table: "complaints",
  select:
    "complaints.*, statuses.slug as status_slug, statuses.label as status_label, priorities.slug as priority_slug, priorities.label as priority_label, users.name as creator_name, complaint_client.name as account_client_name, complaint_client.last_name as account_client_last_name",
  listJoins:
    "left join statuses on statuses.id = complaints.status_id left join priorities on priorities.id = complaints.priority_id left join users on users.id = complaints.creator_id left join client complaint_client on complaint_client.id = complaints.client_id",
  searchColumns: [
    "complaints.title",
    "complaints.description",
    "complaints.client_name",
    "complaints.client_email",
    "complaints.client_phone",
    "complaint_client.name",
    "complaint_client.last_name",
  ],
  writable: [
    "title",
    "description",
    "clientName",
    "clientPhone",
    "clientEmail",
    "location",
    "clientId",
    "statusId",
    "priorityId",
    "creatorId",
  ],
  schema: schemas.complaint,
  beforeCreate: async (payload, req) => ({
    ...payload,
    clientId: req.user.type === "client" ? req.user.id : payload.clientId,
    statusId: payload.statusId ?? (await lookupId("statuses", "pending")),
    priorityId: payload.priorityId ?? (await lookupId("priorities", "medium")),
    creatorId:
      req.user.type === "client" ? null : (payload.creatorId ?? req.user.id),
  }),
});

mount("/users", users, [admin]);
mount("/clients", clients, [staff]);
mount("/categories", categories, [staff]);
mount("/products", products, { read: [], write: [staff] });
mount("/sales", sales, [staff]);
mount("/tasks", tasks, [ops]);
mount("/inspections", inspections, [ops]);
mount("/news", news, { read: [], write: [manager] });
mount("/tickets", tickets, [ops]);
mount("/complaints", complaints, [ops]);

router.get("/my/tickets", async (req, res, next) => {
  try {
    const { page, perPage, offset } = parsePagination(req);
    const ownerColumn =
      req.user.type === "client" ? "tickets.client_id" : "tickets.opened_by";
    const params = [req.user.id];
    const where = [`${ownerColumn} = $1`, "tickets.deleted_at is null"];
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(
        `(lower(tickets.title) like $${params.length} or lower(tickets.description) like $${params.length})`,
      );
    }
    const whereSql = `where ${where.join(" and ")}`;
    const totalResult = await query(
      `select count(*)::int as total from tickets ${whereSql}`,
      params,
    );
    const result = await query(
      `select tickets.*, products.name as product_name, users.name as technician_name, client.name as client_name, client.last_name as client_last_name
       from tickets
       left join products on products.id = tickets.product_id
       left join users on users.id = tickets.assigned_to
       left join client on client.id = tickets.client_id
       ${whereSql}
       order by tickets.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    res.json({
      data: result.rows,
      meta: { page, per_page: perPage, total: totalResult.rows[0].total },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/my/tickets", tickets.create);

router.get("/my/complaints", async (req, res, next) => {
  try {
    const { page, perPage, offset } = parsePagination(req);
    const ownerColumn =
      req.user.type === "client"
        ? "complaints.client_id"
        : "complaints.creator_id";
    const params = [req.user.id];
    const where = [`${ownerColumn} = $1`, "complaints.deleted_at is null"];
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(
        `(lower(complaints.title) like $${params.length} or lower(coalesce(complaints.description, '')) like $${params.length})`,
      );
    }
    const whereSql = `where ${where.join(" and ")}`;
    const totalResult = await query(
      `select count(*)::int as total from complaints ${whereSql}`,
      params,
    );
    const result = await query(
      `select complaints.*, statuses.slug as status_slug, statuses.label as status_label, priorities.slug as priority_slug, priorities.label as priority_label
       from complaints
       left join statuses on statuses.id = complaints.status_id
       left join priorities on priorities.id = complaints.priority_id
       ${whereSql}
       order by complaints.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    res.json({
      data: result.rows,
      meta: { page, per_page: perPage, total: totalResult.rows[0].total },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/my/complaints", complaints.create);

router.post("/tools/btu", (req, res) => {
  const area = Number(req.body.area || 0);
  const height = Number(req.body.height || 0);
  const occupants = Number(req.body.occupants || 0);
  const sun = req.body.sun || "medium";
  const insulation = req.body.insulation || "average";
  const areaFt = area * 10.7639;
  const ranges = [
    [100, 150, 5000],
    [150, 250, 6000],
    [250, 300, 7000],
    [300, 350, 8000],
    [350, 400, 9000],
    [400, 450, 10000],
    [450, 550, 12000],
    [550, 700, 14000],
    [700, 1000, 18000],
    [1000, 1200, 21000],
    [1200, 1400, 23000],
    [1400, 1500, 24000],
    [1500, 2000, 30000],
    [2000, 2500, 34000],
  ];

  let base = areaFt < 100 ? Math.round((areaFt / 100) * 5000) : 0;
  for (const [min, max, value] of ranges) {
    if (areaFt >= min && areaFt <= max) {
      base = value;
      break;
    }
  }
  if (!base && areaFt >= 100) base = Math.round(areaFt * 17);

  const heightFt = height * 3.28084;
  let btu = base * (heightFt > 0 ? heightFt / 8 : 1);
  btu += occupants * 600;
  btu *= 1 + (sun === "high" ? 0.1 : sun === "low" ? -0.1 : 0);
  btu *= 1 + (insulation === "poor" ? 0.1 : insulation === "good" ? -0.1 : 0);

  res.json({ btu: Math.max(0, Math.round(btu / 100) * 100) });
});

router.get("/lookups", async (req, res, next) => {
  try {
    const [
      roles,
      statuses,
      priorities,
      categories,
      technicianJobs,
      technicians,
      users,
      clients,
      products,
    ] = await Promise.all([
      query("select * from roles order by name"),
      query("select * from statuses order by sort_order"),
      query("select * from priorities order by sort_order"),
      query("select * from categories order by name"),
      query("select * from technician_jobs order by title"),
      query(
        "select users.id, users.name, users.email from users join roles on roles.id = users.role_id where roles.name = 'teknik' and users.deleted_at is null order by users.name",
      ),
      query(
        "select id, name, email from users where deleted_at is null order by name",
      ),
      query(
        "select id, name, last_name, email, phone_number, address from client where deleted_at is null order by name",
      ),
      query(
        "select id, name, sku, price, stock from products where deleted_at is null order by name",
      ),
    ]);
    const clientOnly = req.user.role === "client";
    res.json({
      roles: clientOnly ? [] : roles.rows,
      statuses: statuses.rows,
      priorities: priorities.rows,
      categories: categories.rows,
      technician_jobs: technicianJobs.rows,
      technicians: clientOnly ? [] : technicians.rows,
      users: clientOnly ? [] : users.rows,
      clients: clientOnly ? [] : clients.rows,
      products: products.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:id/status", ops, async (req, res, next) => {
  try {
    const result = await query(
      "update tasks set status_id = $1, updated_at = now() where id = $2 and deleted_at is null returning *",
      [req.body.status_id, req.params.id],
    );
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/comments", ops, async (req, res, next) => {
  try {
    const result = await query(
      "insert into comments (task_id, user_id, body) values ($1, $2, $3) returning *",
      [req.params.id, req.user.id, req.body.body],
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/reports", ops, async (req, res, next) => {
  try {
    const result = await query(
      `select reports.*, tasks.title as task_title, tasks.due_date, statuses.label as status_label
       from reports
       join tasks on tasks.id = reports.task_id
       left join statuses on statuses.id = tasks.status_id
       order by reports.created_at desc`,
    );
    res.json({ data: result.rows, meta: { total: result.rowCount } });
  } catch (error) {
    next(error);
  }
});

export default router;
