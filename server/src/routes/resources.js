import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { query } from "../db/pool.js";
import {
	parsePagination,
	resourceRouter,
	schemas,
	syncTaskTechnicians,
} from "../http/crud.js";
import { notFound } from "../http/errors.js";
import { requireRoles } from "../auth.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", "..", config.uploadDir);

const productImageStorage = multer.diskStorage({
	destination: async (_req, _file, cb) => {
		const dir = path.join(uploadsRoot, "products");
		await fs.mkdir(dir, { recursive: true });
		cb(null, dir);
	},
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
	},
});

const uploadProductImage = multer({
	storage: productImageStorage,
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
		else cb(new Error("Only JPEG, PNG, WebP or GIF images are allowed"));
	},
}).single("image");

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
	select:
		"client.id, client.name, client.last_name, client.email, client.phone_number, client.address, client.nipt, client.city, client.contact_person, client.client_status, client.notes, client.client_type, client.must_change_password, client.role_id, roles.name as role, client.created_by, client.created_at, client.updated_at, client.deleted_at",
	listJoins: "left join roles on roles.id = client.role_id",
	searchColumns: [
		"client.name",
		"client.last_name",
		"client.email",
		"client.phone_number",
		"client.nipt",
		"client.city",
		"client.contact_person",
	],
	writable: [
		"name",
		"lastName",
		"email",
		"phoneNumber",
		"address",
		"city",
		"contactPerson",
		"clientStatus",
		"notes",
		"clientType",
		"nipt",
		"mustChangePassword",
		"roleId",
		"createdBy",
		"password",
	],
	schema: schemas.client,
	beforeCreate: async (payload, req) => {
		const clientRole = await query(
			"select id from roles where name = 'client' limit 1",
		);
		const roleId = payload.roleId ?? clientRole.rows[0]?.id ?? null;
		return {
			...payload,
			roleId,
			createdBy: payload.createdBy ?? req.user.id,
			mustChangePassword: true,
			password: await bcrypt.hash(payload.password ?? "asdasdasd", 10),
		};
	},
	beforeUpdate: async (payload) =>
		payload.password
			? { ...payload, password: await bcrypt.hash(payload.password, 10) }
			: payload,
});

const products = resourceRouter({
	table: "products",
	select: `products.*,
    coalesce(products.main_image, products.image) as display_image,
    coalesce(mc.name, case when parent_cat.id is not null then parent_cat.name else direct_cat.name end) as main_category_name,
    coalesce(sc.name, case when parent_cat.id is not null then direct_cat.name else null end) as subcategory_name,
    case
      when mc.name is not null and sc.name is not null then mc.name || ' → ' || sc.name
      when mc.name is not null then mc.name
      when parent_cat.id is not null then parent_cat.name || ' → ' || direct_cat.name
      else direct_cat.name
    end as category_path_label,
    (products.product_code is not null) as imported`,
	listJoins: `left join categories direct_cat on direct_cat.id = products.category_id
    left join categories parent_cat on parent_cat.id = direct_cat.parent_id
    left join main_categories mc on mc.id = products.main_category_id
    left join subcategories sc on sc.id = products.subcategory_id`,
	searchColumns: [
		"products.name",
		"products.sku",
		"products.model",
		"products.description",
		"direct_cat.name",
		"parent_cat.name",
		"mc.name",
		"sc.name",
	],
	writable: [
		"name",
		"description",
		"sku",
		"model",
		"categoryId",
		"mainCategoryId",
		"subcategoryId",
		"price",
		"oldPrice",
		"image",
		"mainImage",
		"productCode",
		"stock",
		"inStore",
		"inHand",
		"btu",
		"areaMm2",
		"energyClass",
		"seer",
		"scop",
		"wifiEnabled",
		"heatingCooling",
		"series",
		"warrantyYears",
		"installationPrice",
		"maintenancePrice",
		"manualUrl",
		"environments",
	],
	schema: schemas.product,
});

// Custom show that returns images, prices, options, and feature_values
products.show = async (req, res, next) => {
	try {
		const id = req.params.id;
		const [base, images, prices, opts, features] = await Promise.all([
			query(
				`select products.*,
          coalesce(
            (select pi.image_path from product_images pi
             where pi.product_id = products.id and pi.is_main = true limit 1),
            (select pi.image_path from product_images pi
             where pi.product_id = products.id order by pi.position, pi.id limit 1),
            products.main_image,
            products.image
          ) as display_image,
          coalesce(mc.name, case when parent_cat.id is not null then parent_cat.name else direct_cat.name end) as main_category_name,
          coalesce(sc.name, case when parent_cat.id is not null then direct_cat.name else null end) as subcategory_name,
          case
            when mc.name is not null and sc.name is not null then mc.name || ' → ' || sc.name
            when mc.name is not null then mc.name
            when parent_cat.id is not null then parent_cat.name || ' → ' || direct_cat.name
            else direct_cat.name
          end as category_path_label,
          case
            when products.main_category_id is not null then json_build_array(products.main_category_id, products.subcategory_id)
            when parent_cat.id is not null then json_build_array(parent_cat.id, direct_cat.id)
            when direct_cat.id is not null then json_build_array(direct_cat.id)
            else '[]'::json
          end as category_path,
          (products.product_code is not null) as imported
        from products
        left join categories direct_cat on direct_cat.id = products.category_id
        left join categories parent_cat on parent_cat.id = direct_cat.parent_id
        left join main_categories mc on mc.id = products.main_category_id
        left join subcategories sc on sc.id = products.subcategory_id
        where products.id = $1 and products.deleted_at is null`,
				[id],
			),
			query(
				`select id, image_path, is_main, position, image_path as image
         from product_images where product_id = $1
         order by is_main desc, position asc, id asc`,
				[id],
			),
			query(
				`select pp.usergroup_id, pp.lower_limit, pp.price, ug.name as usergroup_name
         from product_prices pp
         left join user_groups ug on ug.id = pp.usergroup_id
         where pp.product_id = $1
         order by pp.lower_limit asc`,
				[id],
			),
			query(
				`select po.id, o.name as option_name, po.variant_id, ov.name as variant_name
         from product_options po
         join options o on o.id = po.option_id
         join option_variants ov on ov.id = po.variant_id
         where po.product_id = $1
         order by o.name, ov.name`,
				[id],
			),
			query(
				`select pfv.id, f.name as feature_name, pfv.variant_id, fv.name as variant_name
         from product_feature_values pfv
         join features f on f.id = pfv.feature_id
         join feature_variants fv on fv.id = pfv.variant_id
         where pfv.product_id = $1
         order by f.name, fv.name`,
				[id],
			),
		]);

		const row = base.rows[0];
		if (!row) throw notFound();
		res.json({
			data: {
				...row,
				images: images.rows,
				prices: prices.rows,
				options: opts.rows,
				feature_values: features.rows,
			},
		});
	} catch (error) {
		next(error);
	}
};

const categories = resourceRouter({
	table: "categories",
	searchColumns: ["categories.name"],
	writable: ["name"],
	schema: schemas.category,
	orderBy: "categories.name asc",
	softDelete: false,
});

const mainCategories = resourceRouter({
	table: "main_categories",
	searchColumns: ["main_categories.name"],
	writable: ["name"],
	schema: schemas.mainCategory,
	orderBy: "main_categories.name asc",
	softDelete: false,
});

const subcategories = resourceRouter({
	table: "subcategories",
	select: "subcategories.*, mc.name as main_category_name",
	listJoins:
		"left join main_categories mc on mc.id = subcategories.main_category_id",
	searchColumns: ["subcategories.name", "mc.name"],
	writable: ["name", "tagline", "description", "mainCategoryId"],
	schema: schemas.subcategory,
	orderBy: "mc.name asc, subcategories.name asc",
	softDelete: false,
});

const sales = resourceRouter({
	table: "sales",
	select:
		"sales.*, products.name as product_name, products.model as product_model, products.btu as product_btu, mc.name as product_type, client.name as client_name, client.last_name as client_last_name, u_seller.name as seller_name, statuses.slug as status_slug, statuses.label as status_label, priorities.label as priority_label, u_tech.name as technician_name",
	listJoins:
		"left join products on products.id = sales.product_id left join main_categories mc on mc.id = products.main_category_id left join client on client.id = sales.client_id left join users u_seller on u_seller.id = sales.sold_by left join users u_tech on u_tech.id = sales.technician_id left join statuses on statuses.id = sales.status_id left join priorities on priorities.id = sales.priority_id",
	searchColumns: [
		"products.name",
		"client.name",
		"client.last_name",
		"u_seller.name",
		"sales.payment_method",
		"sales.serial_number",
	],
	writable: [
		"productId",
		"clientId",
		"quantity",
		"unitPrice",
		"discount",
		"warranty",
		"installation",
		"mountingPrice",
		"totalPrice",
		"paymentMethod",
		"paymentStatus",
		"statusId",
		"priorityId",
		"soldBy",
		"technicianId",
		"orderSource",
		"address",
		"soldAt",
		"installationDate",
		"serialNumber",
		"notes",
	],
	schema: schemas.sale,
	beforeCreate: async (payload, req) => ({
		...payload,
		statusId: payload.statusId ?? (await lookupId("statuses", "pending")),
		soldBy: payload.soldBy ?? req.user.id,
	}),
});

sales.list = async (req, res, next) => {
	try {
		const { page, perPage, offset } = parsePagination(req);
		const params = [];
		const where = [];
		if (req.query.search) {
			params.push(`%${String(req.query.search).toLowerCase()}%`);
			where.push(
				`(
					lower(coalesce(merged.order_source::text, '')) like $${params.length}
					or lower(coalesce(merged.product_name::text, '')) like $${params.length}
					or lower(coalesce(merged.product_model::text, '')) like $${params.length}
					or lower(coalesce(merged.seller_name::text, '')) like $${params.length}
					or lower(coalesce(merged.serial_number::text, '')) like $${params.length}
					or lower(coalesce(merged.status_label::text, '')) like $${params.length}
				)`,
			);
		}
		if (req.query.status) {
			params.push(String(req.query.status));
			where.push(
				`lower(coalesce(merged.status_slug, '')) = lower($${params.length})`,
			);
		}
		const whereSql = where.length ? `where ${where.join(" and ")}` : "";

		const baseSelect = `
			from (
				select
					sales.id,
					'sales'::text as row_origin,
					sales.order_source,
					null::text as order_number,
					products.name as product_name,
					products.model as product_model,
					products.btu as product_btu,
					mc.name as product_type,
					null::text as delivery_name,
					null::text as delivery_phone,
					null::text as delivery_address,
					null::text as delivery_city,
					sales.quantity,
					sales.unit_price,
					sales.discount,
					sales.total_price,
					sales.payment_method,
					statuses.slug as status_slug,
					statuses.label as status_label,
					sales.payment_status,
					priorities.label as priority_label,
					u_seller.name as seller_name,
					u_tech.name as technician_name,
					sales.installation_date,
					null::date as preferred_installation_date,
					sales.serial_number,
					sales.notes,
					sales.warranty,
					sales.created_at
				from sales
				left join products on products.id = sales.product_id
				left join main_categories mc on mc.id = products.main_category_id
				left join users u_seller on u_seller.id = sales.sold_by
				left join users u_tech on u_tech.id = sales.technician_id
				left join statuses on statuses.id = sales.status_id
				left join priorities on priorities.id = sales.priority_id
				where sales.deleted_at is null

				union all

				select
					orders.id,
					'orders'::text as row_origin,
					'app'::text as order_source,
					orders.order_number,
					coalesce(nullif(string_agg(distinct oi.product_name, ', '), ''), 'App order') as product_name,
					null::text as product_model,
					null::numeric as product_btu,
					null::text as product_type,
					orders.delivery_name,
					orders.delivery_phone,
					orders.delivery_address,
					orders.delivery_city,
					coalesce(sum(oi.quantity), 0)::int as quantity,
					case
						when coalesce(sum(oi.quantity), 0) > 0
							then round(orders.subtotal / sum(oi.quantity)::numeric, 2)
						else null
					end as unit_price,
					orders.discount,
					orders.total as total_price,
					orders.payment_method,
					orders.status as status_slug,
					initcap(orders.status) as status_label,
					null::text as payment_status,
					null::text as priority_label,
					'App'::text as seller_name,
					null::text as technician_name,
					orders.preferred_installation_date::timestamptz as installation_date,
					orders.preferred_installation_date,
					null::text as serial_number,
					orders.notes,
					null::int as warranty,
					orders.created_at
				from orders
				left join order_items oi on oi.order_id = orders.id
				where orders.deleted_at is null
				group by orders.id
			) merged
		`;

		const totalResult = await query(
			`select count(*)::int as total ${baseSelect} ${whereSql}`,
			params,
		);
		const result = await query(
			`select merged.* ${baseSelect} ${whereSql}
			 order by merged.created_at desc, merged.id desc
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
};

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

const maintenance = resourceRouter({
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

const projects = resourceRouter({
	table: "projects",
	select: `projects.*, client.name as client_name, client.last_name as client_last_name, users.name as assigned_to_name`,
	listJoins: `left join client on client.id = projects.client_id left join users on users.id = projects.assigned_to`,
	searchColumns: [
		"projects.description",
		"projects.status",
		"projects.environment",
		"client.name",
		"client.last_name",
	],
	writable: [
		"description",
		"environment",
		"areaSqm",
		"rooms",
		"clientId",
		"status",
		"assignedTo",
		"notes",
	],
	schema: schemas.project,
	beforeCreate: (payload, req) => ({
		...payload,
		clientId: req.user.type === "client" ? req.user.id : payload.clientId,
		status: payload.status ?? "pending",
	}),
});

const installations = resourceRouter({
	table: "installations",
	select: `installations.*,
    client.name as client_name, client.last_name as client_last_name,
    client.phone_number as client_phone, client.city as client_city,
    products.name as product_name, products.model as product_model,
    products.btu as product_btu, mc.name as product_type,
    u_seller.name as seller_name, u_tech.name as technician_name`,
	listJoins: `left join client on client.id = installations.client_id
    left join products on products.id = installations.product_id
    left join main_categories mc on mc.id = products.main_category_id
    left join users u_seller on u_seller.id = installations.sold_by
    left join users u_tech on u_tech.id = installations.technician_id`,
	searchColumns: [
		"client.name",
		"client.last_name",
		"client.phone_number",
		"products.name",
		"installations.serial_number",
		"installations.notes",
	],
	writable: [
		"orderDate",
		"clientId",
		"productId",
		"installationAddress",
		"orderSource",
		"quantity",
		"unitPrice",
		"discount",
		"totalPrice",
		"orderStatus",
		"paymentStatus",
		"priority",
		"soldBy",
		"technicianId",
		"installationDate",
		"serialNumber",
		"notes",
		"warranty",
	],
	schema: schemas.installation,
	beforeCreate: (payload, req) => ({
		...payload,
		soldBy: payload.soldBy ?? req.user.id,
		orderStatus: payload.orderStatus ?? "pending",
		paymentStatus: payload.paymentStatus ?? "unpaid",
	}),
});

router.get("/orders", staff, async (req, res, next) => {
	try {
		const { page, perPage, offset } = parsePagination(req);
		const params = [];
		const where = ["orders.deleted_at is null"];
		if (req.query.search) {
			params.push(`%${String(req.query.search).toLowerCase()}%`);
			where.push(
				`(lower(orders.order_number) like $${params.length} or lower(coalesce(c.name, '')) like $${params.length} or lower(coalesce(c.last_name, '')) like $${params.length} or lower(coalesce(orders.delivery_phone, '')) like $${params.length})`,
			);
		}
		if (req.query.status) {
			params.push(req.query.status);
			where.push(`orders.status = $${params.length}`);
		}
		const whereSql = `where ${where.join(" and ")}`;
		const totalResult = await query(
			`select count(*)::int as total
			 from orders
			 left join client c on c.id = orders.client_id
			 ${whereSql}`,
			params,
		);
		const result = await query(
			`select orders.*, c.name as client_name, c.last_name as client_last_name,
			        c.phone_number as client_phone,
			        count(oi.id)::int as items_count,
			        coalesce(sum(oi.quantity), 0)::int as total_quantity
			 from orders
			 left join client c on c.id = orders.client_id
			 left join order_items oi on oi.order_id = orders.id
			 ${whereSql}
			 group by orders.id, c.id
			 order by orders.created_at desc
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

router.get("/orders/:id", staff, async (req, res, next) => {
	try {
		const orderResult = await query(
			`select orders.*, c.name as client_name, c.last_name as client_last_name,
			        c.phone_number as client_phone
			 from orders
			 left join client c on c.id = orders.client_id
			 where orders.id = $1 and orders.deleted_at is null`,
			[req.params.id],
		);
		const order = orderResult.rows[0];
		if (!order) throw notFound();
		const itemsResult = await query(
			"select * from order_items where order_id = $1 order by id",
			[order.id],
		);
		res.json({ data: { ...order, items: itemsResult.rows } });
	} catch (error) {
		next(error);
	}
});

router.put("/orders/:id", staff, async (req, res, next) => {
	try {
		const raw = req.body ?? {};
		const allowed = {
			deliveryName: "delivery_name",
			deliveryPhone: "delivery_phone",
			deliveryAddress: "delivery_address",
			deliveryCity: "delivery_city",
			paymentMethod: "payment_method",
			status: "status",
			preferredInstallationDate: "preferred_installation_date",
			notes: "notes",
		};
		const entries = Object.entries(allowed)
			.filter(([key]) => raw[key] !== undefined)
			.map(([key, column]) => [column, raw[key]]);

		if (!entries.length) {
			return res.status(422).json({ message: "No writable fields supplied" });
		}

		const values = entries.map(([, value]) => (value === "" ? null : value));
		const sets = entries.map(([column], index) => `${column} = $${index + 1}`);
		const result = await query(
			`update orders
			 set ${sets.join(", ")}, updated_at = now()
			 where id = $${values.length + 1} and deleted_at is null
			 returning *`,
			[...values, req.params.id],
		);

		const row = result.rows[0];
		if (!row) throw notFound();
		res.json({ data: row });
	} catch (error) {
		next(error);
	}
});

router.delete("/orders/:id", staff, async (req, res, next) => {
	try {
		const result = await query(
			`update orders
			 set deleted_at = now(), updated_at = now()
			 where id = $1 and deleted_at is null
			 returning *`,
			[req.params.id],
		);
		const row = result.rows[0];
		if (!row) throw notFound();
		res.json({ message: "Deleted", data: row });
	} catch (error) {
		next(error);
	}
});

mount("/users", users, [admin]);
mount("/clients", clients, [staff]);
mount("/categories", categories, [staff]);
mount("/main-categories", mainCategories, { read: [], write: [staff] });
mount("/subcategories", subcategories, { read: [], write: [staff] });
mount("/products", products, { read: [], write: [staff] });
mount("/sales", sales, [staff]);
mount("/installations", installations, [ops]);
mount("/tasks", tasks, [ops]);
mount("/maintenance", maintenance, [ops]);
mount("/news", news, { read: [], write: [manager] });
mount("/tickets", tickets, [ops]);
mount("/complaints", complaints, [ops]);
mount("/projects", projects, [ops]);

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

router.get("/my/projects", async (req, res, next) => {
	try {
		const { page, perPage, offset } = parsePagination(req);
		const params = [req.user.id];
		const where = ["projects.client_id = $1", "projects.deleted_at is null"];
		if (req.query.search) {
			params.push(`%${String(req.query.search).toLowerCase()}%`);
			where.push(
				`(lower(coalesce(projects.description, '')) like $${params.length} or lower(coalesce(projects.environment, '')) like $${params.length})`,
			);
		}
		const whereSql = `where ${where.join(" and ")}`;
		const totalResult = await query(
			`select count(*)::int as total from projects ${whereSql}`,
			params,
		);
		const result = await query(
			`select projects.*, users.name as assigned_to_name
       from projects
       left join users on users.id = projects.assigned_to
       ${whereSql}
       order by projects.created_at desc
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

router.post("/my/projects", projects.create);

router.post("/tools/btu", (req, res) => {
	const area = Number(req.body.area || 0);
	const height = Number(req.body.height || 0);
	const occupants = Number(req.body.occupants || 0);
	const sun = req.body.sun || "medium";
	const insulation = req.body.insulation || "average";
	const ranges = [
		[9, 14, 7000],
		[15, 20, 9000],
		[28, 35, 12000],
		[36, 45, 24000],
	];

	let base = 0;
	for (const [min, max, value] of ranges) {
		if (area >= min && area <= max) {
			base = value;
			break;
		}
	}
	if (!base) base = Math.round(area * 600);

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
			mainCategoriesRows,
			subcategoriesRows,
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
			query("select * from main_categories order by name"),
			query(
				"select subcategories.*, mc.name as main_category_name from subcategories left join main_categories mc on mc.id = subcategories.main_category_id order by mc.name, subcategories.name",
			),
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
			main_categories: mainCategoriesRows.rows,
			subcategories: subcategoriesRows.rows,
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

// ── Product image gallery endpoints ──────────────────────────────────────────

router.post("/products/:id/images", staff, (req, res, next) => {
	uploadProductImage(req, res, async (err) => {
		if (err) return res.status(400).json({ message: err.message });
		if (!req.file)
			return res.status(400).json({ message: "No image file provided" });
		try {
			const productId = req.params.id;
			const imagePath = `/uploads/products/${req.file.filename}`;

			const existing = await query(
				"select id from product_images where product_id = $1 limit 1",
				[productId],
			);
			const isFirst = existing.rows.length === 0;

			const result = await query(
				`insert into product_images (product_id, image_path, is_main, position)
         values ($1, $2, $3, coalesce((select max(position)+1 from product_images where product_id = $1), 0))
         returning *`,
				[productId, imagePath, isFirst],
			);

			if (isFirst) {
				await query("update products set main_image = $1 where id = $2", [
					imagePath,
					productId,
				]);
			}

			res.status(201).json({ data: result.rows[0] });
		} catch (dbErr) {
			await fs
				.unlink(path.join(uploadsRoot, "products", req.file.filename))
				.catch(() => {});
			next(dbErr);
		}
	});
});

router.delete(
	"/products/:id/images/:imageId",
	staff,
	async (req, res, next) => {
		try {
			const { id: productId, imageId } = req.params;
			const found = await query(
				"select * from product_images where id = $1 and product_id = $2",
				[imageId, productId],
			);
			if (!found.rows[0]) throw notFound();

			const { image_path, is_main } = found.rows[0];

			await query("delete from product_images where id = $1", [imageId]);

			const filename = path.basename(image_path);
			await fs
				.unlink(path.join(uploadsRoot, "products", filename))
				.catch(() => {});

			if (is_main) {
				const next_ = await query(
					"select image_path from product_images where product_id = $1 order by position, id limit 1",
					[productId],
				);
				const newMain = next_.rows[0]?.image_path ?? null;
				await query("update products set main_image = $1 where id = $2", [
					newMain,
					productId,
				]);
				if (newMain) {
					await query(
						"update product_images set is_main = true where product_id = $1 and image_path = $2",
						[productId, newMain],
					);
				}
			}

			res.json({ message: "Deleted" });
		} catch (error) {
			next(error);
		}
	},
);

router.patch(
	"/products/:id/images/:imageId/set-main",
	staff,
	async (req, res, next) => {
		try {
			const { id: productId, imageId } = req.params;
			const found = await query(
				"select * from product_images where id = $1 and product_id = $2",
				[imageId, productId],
			);
			if (!found.rows[0]) throw notFound();

			await query(
				"update product_images set is_main = false where product_id = $1",
				[productId],
			);
			await query("update product_images set is_main = true where id = $1", [
				imageId,
			]);
			await query("update products set main_image = $1 where id = $2", [
				found.rows[0].image_path,
				productId,
			]);

			res.json({ data: { ...found.rows[0], is_main: true } });
		} catch (error) {
			next(error);
		}
	},
);

export default router;
