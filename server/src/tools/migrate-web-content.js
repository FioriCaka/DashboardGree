import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pool, query } from "../db/pool.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..", "..");
const defaultOldServerRoot = path.resolve(
	serverRoot,
	"..",
	"..",
	"..",
	"GreeProfessional",
	"server",
);
const oldServerRoot = path.resolve(
	process.env.WEB_MYSQL_SERVER_ROOT || defaultOldServerRoot,
);
const oldUploadsRoot = path.join(oldServerRoot, "uploads");
const targetUploadsRoot = path.join(serverRoot, config.uploadDir);

function parseEnv(content) {
	const values = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const index = trimmed.indexOf("=");
		if (index === -1) continue;
		const key = trimmed.slice(0, index).trim();
		const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
		values[key] = value;
	}
	return values;
}

async function readOldEnv() {
	try {
		return parseEnv(await fs.readFile(path.join(oldServerRoot, ".env"), "utf8"));
	} catch {
		return {};
	}
}

function toNumber(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value) {
	return value === true || value === 1 || value === "1" || value === "true";
}

function cleanText(value) {
	if (value === undefined || value === null) return null;
	const trimmed = String(value).trim();
	return trimmed ? trimmed : null;
}

function stripUploadsPrefix(value) {
	const text = cleanText(value);
	if (!text) return null;
	return text.replace(/^\/?uploads[\\/]/i, "").replace(/\\/g, "/");
}

function productImagePath(value) {
	const relative = stripUploadsPrefix(value);
	return relative ? `/uploads/${relative}` : null;
}

async function copyUpload(value) {
	const relative = stripUploadsPrefix(value);
	if (!relative) return null;
	const source = path.join(oldUploadsRoot, relative);
	const target = path.join(targetUploadsRoot, relative);
	try {
		await fs.access(source);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.copyFile(source, target).catch(async (error) => {
			if (error.code !== "EEXIST") throw error;
		});
	} catch {
		// Keep database references even when a file is missing; the content row is
		// still useful and the missing asset can be restored later.
	}
	return relative;
}

async function copyProductUpload(value) {
	const relative = await copyUpload(value);
	return relative ? `/uploads/${relative}` : null;
}

async function tableExists(mysql, table) {
	const [rows] = await mysql.query(
		`select 1
		 from information_schema.tables
		 where table_schema = database() and table_name = ?
		 limit 1`,
		[table],
	);
	return rows.length > 0;
}

async function readRows(mysql, table, orderBy = "id asc") {
	if (!(await tableExists(mysql, table))) return [];
	const [rows] = await mysql.query(`select * from ${table} order by ${orderBy}`);
	return rows;
}

async function roleId(name) {
	const result = await query("select id from roles where name = $1 limit 1", [
		name,
	]);
	return result.rows[0]?.id ?? null;
}

async function resetSequence(table) {
	await query(
		`select setval(pg_get_serial_sequence($1, 'id'), coalesce((select max(id) from ${table}), 1), true)`,
		[table],
	);
}

async function migrateUsers(mysql) {
	const rows = await readRows(mysql, "users");
	const adminRoleId = await roleId("admin");
	const managerRoleId = await roleId("menaxher");
	let count = 0;
	for (const row of rows) {
		if (!row.email || !row.password) continue;
		const mappedRoleId =
			String(row.role || "").toLowerCase() === "admin"
				? adminRoleId
				: managerRoleId || adminRoleId;
		await query(
			`insert into users (name, email, password, role_id, created_at, updated_at)
			 values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), now())
			 on conflict (email) do update set
			   name = excluded.name,
			   password = excluded.password,
			   role_id = excluded.role_id,
			   updated_at = now()`,
			[
				row.name || row.email,
				row.email,
				row.password,
				mappedRoleId,
				row.created_at || null,
			],
		);
		count += 1;
	}
	return count;
}

async function findExistingProduct(row) {
	const code = cleanText(row.product_code);
	if (code) {
		const byCode = await query(
			"select id from products where product_code = $1 and deleted_at is null order by id limit 1",
			[code],
		);
		if (byCode.rows[0]) return byCode.rows[0].id;
	}

	const sku = code || cleanText(row.sku) || `WEB-${row.id}`;
	const bySku = await query(
		"select id from products where sku = $1 and deleted_at is null limit 1",
		[sku],
	);
	return bySku.rows[0]?.id ?? null;
}

async function getOrCreateMainCategoryId(name) {
	const normalized = cleanText(name);
	if (!normalized) return null;
	const existing = await query(
		"select id from main_categories where lower(trim(name)) = lower($1) limit 1",
		[normalized],
	);
	if (existing.rows[0]) return existing.rows[0].id;
	const inserted = await query(
		"insert into main_categories (name) values ($1) returning id",
		[normalized],
	);
	return inserted.rows[0].id;
}

async function getOrCreateSubcategoryId(mainCategoryId, name) {
	const normalized = cleanText(name);
	if (!mainCategoryId || !normalized) return null;
	const existing = await query(
		`select id from subcategories
		 where main_category_id = $1 and lower(trim(name)) = lower($2)
		 limit 1`,
		[mainCategoryId, normalized],
	);
	if (existing.rows[0]) return existing.rows[0].id;
	const inserted = await query(
		"insert into subcategories (main_category_id, name) values ($1, $2) returning id",
		[mainCategoryId, normalized],
	);
	return inserted.rows[0].id;
}

async function migrateMainCategories(mysql) {
	const rows = await readRows(mysql, "main_categories");
	const categoryMap = new Map();
	for (const row of rows) {
		const result = await query(
			`insert into main_categories (name, sort_order, created_at, updated_at)
			 values ($1, $2, now(), now())
			 on conflict (name) do update set
			   sort_order = excluded.sort_order,
			   updated_at = now()
			 returning id`,
			[row.name, toNumber(row.sort_order)],
		);
		categoryMap.set(Number(row.id), result.rows[0].id);
	}
	return { count: rows.length, categoryMap };
}

async function migrateSubcategories(mysql, categoryMap) {
	const rows = await readRows(mysql, "subcategories");
	const subcategoryMap = new Map();
	for (const row of rows) {
		const mainCategoryId =
			categoryMap.get(Number(row.main_category_id)) || row.main_category_id || null;
		const existing = await query(
			`select id from subcategories
			 where main_category_id is not distinct from $1
			   and lower(trim(name)) = lower($2)
			 limit 1`,
			[mainCategoryId, row.name],
		);
		const result = existing.rows[0]
			? await query(
					`update subcategories set
					   tagline = $1,
					   description = $2,
					   short_description = $3,
					   is_special = $4,
					   is_header = $5,
					   sort_order = $6,
					   updated_at = now()
					 where id = $7
					 returning id`,
					[
						row.tagline || null,
						row.description || null,
						row.short_description || null,
						toBool(row.is_special),
						toBool(row.is_header),
						toNumber(row.sort_order),
						existing.rows[0].id,
					],
				)
			: await query(
			`insert into subcategories
			   (name, tagline, description, short_description, main_category_id, is_special, is_header, sort_order, created_at, updated_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
			 returning id`,
			[
				row.name,
				row.tagline || null,
				row.description || null,
				row.short_description || null,
				mainCategoryId,
				toBool(row.is_special),
				toBool(row.is_header),
				toNumber(row.sort_order),
			],
		);
		subcategoryMap.set(Number(row.id), result.rows[0].id);
	}
	return { count: rows.length, subcategoryMap };
}

async function migrateProducts(mysql, categoryMap, subcategoryMap) {
	const rows = await readRows(mysql, "products");
	const productMap = new Map();
	let count = 0;

	for (const row of rows) {
		const existingId = await findExistingProduct(row);
		const code = cleanText(row.product_code);
		const sku = code || cleanText(row.sku) || `WEB-${row.id}`;
		const mainImage = await copyProductUpload(row.main_image || row.image);
		const image = await copyProductUpload(row.image || row.main_image);
		const mainCategoryId =
			categoryMap.get(Number(row.main_category_id)) || row.main_category_id || null;
		const subcategoryId =
			subcategoryMap.get(Number(row.subcategory_id)) || row.subcategory_id || null;
		const price = toNumber(row.price);
		const listPrice = toNumber(row.list_price || row.old_price);

		let result;
		if (existingId) {
			result = await query(
				`update products set
				   product_code = coalesce($1, product_code),
				   sku = coalesce($2, sku),
				   name = $3,
				   category = $4,
				   description = $5,
				   short_description = $6,
				   specs = $7,
				   features = $8,
				   price_range = $9,
				   is_featured = $10,
				   image = coalesce($11, image),
				   main_image = coalesce($12, main_image),
				   price = $13,
				   list_price = $14,
				   old_price = $14,
				   amount = $15::numeric,
				   stock = greatest(stock, $15::numeric::integer),
				   tracking = $16,
				   exceptions_type = $17,
				   main_category_id = coalesce($18, main_category_id),
				   subcategory_id = coalesce($19, subcategory_id),
				   sort_order = $20,
				   updated_at = now()
				 where id = $21
				 returning id`,
				[
					code,
					sku,
					row.name || sku,
					row.category || null,
					row.description || null,
					row.short_description || row.description || null,
					row.specs || null,
					row.features || null,
					row.price_range || null,
					toBool(row.is_featured),
					image,
					mainImage,
					price,
					listPrice,
					toNumber(row.amount),
					row.tracking || null,
					row.exceptions_type || null,
					mainCategoryId,
					subcategoryId,
					toNumber(row.sort_order),
					existingId,
				],
			);
		} else {
			result = await query(
				`insert into products
				   (product_code, sku, name, category, description, short_description, specs, features,
				    price_range, is_featured, image, main_image, price, list_price, old_price, amount,
				    stock, tracking, exceptions_type, main_category_id, subcategory_id, sort_order)
				 values
				   ($1, $2, $3, $4, $5, $6, $7, $8,
				    $9, $10, $11, $12, $13, $14, $14, $15,
				    $15::numeric::integer, $16, $17, $18, $19, $20)
				 returning id`,
				[
					code,
					sku,
					row.name || sku,
					row.category || null,
					row.description || null,
					row.short_description || row.description || null,
					row.specs || null,
					row.features || null,
					row.price_range || null,
					toBool(row.is_featured),
					image,
					mainImage,
					price,
					listPrice,
					toNumber(row.amount),
					row.tracking || null,
					row.exceptions_type || null,
					mainCategoryId,
					subcategoryId,
					toNumber(row.sort_order),
				],
			);
		}

		const productId = result.rows[0].id;
		productMap.set(Number(row.id), productId);

		if (!mainCategoryId && row.category) {
			const segments = String(row.category)
				.split(/->|\/|>/)
				.map((part) => part.trim())
				.filter(Boolean);
			const mainId = await getOrCreateMainCategoryId(segments[0]);
			const subId = segments.length > 1
				? await getOrCreateSubcategoryId(mainId, segments[segments.length - 1])
				: null;
			await query(
				"update products set main_category_id = $1, subcategory_id = $2, category = $3 where id = $4",
				[mainId, subId, segments[segments.length - 1] || segments[0], productId],
			);
		}

		count += 1;
	}

	const imageRows = await readRows(mysql, "product_images");
	for (const row of imageRows) {
		const productId = productMap.get(Number(row.product_id));
		const imagePath = await copyProductUpload(row.image_path || row.image);
		if (!productId || !imagePath) continue;
		const existing = await query(
			"select id from product_images where product_id = $1 and image_path = $2 limit 1",
			[productId, imagePath],
		);
		if (existing.rows[0]) {
			await query(
				"update product_images set is_main = $1, position = $2, updated_at = now() where id = $3",
				[toBool(row.is_main), toNumber(row.position), existing.rows[0].id],
			);
			continue;
		}
		await query(
			`insert into product_images (product_id, image_path, is_main, position, created_at, updated_at)
			 values ($1, $2, $3, $4, now(), now())`,
			[productId, imagePath, toBool(row.is_main), toNumber(row.position)],
		);
	}

	return { count, productMap };
}

function normalizeProductTypes(...values) {
	const out = [];
	for (const value of values) {
		if (Array.isArray(value)) {
			out.push(...normalizeProductTypes(...value));
			continue;
		}
		const raw = cleanText(value);
		if (!raw) continue;
		if (raw.startsWith("[") && raw.endsWith("]")) {
			try {
				out.push(...normalizeProductTypes(...JSON.parse(raw)));
				continue;
			} catch {
				// Fall through to delimiter parsing.
			}
		}
		for (const part of raw.split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean)) {
			if (!out.some((item) => item.toLowerCase() === part.toLowerCase())) out.push(part);
		}
	}
	return out;
}

async function migrateWebProjects(mysql, productMap) {
	const rows = await readRows(mysql, "projects");
	for (const row of rows) {
		const productTypes = normalizeProductTypes(row.product_types, row.product_type);
		await query(
			`insert into web_projects
			   (id, title, category, product_id, product_type, product_types, business_type, business_type_sq,
			    power_kw, location, description, tags, image, video, sort_order, created_at, updated_at)
			 values
			   ($1, $2, $3, $4, $5, $6::jsonb, $7, $8,
			    $9, $10, $11, $12, $13, $14, $15, coalesce($16::timestamptz, now()), coalesce($17::timestamptz, now()))
			 on conflict (id) do update set
			   title = excluded.title,
			   category = excluded.category,
			   product_id = excluded.product_id,
			   product_type = excluded.product_type,
			   product_types = excluded.product_types,
			   business_type = excluded.business_type,
			   business_type_sq = excluded.business_type_sq,
			   power_kw = excluded.power_kw,
			   location = excluded.location,
			   description = excluded.description,
			   tags = excluded.tags,
			   image = excluded.image,
			   video = excluded.video,
			   sort_order = excluded.sort_order,
			   updated_at = excluded.updated_at`,
			[
				row.id,
				row.title,
				row.category || "Albania",
				productMap.get(Number(row.product_id)) || null,
				productTypes[0] || row.product_type || null,
				JSON.stringify(productTypes),
				row.business_type || null,
				row.business_type_sq || null,
				row.power_kw || null,
				row.location || null,
				row.description || null,
				row.tags || null,
				await copyUpload(row.image),
				await copyUpload(row.video),
				toNumber(row.sort_order),
				row.created_at || null,
				row.updated_at || null,
			],
		);
	}

	const galleryRows = await readRows(mysql, "project_gallery");
	for (const row of galleryRows) {
		await query(
			`insert into web_project_gallery (id, project_id, image, sort_order, created_at)
			 values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
			 on conflict (id) do update set
			   project_id = excluded.project_id,
			   image = excluded.image,
			   sort_order = excluded.sort_order`,
			[
				row.id,
				row.project_id,
				await copyUpload(row.image),
				toNumber(row.sort_order),
				row.created_at || null,
			],
		);
	}

	if (rows.length) await resetSequence("web_projects");
	if (galleryRows.length) await resetSequence("web_project_gallery");
	return { projects: rows.length, gallery: galleryRows.length };
}

async function migrateWebNews(mysql) {
	const rows = await readRows(mysql, "news", "created_at desc");
	for (const row of rows) {
		await query(
			`insert into web_news (id, title, content, excerpt, image, created_at, updated_at)
			 values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), coalesce($7::timestamptz, now()))
			 on conflict (id) do update set
			   title = excluded.title,
			   content = excluded.content,
			   excerpt = excluded.excerpt,
			   image = excluded.image,
			   updated_at = excluded.updated_at`,
			[
				row.id,
				row.title,
				row.content || null,
				row.excerpt || null,
				await copyUpload(row.image),
				row.created_at || null,
				row.updated_at || null,
			],
		);
	}
	if (rows.length) await resetSequence("web_news");
	return rows.length;
}

async function migrateSimpleContent(mysql, table, fields, fileFields = []) {
	const rows = await readRows(mysql, table);
	for (const row of rows) {
		const data = { id: row.id };
		for (const field of fields) data[field] = row[field] ?? null;
		for (const field of fileFields) data[field] = await copyUpload(row[field]);
		if ("sort_order" in row) data.sort_order = toNumber(row.sort_order);
		if ("created_at" in row) data.created_at = row.created_at || null;
		if ("updated_at" in row) data.updated_at = row.updated_at || null;

		const entries = Object.entries(data);
		const columns = entries.map(([key]) => key);
		const updateColumns = columns.filter((column) => column !== "id" && column !== "created_at");
		await query(
			`insert into ${table} (${columns.join(", ")})
			 values (${entries.map(([, value], index) =>
				 value instanceof Date || String(columns[index]).endsWith("_at")
					 ? `coalesce($${index + 1}::timestamptz, now())`
					 : `$${index + 1}`
			 ).join(", ")})
			 on conflict (id) do update set
			   ${updateColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
			entries.map(([, value]) => value),
		);
	}
	if (rows.length) await resetSequence(table);
	return rows.length;
}

async function migrateSettings(mysql) {
	const rows = await readRows(mysql, "settings", "setting_key asc");
	for (const row of rows) {
		await query(
			`insert into settings (setting_key, setting_value)
			 values ($1, $2)
			 on conflict (setting_key) do update set setting_value = excluded.setting_value`,
			[row.setting_key, row.setting_value ?? ""],
		);
		for (const maybeFile of String(row.setting_value || "").split(/\r?\n/)) {
			await copyUpload(maybeFile);
		}
	}
	return rows.length;
}

async function main() {
	const oldEnv = await readOldEnv();
	const oldRequire = createRequire(path.join(oldServerRoot, "package.json"));
	const mysql = oldRequire("mysql2/promise");
	const mysqlPool = mysql.createPool({
		host: process.env.WEB_MYSQL_HOST || oldEnv.DB_HOST || "localhost",
		port: toNumber(process.env.WEB_MYSQL_PORT || oldEnv.DB_PORT, 3306),
		user: process.env.WEB_MYSQL_USER || oldEnv.DB_USER || "root",
		password: process.env.WEB_MYSQL_PASSWORD ?? oldEnv.DB_PASSWORD ?? "",
		database: process.env.WEB_MYSQL_DATABASE || oldEnv.DB_NAME || "greeprofessional",
		waitForConnections: true,
		connectionLimit: 4,
	});

	try {
		await fs.mkdir(targetUploadsRoot, { recursive: true });
		const users = await migrateUsers(mysqlPool);
		const { count: mainCategories, categoryMap } =
			await migrateMainCategories(mysqlPool);
		const { count: subcategories, subcategoryMap } =
			await migrateSubcategories(mysqlPool, categoryMap);
		const { count: products, productMap } = await migrateProducts(
			mysqlPool,
			categoryMap,
			subcategoryMap,
		);
		const projects = await migrateWebProjects(mysqlPool, productMap);
		const news = await migrateWebNews(mysqlPool);
		const services = await migrateSimpleContent(
			mysqlPool,
			"services",
			["title", "title_sq", "description", "description_sq"],
			["icon"],
		);
		const certificates = await migrateSimpleContent(
			mysqlPool,
			"certificates",
			["name"],
			["image"],
		);
		const showroom = await migrateSimpleContent(
			mysqlPool,
			"showroom",
			["caption"],
			["image"],
		);
		const settings = await migrateSettings(mysqlPool);
		const contactMessages = await migrateSimpleContent(
			mysqlPool,
			"contact_messages",
			["name", "email", "phone", "subject", "message", "is_read"],
		);
		const professionals = await migrateSimpleContent(
			mysqlPool,
			"professionals",
			["full_name", "email", "phone", "company", "profession", "city", "message"],
		);

		console.log("Website content migrated to PostgreSQL.");
		console.table({
			users,
			mainCategories,
			subcategories,
			products,
			webProjects: projects.projects,
			webProjectGallery: projects.gallery,
			webNews: news,
			services,
			certificates,
			showroom,
			settings,
			contactMessages,
			professionals,
		});
	} finally {
		await mysqlPool.end();
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
