import { z } from "zod";
import { query, transaction } from "../db/pool.js";
import { HttpError, notFound } from "./errors.js";

const nullableNumber = () => z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().nullable(),
);

const optionalNullableNumber = () => nullableNumber().optional();
const optionalEnum = (values, fallback) => z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.enum(values).default(fallback),
);

function toSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function pick(input, keys) {
  return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export function parsePagination(req) {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const perPage = Math.min(Math.max(Number(req.query.per_page ?? req.query.perPage ?? 15), 1), 100);
  return { page, perPage, offset: (page - 1) * perPage };
}

export function resourceRouter(config) {
  const {
    table,
    select = `${table}.*`,
    listJoins = "",
    searchColumns = [],
    writable,
    schema,
    orderBy = `${table}.created_at desc`,
    groupBy = "",
    id = "id",
    softDelete = true,
    beforeCreate,
    beforeUpdate,
    afterCreate,
    afterUpdate,
  } = config;

  async function list(req, res, next) {
    try {
      const { page, perPage, offset } = parsePagination(req);
      const params = [];
      const where = softDelete ? [`${table}.deleted_at is null`] : [];
      if (req.query.search && searchColumns.length) {
        params.push(`%${String(req.query.search).toLowerCase()}%`);
        where.push(`(${searchColumns.map((column) => `lower(coalesce(${column}::text, '')) like $${params.length}`).join(" or ")})`);
      }
      const whereSql = where.length ? `where ${where.join(" and ")}` : "";
      const totalResult = await query(`select count(*)::int as total from ${table} ${listJoins} ${whereSql}`, params);
      const result = await query(
        `select ${select} from ${table} ${listJoins} ${whereSql} ${groupBy} order by ${orderBy} limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, perPage, offset],
      );
      res.json({
        data: result.rows,
        meta: { page, per_page: perPage, total: totalResult.rows[0].total },
      });
    } catch (error) {
      next(error);
    }
  }

  async function show(req, res, next) {
    try {
      const result = await query(
        `select ${select} from ${table} ${listJoins} where ${table}.${id} = $1 ${softDelete ? `and ${table}.deleted_at is null` : ""} ${groupBy}`,
        [req.params[id] ?? req.params.id],
      );
      const row = result.rows[0];
      if (!row) throw notFound();
      res.json({ data: row });
    } catch (error) {
      next(error);
    }
  }

  async function create(req, res, next) {
    try {
      const payload = schema ? schema.parse(req.body) : pick(req.body, writable);
      const prepared = beforeCreate ? await beforeCreate(payload, req) : payload;
      const keys = Object.keys(pick(prepared, writable));
      if (!keys.length) throw new HttpError(422, "No writable fields supplied");
      const columns = keys.map(toSnake);
      const values = keys.map((key) => prepared[key]);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const result = await query(
        `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")}) returning *`,
        values,
      );
      if (afterCreate) await afterCreate(result.rows[0], prepared, req);
      res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  async function update(req, res, next) {
    try {
      const payload = schema ? schema.partial().parse(req.body) : pick(req.body, writable);
      const prepared = beforeUpdate ? await beforeUpdate(payload, req) : payload;
      const keys = Object.keys(pick(prepared, writable));
      if (!keys.length) throw new HttpError(422, "No writable fields supplied");
      const values = keys.map((key) => prepared[key]);
      const sets = keys.map((key, index) => `${toSnake(key)} = $${index + 1}`);
      const result = await query(
        `update ${table} set ${sets.join(", ")}, updated_at = now() where ${id} = $${values.length + 1} ${softDelete ? "and deleted_at is null" : ""} returning *`,
        [...values, req.params[id] ?? req.params.id],
      );
      if (!result.rows[0]) throw notFound();
      if (afterUpdate) await afterUpdate(result.rows[0], prepared, req);
      res.json({ data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  async function destroy(req, res, next) {
    try {
      const result = softDelete
        ? await query(`update ${table} set deleted_at = now(), updated_at = now() where ${id} = $1 and deleted_at is null returning *`, [req.params[id] ?? req.params.id])
        : await query(`delete from ${table} where ${id} = $1 returning *`, [req.params[id] ?? req.params.id]);
      if (!result.rows[0]) throw notFound();
      res.json({ message: "Deleted", data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  async function restore(req, res, next) {
    try {
      const result = await query(`update ${table} set deleted_at = null, updated_at = now() where ${id} = $1 returning *`, [req.params.id]);
      if (!result.rows[0]) throw notFound();
      res.json({ message: "Restored", data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  return { list, show, create, update, destroy, restore };
}

export async function syncTaskTechnicians(taskId, technicianIds = []) {
  await transaction(async (client) => {
    await client.query("delete from task_technician where task_id = $1", [taskId]);
    for (const technicianId of technicianIds) {
      await client.query(
        "insert into task_technician (task_id, technician_id) values ($1, $2) on conflict do nothing",
        [taskId, technicianId],
      );
    }
  });
}

export const schemas = {
  user: z.object({
    name: z.string().min(1),
    lastName: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    phoneNumber: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    experience: z.string().optional().nullable(),
    roleId: optionalNullableNumber(),
    createdBy: optionalNullableNumber(),
    password: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.string().min(8).optional()),
  }),
  client: z.object({
    name: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional().nullable(),
    phoneNumber: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    nipt: z.string().optional().nullable(),
    roleId: optionalNullableNumber(),
    createdBy: optionalNullableNumber(),
  }),
  product: z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    sku: z.string().min(1),
    categoryId: optionalNullableNumber(),
    price: z.coerce.number().default(0),
    stock: z.coerce.number().int().default(0),
    inStore: z.coerce.number().int().default(0),
    inHand: z.coerce.number().int().default(0),
  }),
  sale: z.object({
    productId: z.coerce.number(),
    clientId: z.coerce.number(),
    quantity: z.coerce.number().int().default(1),
    warranty: z.coerce.number().int().default(0),
    installation: z.coerce.boolean().default(false),
    mountingPrice: z.coerce.number().default(0),
    totalPrice: z.coerce.number(),
    paymentMethod: z.string().default("cash"),
    statusId: optionalNullableNumber(),
    soldBy: optionalNullableNumber(),
    address: z.string().optional().nullable(),
    soldAt: z.string().optional().nullable(),
  }),
  task: z.object({
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    saleId: optionalNullableNumber(),
    technicianJobId: optionalNullableNumber(),
    dueDate: z.string().optional().nullable(),
    statusId: optionalNullableNumber(),
    priorityId: optionalNullableNumber(),
    createdBy: optionalNullableNumber(),
    technicianIds: z.array(z.coerce.number()).optional(),
  }),
  inspection: z.object({
    taskId: z.coerce.number(),
    technicianId: optionalNullableNumber(),
    scheduledAt: z.string(),
    status: z.preprocess((value) => (value === "" || value === null || value === undefined ? "scheduled" : value), z.string()),
    notes: z.string().optional().nullable(),
    photos: z.array(z.string()).optional().nullable(),
    videos: z.array(z.string()).optional().nullable(),
  }),
  news: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    type: optionalEnum(["blog", "discount"], "blog"),
    image: z.string().optional().nullable(),
    publishedAt: z.string().optional().nullable(),
    createdBy: optionalNullableNumber(),
  }),
  ticket: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    productId: optionalNullableNumber(),
    status: optionalEnum(["new", "in_progress", "resolved"], "new"),
    openedBy: optionalNullableNumber(),
    assignedTo: optionalNullableNumber(),
    photos: z.array(z.string()).optional().nullable(),
    videos: z.array(z.string()).optional().nullable(),
    resolvedAt: z.string().optional().nullable(),
  }),
  complaint: z.object({
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    clientName: z.string().optional().nullable(),
    clientPhone: z.string().optional().nullable(),
    clientEmail: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    statusId: optionalNullableNumber(),
    priorityId: optionalNullableNumber(),
    creatorId: optionalNullableNumber(),
  }),
};
