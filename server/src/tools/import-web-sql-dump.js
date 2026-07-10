import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query, transaction } from "../db/pool.js";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..", "..");
const workspaceRoot = path.resolve(serverRoot, "..", "..", "..");
const dumpPath = path.resolve(
	process.env.WEB_SQL_DUMP_PATH ||
		"C:\\Users\\defri\\Downloads\\greeprofessional.sql",
);
const oldUploadsRoot = path.resolve(
	process.env.WEB_MYSQL_UPLOADS_ROOT ||
		path.join(workspaceRoot, "GreeProfessional", "server", "uploads"),
);
const targetUploadsRoot = path.join(serverRoot, config.uploadDir);

const contentTables = [
	"certificates",
	"contact_messages",
	"main_categories",
	"news",
	"products",
	"product_images",
	"professionals",
	"projects",
	"project_gallery",
	"services",
	"settings",
	"showroom",
	"subcategories",
	"users",
	"usergroups",
];

function unescapeSqlString(value) {
	return value
		.replace(/\\0/g, "\0")
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(/\\b/g, "\b")
		.replace(/\\Z/g, "\u001a")
		.replace(/\\'/g, "'")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");
}

function parseValue(raw) {
	const value = raw.trim();
	if (/^null$/i.test(value)) return null;
	if (value.startsWith("'") && value.endsWith("'")) {
		return unescapeSqlString(value.slice(1, -1));
	}
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	return value;
}

function splitRow(row) {
	const values = [];
	let current = "";
	let inQuote = false;
	let escaping = false;

	for (const char of row) {
		if (escaping) {
			current += `\\${char}`;
			escaping = false;
			continue;
		}
		if (inQuote && char === "\\") {
			escaping = true;
			continue;
		}
		if (char === "'") {
			inQuote = !inQuote;
			current += char;
			continue;
		}
		if (!inQuote && char === ",") {
			values.push(parseValue(current));
			current = "";
			continue;
		}
		current += char;
	}
	values.push(parseValue(current));
	return values;
}

function extractRows(valuesSql) {
	const rows = [];
	let inQuote = false;
	let escaping = false;
	let depth = 0;
	let current = "";

	for (const char of valuesSql) {
		if (escaping) {
			current += `\\${char}`;
			escaping = false;
			continue;
		}
		if (inQuote && char === "\\") {
			escaping = true;
			continue;
		}
		if (char === "'") {
			inQuote = !inQuote;
			if (depth > 0) current += char;
			continue;
		}
		if (!inQuote && char === "(") {
			if (depth === 0) {
				current = "";
			} else {
				current += char;
			}
			depth += 1;
			continue;
		}
		if (!inQuote && char === ")") {
			depth -= 1;
			if (depth === 0) {
				rows.push(splitRow(current));
			} else {
				current += char;
			}
			continue;
		}
		if (depth > 0) current += char;
	}

	return rows;
}

function parseInserts(sql) {
	const tables = new Map();
	const insertRegex =
		/INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*([\s\S]*?);/g;
	let match;

	while ((match = insertRegex.exec(sql))) {
		const [, table, columnSql, valuesSql] = match;
		if (!contentTables.includes(table)) continue;
		const columns = columnSql
			.split(",")
			.map((column) => column.trim().replace(/^`|`$/g, ""));
		const rows = extractRows(valuesSql).map((values) =>
			Object.fromEntries(columns.map((column, index) => [column, values[index]])),
		);
		tables.set(table, [...(tables.get(table) || []), ...rows]);
	}

	return tables;
}

function bool(value) {
	return value === true || value === 1 || value === "1";
}

function number(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function nullable(value) {
	if (value === undefined || value === null) return null;
	const text = String(value);
	return text.length ? text : null;
}

function uploadName(value) {
	if (!value) return null;
	return String(value).replace(/^\/?uploads[\\/]/i, "").replace(/\\/g, "/");
}

function productUploadPath(value) {
	const name = uploadName(value);
	return name ? `/uploads/${name}` : null;
}

async function copyUpload(value) {
	const name = uploadName(value);
	if (!name) return null;
	const source = path.join(oldUploadsRoot, name);
	const target = path.join(targetUploadsRoot, name);
	try {
		await fs.access(source);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.copyFile(source, target);
	} catch {
		// Keep DB references even when the source file is not present locally.
	}
	return name;
}

async function copyProductUpload(value) {
	const name = await copyUpload(value);
	return name ? `/uploads/${name}` : null;
}

async function setSequence(client, table) {
	await client.query(
		`select setval(pg_get_serial_sequence($1, 'id'), coalesce((select max(id) from ${table}), 1), true)`,
		[table],
	);
}

function normalizeProductTypes(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value.flatMap(normalizeProductTypes);
	const raw = String(value).trim();
	if (!raw) return [];
	if (raw.startsWith("[") && raw.endsWith("]")) {
		try {
			return normalizeProductTypes(JSON.parse(raw));
		} catch {
			// Fall through to split parsing.
		}
	}
	return raw
		.split(/\r?\n|,|;/)
		.map((item) => item.trim())
		.filter(Boolean);
}

async function roleId(client, name) {
	const result = await client.query(
		"select id from roles where name = $1 limit 1",
		[name],
	);
	return result.rows[0]?.id ?? null;
}

async function importUsers(client, rows) {
	const adminRoleId = await roleId(client, "admin");
	let count = 0;
	for (const row of rows) {
		if (!row.email || !row.password) continue;
		await client.query(
			`insert into users (name, email, password, role_id, created_at, updated_at)
			 values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), now())
			 on conflict (email) do update set
			   name = excluded.name,
			   password = excluded.password,
			   role_id = excluded.role_id,
			   updated_at = now()`,
			[row.name || row.email, row.email, row.password, adminRoleId, row.created_at],
		);
		count += 1;
	}
	return count;
}

async function clearDumpContent(client, tables) {
	const mainCategoryIds = (tables.get("main_categories") || []).map((row) =>
		Number(row.id),
	);
	const mainCategoryNames = (tables.get("main_categories") || [])
		.map((row) => row.name)
		.filter(Boolean);
	const subcategoryIds = (tables.get("subcategories") || []).map((row) =>
		Number(row.id),
	);
	const subcategoryNames = (tables.get("subcategories") || [])
		.map((row) => row.name)
		.filter(Boolean);
	const productIds = (tables.get("products") || []).map((row) => Number(row.id));
	const productSkus = (tables.get("products") || []).map(
		(row) => row.product_code || `WEB-${row.id}`,
	);
	const productNames = (tables.get("products") || [])
		.map((row) => row.name)
		.filter(Boolean);

	await client.query("delete from web_project_gallery");
	await client.query("delete from web_projects");
	await client.query("delete from web_news");
	await client.query("delete from services");
	await client.query("delete from certificates");
	await client.query("delete from showroom");
	await client.query("delete from contact_messages");
	await client.query("delete from professionals");
	await client.query("delete from settings");

	if (productNames.length) {
		await client.query(
			`update products
			 set deleted_at = now(),
			     sku = sku || '-old-' || id::text,
			     updated_at = now()
			 where id <> all($1::bigint[])
			   and product_code is null
			   and name = any($2::text[])`,
			[productIds, productNames],
		);
	}
	if (productSkus.length) {
		await client.query(
			`update products
			 set deleted_at = now(),
			     sku = sku || '-old-' || id::text,
			     updated_at = now()
			 where id <> all($1::bigint[])
			   and sku = any($2::text[])`,
			[productIds, productSkus],
		);
	}

	await client.query(
		"delete from product_images where product_id = any($1::bigint[])",
		[productIds],
	);
	await client.query(
		"delete from subcategories where id = any($1::bigint[])",
		[subcategoryIds],
	);
	if (subcategoryNames.length) {
		await client.query(
			"delete from subcategories where id <> all($1::bigint[]) and name = any($2::text[])",
			[subcategoryIds, subcategoryNames],
		);
	}
	await client.query(
		`delete from subcategories sc
		 where id <> all($1::bigint[])
		   and not exists (
		     select 1 from products p
		     where p.deleted_at is null and p.subcategory_id = sc.id
		   )`,
		[subcategoryIds],
	);
	await client.query(
		"delete from main_categories where id = any($1::bigint[])",
		[mainCategoryIds],
	);
	if (mainCategoryNames.length) {
		await client.query(
			"delete from main_categories where id <> all($1::bigint[]) and name = any($2::text[])",
			[mainCategoryIds, mainCategoryNames],
		);
	}
	await client.query(
		`delete from main_categories mc
		 where id <> all($1::bigint[])
		   and not exists (
		     select 1 from products p
		     where p.deleted_at is null and p.main_category_id = mc.id
		   )
		   and not exists (
		     select 1 from subcategories sc where sc.main_category_id = mc.id
		   )`,
		[mainCategoryIds],
	);
}

async function importCategories(client, tables) {
	for (const row of tables.get("main_categories") || []) {
		await client.query(
			`insert into main_categories (id, name, sort_order, created_at, updated_at)
			 values ($1, $2, $3, now(), now())
			 on conflict (id) do update set
			   name = excluded.name,
			   sort_order = excluded.sort_order,
			   updated_at = now()`,
			[row.id, row.name, number(row.sort_order)],
		);
	}

	for (const row of tables.get("subcategories") || []) {
		await client.query(
			`insert into subcategories
			   (id, main_category_id, name, tagline, short_description, is_special, sort_order, is_header, created_at, updated_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
			 on conflict (id) do update set
			   main_category_id = excluded.main_category_id,
			   name = excluded.name,
			   tagline = excluded.tagline,
			   short_description = excluded.short_description,
			   is_special = excluded.is_special,
			   sort_order = excluded.sort_order,
			   is_header = excluded.is_header,
			   updated_at = now()`,
			[
				row.id,
				row.main_category_id,
				row.name,
				nullable(row.tagline),
				nullable(row.short_description),
				bool(row.is_special),
				number(row.sort_order),
				bool(row.is_header),
			],
		);
	}

	await setSequence(client, "main_categories");
	await setSequence(client, "subcategories");
}

async function importProducts(client, tables) {
	for (const row of tables.get("products") || []) {
		const image = await copyProductUpload(row.image);
		const mainImage = await copyProductUpload(row.main_image || row.image);
		await client.query(
			`insert into products
			   (id, name, category, description, specs, features, price_range, image, is_featured,
			    sort_order, created_at, updated_at, product_code, short_description, price, list_price,
			    old_price, amount, stock, tracking, exceptions_type, main_image, main_category_id,
			    subcategory_id, deleted_at, sku)
			 values
			   ($1, $2, $3, $4, $5, $6, $7, $8, $9,
			    $10, coalesce($11::timestamptz, now()), coalesce($12::timestamptz, now()), $13, $14, $15, $16,
			    $16, $17, $17::numeric::integer, $18, $19, $20, $21,
			    $22, null, $23)
			 on conflict (id) do update set
			   name = excluded.name,
			   category = excluded.category,
			   description = excluded.description,
			   specs = excluded.specs,
			   features = excluded.features,
			   price_range = excluded.price_range,
			   image = excluded.image,
			   is_featured = excluded.is_featured,
			   sort_order = excluded.sort_order,
			   updated_at = excluded.updated_at,
			   product_code = excluded.product_code,
			   short_description = excluded.short_description,
			   price = excluded.price,
			   list_price = excluded.list_price,
			   old_price = excluded.old_price,
			   amount = excluded.amount,
			   stock = excluded.stock,
			   tracking = excluded.tracking,
			   exceptions_type = excluded.exceptions_type,
			   main_image = excluded.main_image,
			   main_category_id = excluded.main_category_id,
			   subcategory_id = excluded.subcategory_id,
			   deleted_at = null,
			   sku = excluded.sku`,
			[
				row.id,
				row.name,
				row.category,
				nullable(row.description),
				nullable(row.specs),
				nullable(row.features),
				nullable(row.price_range),
				image,
				bool(row.is_featured),
				number(row.sort_order),
				row.created_at,
				row.updated_at,
				nullable(row.product_code),
				nullable(row.short_description),
				number(row.price),
				number(row.list_price),
				number(row.amount),
				nullable(row.tracking),
				nullable(row.exceptions_type),
				mainImage,
				row.main_category_id,
				row.subcategory_id,
				row.product_code || `WEB-${row.id}`,
			],
		);
	}

	for (const row of tables.get("product_images") || []) {
		await client.query(
			`insert into product_images (id, product_id, image_path, is_main, position, created_at, updated_at)
			 values ($1, $2, $3, $4, $5, now(), now())
			 on conflict (id) do update set
			   product_id = excluded.product_id,
			   image_path = excluded.image_path,
			   is_main = excluded.is_main,
			   position = excluded.position,
			   updated_at = now()`,
			[
				row.id,
				row.product_id,
				await copyProductUpload(row.image_path),
				bool(row.is_main),
				number(row.position),
			],
		);
	}

	await setSequence(client, "products");
	await setSequence(client, "product_images");
}

async function importProjects(client, tables) {
	for (const row of tables.get("projects") || []) {
		const productTypes = normalizeProductTypes(row.product_types || row.product_type);
		await client.query(
			`insert into web_projects
			   (id, title, category, power_kw, location, description, tags, image, video, sort_order,
			    created_at, updated_at, product_type, business_type, product_id, business_type_sq, product_types)
			 values
			   ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			    coalesce($11::timestamptz, now()), coalesce($12::timestamptz, now()), $13, $14, $15, $16, $17::jsonb)
			 on conflict (id) do update set
			   title = excluded.title,
			   category = excluded.category,
			   power_kw = excluded.power_kw,
			   location = excluded.location,
			   description = excluded.description,
			   tags = excluded.tags,
			   image = excluded.image,
			   video = excluded.video,
			   sort_order = excluded.sort_order,
			   updated_at = excluded.updated_at,
			   product_type = excluded.product_type,
			   business_type = excluded.business_type,
			   product_id = excluded.product_id,
			   business_type_sq = excluded.business_type_sq,
			   product_types = excluded.product_types`,
			[
				row.id,
				row.title,
				row.category,
				nullable(row.power_kw),
				nullable(row.location),
				nullable(row.description),
				nullable(row.tags),
				await copyUpload(row.image),
				await copyUpload(row.video),
				number(row.sort_order),
				row.created_at,
				row.updated_at,
				nullable(row.product_type),
				nullable(row.business_type),
				row.product_id,
				nullable(row.business_type_sq),
				JSON.stringify(productTypes),
			],
		);
	}

	for (const row of tables.get("project_gallery") || []) {
		await client.query(
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
				number(row.sort_order),
				row.created_at,
			],
		);
	}

	await setSequence(client, "web_projects");
	await setSequence(client, "web_project_gallery");
}

async function importNews(client, rows) {
	for (const row of rows) {
		await client.query(
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
				nullable(row.content),
				nullable(row.excerpt),
				await copyUpload(row.image),
				row.created_at,
				row.updated_at,
			],
		);
	}
	await setSequence(client, "web_news");
}

async function importSimpleContent(client, table, rows, fields, fileFields = []) {
	for (const row of rows) {
		const values = { id: row.id };
		for (const field of fields) values[field] = row[field] ?? null;
		for (const field of fileFields) values[field] = await copyUpload(row[field]);
		if ("sort_order" in row) values.sort_order = number(row.sort_order);
		if ("created_at" in row) values.created_at = row.created_at;
		if ("updated_at" in row) values.updated_at = row.updated_at;

		const entries = Object.entries(values);
		const columns = entries.map(([key]) => key);
		const updateColumns = columns.filter(
			(column) => column !== "id" && column !== "created_at",
		);
		await client.query(
			`insert into ${table} (${columns.join(", ")})
			 values (${columns
					.map((column, index) =>
						column.endsWith("_at")
							? `coalesce($${index + 1}::timestamptz, now())`
							: `$${index + 1}`,
					)
					.join(", ")})
			 on conflict (id) do update set
			   ${updateColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
			entries.map(([, value]) => value),
		);
	}
	await setSequence(client, table);
}

async function importSettings(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into settings (id, setting_key, setting_value)
			 values ($1, $2, $3)
			 on conflict (setting_key) do update set
			   setting_value = excluded.setting_value`,
			[row.id, row.setting_key, row.setting_value ?? ""],
		);
		for (const item of String(row.setting_value || "").split(/\r?\n/)) {
			await copyUpload(item);
		}
	}
	await setSequence(client, "settings");
}

async function importUserGroups(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into user_groups (id, name, created_at, updated_at)
			 values ($1, $2, now(), now())
			 on conflict (id) do update set name = excluded.name, updated_at = now()`,
			[row.id, row.usergroup_name || row.name],
		);
	}
	await setSequence(client, "user_groups");
}

async function main() {
	const sql = await fs.readFile(dumpPath, "utf8");
	const tables = parseInserts(sql);
	await fs.mkdir(targetUploadsRoot, { recursive: true });

	const counts = await transaction(async (client) => {
		await clearDumpContent(client, tables);
		await importCategories(client, tables);
		await importProducts(client, tables);
		await importProjects(client, tables);
		await importNews(client, tables.get("news") || []);
		await importSimpleContent(
			client,
			"services",
			tables.get("services") || [],
			["title", "title_sq", "description", "description_sq"],
			["icon"],
		);
		await importSimpleContent(
			client,
			"certificates",
			tables.get("certificates") || [],
			["name"],
			["image"],
		);
		await importSimpleContent(
			client,
			"showroom",
			tables.get("showroom") || [],
			["caption"],
			["image"],
		);
		await importSettings(client, tables.get("settings") || []);
		await importSimpleContent(
			client,
			"contact_messages",
			tables.get("contact_messages") || [],
			["name", "email", "phone", "subject", "message", "is_read"],
		);
		await importSimpleContent(
			client,
			"professionals",
			tables.get("professionals") || [],
			["full_name", "email", "phone", "company", "profession", "city", "message"],
		);
		await importUserGroups(client, tables.get("usergroups") || []);
		const users = await importUsers(client, tables.get("users") || []);

		return {
			users,
			mainCategories: (tables.get("main_categories") || []).length,
			subcategories: (tables.get("subcategories") || []).length,
			products: (tables.get("products") || []).length,
			productImages: (tables.get("product_images") || []).length,
			webProjects: (tables.get("projects") || []).length,
			webProjectGallery: (tables.get("project_gallery") || []).length,
			webNews: (tables.get("news") || []).length,
			services: (tables.get("services") || []).length,
			certificates: (tables.get("certificates") || []).length,
			showroom: (tables.get("showroom") || []).length,
			settings: (tables.get("settings") || []).length,
			contactMessages: (tables.get("contact_messages") || []).length,
			professionals: (tables.get("professionals") || []).length,
			userGroups: (tables.get("usergroups") || []).length,
		};
	});

	console.log(`Imported dump: ${dumpPath}`);
	console.table(counts);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => pool.end());
