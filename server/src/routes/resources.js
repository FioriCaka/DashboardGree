import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/pool.js";
import { resourceRouter, schemas, syncTaskTechnicians } from "../http/crud.js";
import { requireRoles } from "../auth.js";

const router = Router();

const admin = requireRoles("admin");
const staff = requireRoles("admin", "menaxher", "shites");
const ops = requireRoles("admin", "menaxher", "teknik", "shites");
const manager = requireRoles("admin", "menaxher");

function mount(path, handlers, middlewares = []) {
  router.get(path, middlewares, handlers.list);
  router.post(path, middlewares, handlers.create);
  router.get(`${path}/:id`, middlewares, handlers.show);
  router.put(`${path}/:id`, middlewares, handlers.update);
  router.delete(`${path}/:id`, middlewares, handlers.destroy);
  router.post(`${path}/:id/restore`, middlewares, handlers.restore);
}

async function lookupId(table, slug) {
  const result = await query(`select id from ${table} where slug = $1 limit 1`, [slug]);
  return result.rows[0]?.id ?? null;
}

const users = resourceRouter({
  table: "users",
  select: "users.id, users.name, users.last_name, users.email, users.phone_number, users.address, users.city, users.experience, users.role_id, roles.name as role, users.created_at, users.updated_at, users.deleted_at",
  listJoins: "left join roles on roles.id = users.role_id",
  searchColumns: ["users.name", "users.email", "users.phone_number", "roles.name"],
  writable: ["name", "lastName", "email", "phoneNumber", "address", "city", "experience", "roleId", "createdBy", "password"],
  schema: schemas.user,
  beforeCreate: async (payload) => ({ ...payload, password: await bcrypt.hash(payload.password ?? "asdasdasd", 10) }),
  beforeUpdate: async (payload) => (payload.password ? { ...payload, password: await bcrypt.hash(payload.password, 10) } : payload),
});

const clients = resourceRouter({
  table: "client",
  searchColumns: ["client.name", "client.last_name", "client.email", "client.phone_number", "client.nipt"],
  writable: ["name", "lastName", "email", "phoneNumber", "address", "nipt", "roleId", "createdBy"],
  schema: schemas.client,
});

const products = resourceRouter({
  table: "products",
  select: "products.*, categories.name as category_name",
  listJoins: "left join categories on categories.id = products.category_id",
  searchColumns: ["products.name", "products.sku", "products.description", "categories.name"],
  writable: ["name", "description", "sku", "categoryId", "price", "stock", "inStore", "inHand"],
  schema: schemas.product,
});

const sales = resourceRouter({
  table: "sales",
  select: "sales.*, products.name as product_name, client.name as client_name, client.last_name as client_last_name, users.name as seller_name, statuses.slug as status_slug, statuses.label as status_label",
  listJoins: "left join products on products.id = sales.product_id left join client on client.id = sales.client_id left join users on users.id = sales.sold_by left join statuses on statuses.id = sales.status_id",
  searchColumns: ["products.name", "client.name", "client.last_name", "users.name", "sales.payment_method"],
  writable: ["productId", "clientId", "quantity", "warranty", "installation", "mountingPrice", "totalPrice", "paymentMethod", "statusId", "soldBy", "address", "soldAt"],
  schema: schemas.sale,
  beforeCreate: async (payload, req) => ({
    ...payload,
    statusId: payload.statusId ?? await lookupId("statuses", "pending"),
    soldBy: payload.soldBy ?? req.user.id,
  }),
});

const tasks = resourceRouter({
  table: "tasks",
  select: `tasks.*, statuses.slug as status_slug, statuses.label as status_label, priorities.slug as priority_slug,
    priorities.label as priority_label, sales.id as sale_number,
    coalesce(json_agg(distinct jsonb_build_object('id', tech.id, 'name', tech.name)) filter (where tech.id is not null), '[]') as technicians`,
  listJoins: "left join statuses on statuses.id = tasks.status_id left join priorities on priorities.id = tasks.priority_id left join sales on sales.id = tasks.sale_id left join task_technician tt on tt.task_id = tasks.id left join users tech on tech.id = tt.technician_id",
  searchColumns: ["tasks.title", "tasks.description", "statuses.label", "priorities.label"],
  groupBy: "group by tasks.id, statuses.slug, statuses.label, priorities.slug, priorities.label, sales.id",
  orderBy: "tasks.created_at desc, tasks.id desc",
  writable: ["title", "description", "saleId", "technicianJobId", "dueDate", "statusId", "priorityId", "createdBy"],
  schema: schemas.task,
  beforeCreate: async (payload, req) => ({
    ...payload,
    statusId: payload.statusId ?? await lookupId("statuses", "pending"),
    priorityId: payload.priorityId ?? await lookupId("priorities", "medium"),
    createdBy: payload.createdBy ?? req.user.id,
  }),
  afterCreate: async (row, payload) => syncTaskTechnicians(row.id, payload.technicianIds),
  afterUpdate: async (row, payload) => {
    if (payload.technicianIds) await syncTaskTechnicians(row.id, payload.technicianIds);
  },
});

const inspections = resourceRouter({
  table: "inspections",
  select: "inspections.*, tasks.title as task_title, users.name as technician_name",
  listJoins: "left join tasks on tasks.id = inspections.task_id left join users on users.id = inspections.technician_id",
  searchColumns: ["tasks.title", "users.name", "inspections.status", "inspections.notes"],
  writable: ["taskId", "technicianId", "scheduledAt", "status", "notes", "photos", "videos"],
  schema: schemas.inspection,
});

const news = resourceRouter({
  table: "news",
  select: "news.*, users.name as creator_name",
  listJoins: "left join users on users.id = news.created_by",
  searchColumns: ["news.title", "news.content", "news.type"],
  writable: ["title", "content", "type", "image", "publishedAt", "createdBy"],
  schema: schemas.news,
  beforeCreate: (payload, req) => ({ ...payload, createdBy: payload.createdBy ?? req.user.id }),
});

const tickets = resourceRouter({
  table: "tickets",
  select: "tickets.*, products.name as product_name, opener.name as opener_name, tech.name as technician_name",
  listJoins: "left join products on products.id = tickets.product_id left join users opener on opener.id = tickets.opened_by left join users tech on tech.id = tickets.assigned_to",
  searchColumns: ["tickets.title", "tickets.description", "tickets.status", "products.name", "opener.name", "tech.name"],
  writable: ["title", "description", "productId", "status", "openedBy", "assignedTo", "photos", "videos", "resolvedAt"],
  schema: schemas.ticket,
  beforeCreate: (payload, req) => ({ ...payload, openedBy: payload.openedBy ?? req.user.id, status: payload.status ?? "new" }),
});

const complaints = resourceRouter({
  table: "complaints",
  select: "complaints.*, statuses.slug as status_slug, statuses.label as status_label, priorities.slug as priority_slug, priorities.label as priority_label, users.name as creator_name",
  listJoins: "left join statuses on statuses.id = complaints.status_id left join priorities on priorities.id = complaints.priority_id left join users on users.id = complaints.creator_id",
  searchColumns: ["complaints.title", "complaints.description", "complaints.client_name", "complaints.client_email", "complaints.client_phone"],
  writable: ["title", "description", "clientName", "clientPhone", "clientEmail", "location", "statusId", "priorityId", "creatorId"],
  schema: schemas.complaint,
  beforeCreate: async (payload, req) => ({
    ...payload,
    statusId: payload.statusId ?? await lookupId("statuses", "pending"),
    priorityId: payload.priorityId ?? await lookupId("priorities", "medium"),
    creatorId: payload.creatorId ?? req.user.id,
  }),
});

mount("/users", users, [admin]);
mount("/clients", clients, [staff]);
mount("/products", products, [staff]);
mount("/sales", sales, [staff]);
mount("/tasks", tasks, [ops]);
mount("/inspections", inspections, [ops]);
mount("/news", news, [manager]);
mount("/tickets", tickets, [ops]);
mount("/complaints", complaints, [ops]);

router.get("/lookups", async (_req, res, next) => {
  try {
    const [roles, statuses, priorities, categories, technicianJobs, technicians, users, clients, products] = await Promise.all([
      query("select * from roles order by name"),
      query("select * from statuses order by sort_order"),
      query("select * from priorities order by sort_order"),
      query("select * from categories order by name"),
      query("select * from technician_jobs order by title"),
      query("select users.id, users.name, users.email from users join roles on roles.id = users.role_id where roles.name = 'teknik' and users.deleted_at is null order by users.name"),
      query("select id, name, email from users where deleted_at is null order by name"),
      query("select id, name, last_name, email, phone_number, address from client where deleted_at is null order by name"),
      query("select id, name, sku, price, stock from products where deleted_at is null order by name"),
    ]);
    res.json({
      roles: roles.rows,
      statuses: statuses.rows,
      priorities: priorities.rows,
      categories: categories.rows,
      technician_jobs: technicianJobs.rows,
      technicians: technicians.rows,
      users: users.rows,
      clients: clients.rows,
      products: products.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:id/status", ops, async (req, res, next) => {
  try {
    const result = await query("update tasks set status_id = $1, updated_at = now() where id = $2 and deleted_at is null returning *", [req.body.status_id, req.params.id]);
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
