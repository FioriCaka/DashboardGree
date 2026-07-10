import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { authRequired, requireRoles, signToken, sanitizeUser } from "../auth.js";
import { config } from "../config.js";
import { query, transaction } from "../db/pool.js";
import { HttpError, notFound } from "../http/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, "..", "..", config.uploadDir);
const router = Router();
const adminOnly = [authRequired, requireRoles("admin", "menaxher")];

const upload = multer({
	storage: multer.diskStorage({
		destination: async (_req, _file, cb) => {
			await fs.mkdir(uploadsRoot, { recursive: true });
			cb(null, uploadsRoot);
		},
		filename: (_req, file, cb) => {
			const ext = path.extname(file.originalname).toLowerCase();
			cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
		},
	}),
	limits: { fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 300) * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ||
			/^video\/(mp4|quicktime|x-msvideo)$/.test(file.mimetype);
		cb(ok ? null : new Error("Only images and videos are allowed"), ok);
	},
});

function bool(value) {
	return value === true || value === "true" || value === "1" || value === 1;
}

function numberOrNull(value) {
	if (value === "" || value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function assetPath(file) {
	return file?.filename || null;
}

function productAssetPath(file) {
	return file?.filename ? `/uploads/${file.filename}` : null;
}

function splitCategoryPath(rawValue) {
	return String(rawValue || "")
		.split(/->|\/|>/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function normalizeProductTypes(...values) {
	const out = [];
	for (const value of values.flat()) {
		if (Array.isArray(value)) {
			out.push(...normalizeProductTypes(value));
			continue;
		}
		const raw = String(value || "").trim();
		if (!raw) continue;
		if (raw.startsWith("[") && raw.endsWith("]")) {
			try {
				out.push(...normalizeProductTypes(JSON.parse(raw)));
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

function formatPriceRange(price, listPrice, currentValue) {
	if (typeof currentValue === "string" && currentValue.trim()) return currentValue.trim();
	const sale = Number(price || 0);
	const regular = Number(listPrice || 0);
	if (sale > 0 && regular > sale) return `${sale.toFixed(2)} - ${regular.toFixed(2)}`;
	if (sale > 0) return sale.toFixed(2);
	if (regular > 0) return regular.toFixed(2);
	return null;
}

async function getOrCreateMainCategoryId(name) {
	const normalized = String(name || "").trim().replace(/\s+/g, " ");
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
	const normalized = String(name || "").trim().replace(/\s+/g, " ");
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

async function assignCategoryPath(productId, rawCategory) {
	const segments = splitCategoryPath(rawCategory);
	if (!segments.length) {
		await query(
			"update products set main_category_id = null, subcategory_id = null, category = null where id = $1",
			[productId],
		);
		return;
	}
	const mainName = segments[0];
	const subName = segments.length > 1 ? segments[segments.length - 1] : null;
	const mainCategoryId = await getOrCreateMainCategoryId(mainName);
	const subcategoryId = subName ? await getOrCreateSubcategoryId(mainCategoryId, subName) : null;
	await query(
		`update products
		 set main_category_id = $1, subcategory_id = $2, category = $3
		 where id = $4`,
		[mainCategoryId, subcategoryId, subName || mainName, productId],
	);
}

const productSelect = `
	select p.*,
		mc.name as main_category_name,
		sc.name as subcategory_name,
		coalesce(
			(select pi.image_path from product_images pi where pi.product_id = p.id and pi.is_main = true limit 1),
			(select pi.image_path from product_images pi where pi.product_id = p.id order by pi.position, pi.id limit 1),
			p.main_image,
			p.image
		) as display_image,
		(select count(*)::int from product_images pi where pi.product_id = p.id) as image_count
	from products p
	left join subcategories sc on sc.id = p.subcategory_id
	left join main_categories mc on mc.id = coalesce(p.main_category_id, sc.main_category_id)
`;

function mapProduct(row) {
	const category = row.subcategory_name || row.main_category_name || row.category || "Imported";
	const pathNames = [row.main_category_name, row.subcategory_name].filter(Boolean);
	return {
		...row,
		category,
		main_category: row.main_category_name || category,
		subcategory: row.subcategory_name || null,
		category_path: pathNames,
		category_path_label: pathNames.join(" -> ") || category,
		image: row.display_image || row.image || row.main_image || null,
		imported: Boolean(row.product_code),
		is_featured: Boolean(row.is_featured),
	};
}

async function addProductImages(productId, primaryImage, galleryImages = []) {
	const images = [primaryImage, ...galleryImages].filter(Boolean);
	if (!images.length) return;
	await query("update product_images set is_main = false where product_id = $1", [productId]);
	for (let index = 0; index < images.length; index += 1) {
		const image = images[index];
		const existing = await query(
			"select id from product_images where product_id = $1 and image_path = $2 limit 1",
			[productId, image],
		);
		if (existing.rows[0]) {
			await query(
				"update product_images set is_main = $1, position = $2, updated_at = now() where id = $3",
				[index === 0, index, existing.rows[0].id],
			);
			continue;
		}
		await query(
			`insert into product_images (product_id, image_path, is_main, position)
			 values ($1, $2, $3, $4)
			 `,
			[productId, image, index === 0, index],
		);
	}
}

router.post("/auth/login", async (req, res, next) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) throw new HttpError(400, "Email and password required");
		const result = await query(
			`select users.*, roles.name as role, 'user' as type
			 from users
			 left join roles on roles.id = users.role_id
			 where users.email = $1 and users.deleted_at is null
			 limit 1`,
			[email],
		);
		const user = result.rows[0];
		if (!user || !(await bcrypt.compare(password, user.password ?? ""))) {
			throw new HttpError(401, "Invalid credentials");
		}
		res.json({ token: signToken(user), user: sanitizeUser(user) });
	} catch (error) {
		next(error);
	}
});

router.get("/auth/me", authRequired, (req, res) => {
	res.json({
		id: req.user.id,
		email: req.user.email,
		name: req.user.name,
		role: req.user.role,
	});
});

router.post("/auth/create-admin", authRequired, requireRoles("admin"), async (req, res, next) => {
	try {
		const { name, email, password } = req.body;
		if (!name || !email || !password) throw new HttpError(400, "All fields required");
		const role = await query("select id from roles where name = 'admin' limit 1");
		const passwordHash = await bcrypt.hash(password, 10);
		await query(
			`insert into users (name, email, password, role_id)
			 values ($1, $2, $3, $4)`,
			[name, email, passwordHash, role.rows[0]?.id ?? null],
		);
		res.json({ message: "Admin created" });
	} catch (error) {
		next(error);
	}
});

router.get("/web/products", async (req, res, next) => {
	try {
		const params = [];
		const where = ["p.deleted_at is null"];
		if (req.query.category) {
			params.push(String(req.query.category));
			where.push("coalesce(sc.name, mc.name, p.category) = $" + params.length);
		}
		const result = await query(
			`${productSelect}
			 where ${where.join(" and ")}
			 order by p.sort_order asc, p.created_at desc`,
			params,
		);
		let rows = result.rows.map(mapProduct);
		if (req.query.main_category) {
			const value = String(req.query.main_category).toUpperCase();
			rows = rows.filter((row) => String(row.main_category || "").toUpperCase() === value);
		}
		if (req.query.subcategory) {
			const value = String(req.query.subcategory).toUpperCase();
			rows = rows.filter((row) => String(row.subcategory || row.category || "").toUpperCase() === value);
		}
		res.json(rows);
	} catch (error) {
		next(error);
	}
});

router.get("/web/products/categories", async (_req, res, next) => {
	try {
		const result = await query(
			`${productSelect}
			 where p.deleted_at is null
			 order by coalesce(sc.name, mc.name, p.category) asc`,
		);
		res.json([...new Set(result.rows.map((row) => mapProduct(row).category).filter(Boolean))]);
	} catch (error) {
		next(error);
	}
});

router.get("/web/products/category-tree", async (req, res, next) => {
	try {
		const includeEmpty = String(req.query.includeEmpty || "") === "1";
		const [mainRows, subRows, countsRows] = await Promise.all([
			query("select id, name, sort_order from main_categories order by sort_order asc, id asc"),
			query("select id, name, main_category_id, tagline, short_description, is_special, is_header, sort_order from subcategories order by sort_order asc, id asc"),
			query(
				`select main_category_id, subcategory_id, count(*)::int as total
				 from products
				 where deleted_at is null
				 group by main_category_id, subcategory_id`,
			),
		]);
		const mainCounts = new Map();
		const subCounts = new Map();
		for (const row of countsRows.rows) {
			if (row.main_category_id) mainCounts.set(Number(row.main_category_id), (mainCounts.get(Number(row.main_category_id)) || 0) + row.total);
			if (row.subcategory_id) subCounts.set(Number(row.subcategory_id), (subCounts.get(Number(row.subcategory_id)) || 0) + row.total);
		}
		const nodes = new Map(mainRows.rows.map((row) => [
			Number(row.id),
			{
				id: Number(row.id),
				name: row.name,
				sort_order: Number(row.sort_order || 0),
				parent_id: 0,
				type: "main",
				product_count: mainCounts.get(Number(row.id)) || 0,
				children: [],
			},
		]));
		for (const row of subRows.rows) {
			const mainId = Number(row.main_category_id || 0);
			if (!nodes.has(mainId)) continue;
			const child = {
				id: Number(row.id),
				name: row.name,
				parent_id: mainId,
				main_category_id: mainId,
				type: "sub",
				tagline: row.tagline || null,
				short_description: row.short_description || null,
				is_special: Boolean(row.is_special),
				is_header: Boolean(row.is_header),
				sort_order: Number(row.sort_order || 0),
				product_count: subCounts.get(Number(row.id)) || 0,
				children: [],
			};
			if (includeEmpty || child.product_count > 0) nodes.get(mainId).children.push(child);
		}
		res.json([...nodes.values()].filter((node) => includeEmpty || node.product_count > 0 || node.children.length));
	} catch (error) {
		next(error);
	}
});

router.get("/web/products/:id", async (req, res, next) => {
	try {
		const [base, images, prices, options, features] = await Promise.all([
			query(`${productSelect} where p.id = $1 and p.deleted_at is null`, [req.params.id]),
			query("select id, image_path, is_main, position, image_path as image from product_images where product_id = $1 order by is_main desc, position asc, id asc", [req.params.id]),
			query("select pp.usergroup_id, pp.lower_limit, pp.price, ug.name as usergroup_name from product_prices pp left join user_groups ug on ug.id = pp.usergroup_id where pp.product_id = $1 order by pp.lower_limit asc", [req.params.id]),
			query("select po.id, o.name as option_name, po.variant_id, ov.name as variant_name from product_options po join options o on o.id = po.option_id join option_variants ov on ov.id = po.variant_id where po.product_id = $1 order by o.name, ov.name", [req.params.id]),
			query("select pfv.id, f.name as feature_name, pfv.variant_id, fv.name as variant_name from product_feature_values pfv join features f on f.id = pfv.feature_id join feature_variants fv on fv.id = pfv.variant_id where pfv.product_id = $1 order by f.name, fv.name", [req.params.id]),
		]);
		if (!base.rows[0]) throw notFound();
		res.json({ ...mapProduct(base.rows[0]), images: images.rows, prices: prices.rows, options: options.rows, feature_values: features.rows });
	} catch (error) {
		next(error);
	}
});

router.post("/web/products/categories", ...adminOnly, async (req, res, next) => {
	try {
		const name = String(req.body?.name || "").trim();
		const parentId = numberOrNull(req.body?.parent_id);
		if (!name) throw new HttpError(400, "Category name is required");
		if (parentId) {
			const result = await query(
				`insert into subcategories (main_category_id, name, tagline, short_description, is_special, is_header, sort_order)
				 values ($1, $2, $3, $4, $5, $6, $7)
				 returning *`,
				[parentId, name, req.body.tagline || null, req.body.short_description || null, bool(req.body.is_special), bool(req.body.is_header), Number(req.body.sort_order || 0)],
			);
			return res.json({ message: "Category saved", category: { ...result.rows[0], parent_id: parentId, type: "sub" } });
		}
		const result = await query(
			"insert into main_categories (name, sort_order) values ($1, $2) returning *",
			[name, Number(req.body.sort_order || 0)],
		);
		res.json({ message: "Category saved", category: { ...result.rows[0], parent_id: 0, type: "main" } });
	} catch (error) {
		next(error);
	}
});

router.put("/web/products/categories/:id", ...adminOnly, async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		const name = String(req.body?.name || "").trim();
		const isSub = String(req.body?.type || "").toLowerCase() === "sub";
		if (!id || !name) throw new HttpError(400, "Category id and name are required");
		if (isSub) {
			const mainCategoryId = numberOrNull(req.body.main_category_id);
			await query(
				`update subcategories
				 set name = $1, main_category_id = $2, tagline = $3, short_description = $4,
				     is_special = $5, is_header = $6, sort_order = $7, updated_at = now()
				 where id = $8`,
				[name, mainCategoryId, req.body.tagline || null, req.body.short_description || null, bool(req.body.is_special), bool(req.body.is_header), Number(req.body.sort_order || 0), id],
			);
			await query("update products set category = $1 where subcategory_id = $2", [name, id]);
			return res.json({ message: "Category updated", category: { id, name, parent_id: mainCategoryId, main_category_id: mainCategoryId, type: "sub" } });
		}
		await query("update main_categories set name = $1, sort_order = $2, updated_at = now() where id = $3", [name, Number(req.body.sort_order || 0), id]);
		res.json({ message: "Category updated", category: { id, name, parent_id: 0, type: "main" } });
	} catch (error) {
		next(error);
	}
});

router.delete("/web/products/categories/:id", ...adminOnly, async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		if (String(req.query.type || req.body?.type || "").toLowerCase() === "sub") {
			await query("update products set subcategory_id = null where subcategory_id = $1", [id]);
			await query("delete from subcategories where id = $1", [id]);
			return res.json({ message: "Subcategory deleted", deleted_ids: [id] });
		}
		await transaction(async (client) => {
			await client.query("update products set main_category_id = null, subcategory_id = null where main_category_id = $1", [id]);
			await client.query("delete from subcategories where main_category_id = $1", [id]);
			await client.query("delete from main_categories where id = $1", [id]);
		});
		res.json({ message: "Main category deleted", deleted_ids: [id] });
	} catch (error) {
		next(error);
	}
});

router.post("/web/products", ...adminOnly, upload.fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: 20 }]), async (req, res, next) => {
	try {
		const primaryImage = productAssetPath(req.files?.image?.[0]) || productAssetPath(req.files?.images?.[0]);
		const gallery = (req.files?.images || []).map(productAssetPath).filter(Boolean);
		const price = Number(req.body.price || 0);
		const listPrice = Number(req.body.list_price || 0);
		const result = await query(
			`insert into products
			 (product_code, sku, name, category, description, short_description, specs, features, price_range,
			  is_featured, image, main_image, price, list_price, old_price, amount, tracking, exceptions_type)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $13, $14, $15, $16)
			 returning id`,
			[
				req.body.product_code || null,
				req.body.product_code || req.body.sku || `WEB-${Date.now()}`,
				req.body.name,
				req.body.category || null,
				req.body.description || null,
				req.body.short_description || req.body.description || null,
				req.body.specs || null,
				req.body.features || null,
				formatPriceRange(price, listPrice, req.body.price_range),
				bool(req.body.is_featured),
				primaryImage,
				price,
				listPrice,
				Number(req.body.amount || 0),
				req.body.tracking || "B",
				req.body.exceptions_type || "A",
			],
		);
		if (req.body.category) await assignCategoryPath(result.rows[0].id, req.body.category);
		await addProductImages(result.rows[0].id, primaryImage, gallery);
		res.json({ id: result.rows[0].id, message: "Product created" });
	} catch (error) {
		next(error);
	}
});

router.put("/web/products/:id", ...adminOnly, upload.fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: 20 }]), async (req, res, next) => {
	try {
		const primaryImage = productAssetPath(req.files?.image?.[0]) || productAssetPath(req.files?.images?.[0]);
		const gallery = (req.files?.images || []).map(productAssetPath).filter(Boolean);
		const price = Number(req.body.price || 0);
		const listPrice = Number(req.body.list_price || 0);
		const fields = {
			product_code: req.body.product_code || null,
			sku: req.body.product_code || req.body.sku || `WEB-${req.params.id}`,
			name: req.body.name,
			category: req.body.category || null,
			description: req.body.description || null,
			short_description: req.body.short_description || req.body.description || null,
			specs: req.body.specs || null,
			features: req.body.features || null,
			price_range: formatPriceRange(price, listPrice, req.body.price_range),
			is_featured: bool(req.body.is_featured),
			price,
			list_price: listPrice,
			old_price: listPrice,
			amount: Number(req.body.amount || 0),
			tracking: req.body.tracking || "B",
			exceptions_type: req.body.exceptions_type || "A",
		};
		if (primaryImage) {
			fields.image = primaryImage;
			fields.main_image = primaryImage;
		}
		const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
		await query(
			`update products set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")}, updated_at = now()
			 where id = $${entries.length + 1} and deleted_at is null`,
			[...entries.map(([, value]) => value), req.params.id],
		);
		if (req.body.category) await assignCategoryPath(req.params.id, req.body.category);
		await addProductImages(req.params.id, primaryImage, gallery);
		res.json({ message: "Product updated" });
	} catch (error) {
		next(error);
	}
});

router.delete("/web/products/:id", ...adminOnly, async (req, res, next) => {
	try {
		await query("update products set deleted_at = now(), updated_at = now() where id = $1", [req.params.id]);
		res.json({ message: "Deleted" });
	} catch (error) {
		next(error);
	}
});

const webProjectSelect = `
	select wp.*,
		prod.id as linked_product_id,
		prod.name as linked_product_name,
		prod.product_code as linked_product_code,
		coalesce(sc.name, mc.name, prod.category) as linked_product_category,
		coalesce(prod.main_image, prod.image) as linked_product_image
	from web_projects wp
	left join products prod on prod.id = wp.product_id
	left join subcategories sc on sc.id = prod.subcategory_id
	left join main_categories mc on mc.id = coalesce(prod.main_category_id, sc.main_category_id)
`;

function mapWebProject(row) {
	const productTypes = normalizeProductTypes(row.product_types, row.product_type);
	const displayTypes = productTypes.length ? productTypes : normalizeProductTypes(row.linked_product_category);
	return {
		...row,
		product_types: productTypes,
		product_type: productTypes[0] || row.product_type || null,
		display_product_name: row.linked_product_name || productTypes[0] || null,
		display_product_type: displayTypes[0] || row.linked_product_category || row.linked_product_name || null,
		display_product_types: displayTypes,
		product: row.linked_product_id ? {
			id: row.linked_product_id,
			name: row.linked_product_name,
			product_code: row.linked_product_code,
			category: row.linked_product_category,
			image: row.linked_product_image,
		} : null,
	};
}

router.get("/web/projects", async (req, res, next) => {
	try {
		const params = [];
		const where = [];
		if (req.query.category && req.query.category !== "All") {
			params.push(req.query.category);
			where.push(`wp.category = $${params.length}`);
		}
		if (req.query.business_type && req.query.business_type !== "All") {
			params.push(req.query.business_type);
			where.push(`wp.business_type = $${params.length}`);
		}
		if (req.query.product_id) {
			params.push(req.query.product_id);
			where.push(`wp.product_id = $${params.length}`);
		}
		const result = await query(
			`${webProjectSelect}
			 ${where.length ? `where ${where.join(" and ")}` : ""}
			 order by wp.sort_order asc, wp.created_at desc`,
			params,
		);
		const productType = String(req.query.product_type || "").trim().toUpperCase();
		let rows = result.rows.map(mapWebProject);
		if (productType && productType !== "ALL") {
			rows = rows.filter((row) => row.product_types.some((value) => value.toUpperCase() === productType));
		}
		res.json(rows);
	} catch (error) {
		next(error);
	}
});

router.get("/web/projects/:id", async (req, res, next) => {
	try {
		const [project, gallery] = await Promise.all([
			query(`${webProjectSelect} where wp.id = $1`, [req.params.id]),
			query("select id, image, sort_order from web_project_gallery where project_id = $1 order by sort_order asc, id asc", [req.params.id]),
		]);
		if (!project.rows[0]) throw notFound();
		res.json({ ...mapWebProject(project.rows[0]), gallery: gallery.rows });
	} catch (error) {
		next(error);
	}
});

router.post("/web/projects", ...adminOnly, upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }, { name: "gallery", maxCount: 30 }]), async (req, res, next) => {
	try {
		const productTypes = normalizeProductTypes(req.body.product_types, req.body.product_type);
		if (!productTypes.length || !req.body.business_type) throw new HttpError(400, "Product type and business type are required");
		const result = await query(
			`insert into web_projects
			 (title, category, product_id, product_type, product_types, business_type, business_type_sq, power_kw, location, description, tags, image, video)
			 values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
			 returning id`,
			[
				req.body.title,
				req.body.region || req.body.category || "Albania",
				numberOrNull(req.body.product_id),
				productTypes[0],
				JSON.stringify(productTypes),
				req.body.business_type,
				req.body.business_type_sq || null,
				req.body.power_kw || null,
				req.body.location || null,
				req.body.description || null,
				req.body.tags || null,
				assetPath(req.files?.image?.[0]),
				assetPath(req.files?.video?.[0]),
			],
		);
		const gallery = (req.files?.gallery || []).map(assetPath).filter(Boolean);
		for (let index = 0; index < gallery.length; index += 1) {
			await query("insert into web_project_gallery (project_id, image, sort_order) values ($1, $2, $3)", [result.rows[0].id, gallery[index], index]);
		}
		res.json({ id: result.rows[0].id, message: "Project created" });
	} catch (error) {
		next(error);
	}
});

router.put("/web/projects/:id", ...adminOnly, upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }, { name: "gallery", maxCount: 30 }]), async (req, res, next) => {
	try {
		const productTypes = normalizeProductTypes(req.body.product_types, req.body.product_type);
		if (!productTypes.length || !req.body.business_type) throw new HttpError(400, "Product type and business type are required");
		const fields = {
			title: req.body.title,
			category: req.body.region || req.body.category || "Albania",
			product_id: numberOrNull(req.body.product_id),
			product_type: productTypes[0],
			product_types: JSON.stringify(productTypes),
			business_type: req.body.business_type,
			business_type_sq: req.body.business_type_sq || null,
			power_kw: req.body.power_kw || null,
			location: req.body.location || null,
			description: req.body.description || null,
			tags: req.body.tags || null,
		};
		const image = assetPath(req.files?.image?.[0]);
		const video = assetPath(req.files?.video?.[0]);
		if (image) fields.image = image;
		if (video) fields.video = video;
		const entries = Object.entries(fields);
		await query(
			`update web_projects set ${entries.map(([key], index) => `${key} = $${index + 1}${key === "product_types" ? "::jsonb" : ""}`).join(", ")}, updated_at = now()
			 where id = $${entries.length + 1}`,
			[...entries.map(([, value]) => value), req.params.id],
		);
		const gallery = (req.files?.gallery || []).map(assetPath).filter(Boolean);
		for (let index = 0; index < gallery.length; index += 1) {
			await query(
				"insert into web_project_gallery (project_id, image, sort_order) values ($1, $2, coalesce((select max(sort_order) + 1 from web_project_gallery where project_id = $1), 0) + $3)",
				[req.params.id, gallery[index], index],
			);
		}
		res.json({ message: "Project updated" });
	} catch (error) {
		next(error);
	}
});

router.delete("/web/projects/:id/gallery/:imageId", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from web_project_gallery where id = $1 and project_id = $2", [req.params.imageId, req.params.id]);
		const gallery = await query("select id, image, sort_order from web_project_gallery where project_id = $1 order by sort_order asc, id asc", [req.params.id]);
		res.json({ message: "Gallery image deleted", gallery: gallery.rows });
	} catch (error) {
		next(error);
	}
});

router.put("/web/projects/:id/gallery/:imageId/reorder", ...adminOnly, async (req, res, next) => {
	try {
		const direction = req.body.direction;
		if (!["up", "down"].includes(direction)) throw new HttpError(400, "Invalid direction");
		const current = await query("select id, sort_order from web_project_gallery where id = $1 and project_id = $2", [req.params.imageId, req.params.id]);
		if (!current.rows[0]) throw notFound();
		const target = await query(
			direction === "up"
				? "select id, sort_order from web_project_gallery where project_id = $1 and sort_order < $2 order by sort_order desc, id desc limit 1"
				: "select id, sort_order from web_project_gallery where project_id = $1 and sort_order > $2 order by sort_order asc, id asc limit 1",
			[req.params.id, current.rows[0].sort_order],
		);
		if (target.rows[0]) {
			await query(
				"update web_project_gallery set sort_order = case when id = $1 then $2 when id = $3 then $4 end where id in ($1, $3)",
				[current.rows[0].id, target.rows[0].sort_order, target.rows[0].id, current.rows[0].sort_order],
			);
		}
		const gallery = await query("select id, image, sort_order from web_project_gallery where project_id = $1 order by sort_order asc, id asc", [req.params.id]);
		res.json({ message: target.rows[0] ? "Gallery reordered" : "No reorder needed", gallery: gallery.rows });
	} catch (error) {
		next(error);
	}
});

router.delete("/web/projects/:id", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from web_projects where id = $1", [req.params.id]);
		res.json({ message: "Project deleted" });
	} catch (error) {
		next(error);
	}
});

router.get("/web/news", async (_req, res, next) => {
	try {
		const result = await query("select * from web_news order by created_at desc");
		res.json(result.rows);
	} catch (error) {
		next(error);
	}
});

router.get("/web/news/:id", async (req, res, next) => {
	try {
		const result = await query("select * from web_news where id = $1", [req.params.id]);
		if (!result.rows[0]) throw notFound();
		res.json(result.rows[0]);
	} catch (error) {
		next(error);
	}
});

router.post("/web/news", ...adminOnly, upload.single("image"), async (req, res, next) => {
	try {
		const result = await query(
			"insert into web_news (title, content, excerpt, image) values ($1, $2, $3, $4) returning id",
			[req.body.title, req.body.content || null, req.body.excerpt || null, assetPath(req.file)],
		);
		res.json({ id: result.rows[0].id, message: "News created" });
	} catch (error) {
		next(error);
	}
});

router.put("/web/news/:id", ...adminOnly, upload.single("image"), async (req, res, next) => {
	try {
		const fields = { title: req.body.title, content: req.body.content || null, excerpt: req.body.excerpt || null };
		const image = assetPath(req.file);
		if (image) fields.image = image;
		const entries = Object.entries(fields);
		await query(
			`update web_news set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")}, updated_at = now() where id = $${entries.length + 1}`,
			[...entries.map(([, value]) => value), req.params.id],
		);
		res.json({ message: "News updated" });
	} catch (error) {
		next(error);
	}
});

router.delete("/web/news/:id", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from web_news where id = $1", [req.params.id]);
		res.json({ message: "News deleted" });
	} catch (error) {
		next(error);
	}
});

function simpleCrud({ route, table, fields, fileField, fileColumn, orderBy = "sort_order asc, created_at desc" }) {
	router.get(route, async (_req, res, next) => {
		try {
			const result = await query(`select * from ${table} order by ${orderBy}`);
			res.json(result.rows);
		} catch (error) {
			next(error);
		}
	});
	router.post(route, ...adminOnly, fileField ? upload.single(fileField) : (_req, _res, next) => next(), async (req, res, next) => {
		try {
			const data = Object.fromEntries(fields.map((field) => [field, req.body[field] || null]));
			if (fileColumn) data[fileColumn] = assetPath(req.file);
			const entries = Object.entries(data);
			const result = await query(
				`insert into ${table} (${entries.map(([key]) => key).join(", ")})
				 values (${entries.map((_, index) => `$${index + 1}`).join(", ")})
				 returning id`,
				entries.map(([, value]) => value),
			);
			res.json({ id: result.rows[0].id, message: `${table} created` });
		} catch (error) {
			next(error);
		}
	});
	router.put(`${route}/:id`, ...adminOnly, fileField ? upload.single(fileField) : (_req, _res, next) => next(), async (req, res, next) => {
		try {
			const data = Object.fromEntries(fields.map((field) => [field, req.body[field] || null]));
			if (fileColumn && req.file) data[fileColumn] = assetPath(req.file);
			const entries = Object.entries(data);
			await query(
				`update ${table} set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")}, updated_at = now()
				 where id = $${entries.length + 1}`,
				[...entries.map(([, value]) => value), req.params.id],
			);
			res.json({ message: "Updated" });
		} catch (error) {
			next(error);
		}
	});
	router.delete(`${route}/:id`, ...adminOnly, async (req, res, next) => {
		try {
			await query(`delete from ${table} where id = $1`, [req.params.id]);
			res.json({ message: "Deleted" });
		} catch (error) {
			next(error);
		}
	});
}

simpleCrud({ route: "/services", table: "services", fields: ["title", "title_sq", "description", "description_sq"], fileField: "icon", fileColumn: "icon" });
simpleCrud({ route: "/certificates", table: "certificates", fields: ["name"], fileField: "image", fileColumn: "image" });

router.get("/showroom", async (_req, res, next) => {
	try {
		const [images, video] = await Promise.all([
			query("select * from showroom order by sort_order asc, created_at desc"),
			query("select setting_value from settings where setting_key = 'showroom_video'"),
		]);
		res.json({ images: images.rows, video: video.rows[0]?.setting_value || null });
	} catch (error) {
		next(error);
	}
});

router.post("/showroom/video", ...adminOnly, upload.single("video"), async (req, res, next) => {
	try {
		const video = assetPath(req.file);
		if (!video) throw new HttpError(400, "No video file provided");
		await query(
			"insert into settings (setting_key, setting_value) values ('showroom_video', $1) on conflict (setting_key) do update set setting_value = excluded.setting_value",
			[video],
		);
		res.json({ message: "Video uploaded", video });
	} catch (error) {
		next(error);
	}
});

router.delete("/showroom/video", ...adminOnly, async (_req, res, next) => {
	try {
		await query("update settings set setting_value = null where setting_key = 'showroom_video'");
		res.json({ message: "Video removed" });
	} catch (error) {
		next(error);
	}
});

simpleCrud({ route: "/showroom", table: "showroom", fields: ["caption"], fileField: "image", fileColumn: "image" });

async function upsertSetting(key, value) {
	await query(
		`insert into settings (setting_key, setting_value)
		 values ($1, $2)
		 on conflict (setting_key) do update set setting_value = excluded.setting_value`,
		[key, value ?? ""],
	);
}

router.get("/settings", async (_req, res, next) => {
	try {
		const result = await query("select * from settings");
		res.json(Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value])));
	} catch (error) {
		next(error);
	}
});

router.put("/settings", ...adminOnly, async (req, res, next) => {
	try {
		for (const [key, value] of Object.entries(req.body || {})) await upsertSetting(key, value);
		res.json({ message: "Settings updated" });
	} catch (error) {
		next(error);
	}
});

router.post("/settings/home-banners", ...adminOnly, upload.array("banners", 20), async (req, res, next) => {
	try {
		const current = await query("select setting_value from settings where setting_key = 'home_banners'");
		const existing = String(current.rows[0]?.setting_value || "").split("\n").map((item) => item.trim()).filter(Boolean);
		const incoming = (req.files || []).map(assetPath).filter(Boolean);
		const banners = [...existing, ...incoming];
		await upsertSetting("home_banners", banners.join("\n"));
		res.json({ message: "Banners uploaded", banners });
	} catch (error) {
		next(error);
	}
});

router.delete("/settings/home-banners/:filename", ...adminOnly, async (req, res, next) => {
	try {
		const current = await query("select setting_value from settings where setting_key = 'home_banners'");
		const filename = decodeURIComponent(req.params.filename || "");
		const banners = String(current.rows[0]?.setting_value || "").split("\n").map((item) => item.trim()).filter(Boolean).filter((item) => item !== filename && path.basename(item) !== filename);
		await upsertSetting("home_banners", banners.join("\n"));
		res.json({ message: "Banner removed", banners });
	} catch (error) {
		next(error);
	}
});

router.post("/settings/page-banners/:key", ...adminOnly, upload.single("banner"), async (req, res, next) => {
	try {
		const value = assetPath(req.file);
		if (!value) throw new HttpError(400, "No banner file provided");
		await upsertSetting(req.params.key, value);
		res.json({ message: "Page banner uploaded", key: req.params.key, value });
	} catch (error) {
		next(error);
	}
});

router.delete("/settings/page-banners/:key", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from settings where setting_key = $1", [req.params.key]);
		res.json({ message: "Page banner removed", key: req.params.key, value: "" });
	} catch (error) {
		next(error);
	}
});

router.post("/contact", async (req, res, next) => {
	try {
		const { name, email, phone, subject, message } = req.body;
		if (!name || !email || !message) throw new HttpError(400, "Name, email, and message are required");
		const result = await query(
			"insert into contact_messages (name, email, phone, subject, message) values ($1, $2, $3, $4, $5) returning id",
			[name, email, phone || null, subject || null, message],
		);
		res.json({ id: result.rows[0].id, message: "Message sent successfully" });
	} catch (error) {
		next(error);
	}
});

router.get("/contact", ...adminOnly, async (_req, res, next) => {
	try {
		const result = await query("select * from contact_messages order by created_at desc");
		res.json(result.rows);
	} catch (error) {
		next(error);
	}
});

router.delete("/contact/:id", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from contact_messages where id = $1", [req.params.id]);
		res.json({ message: "Deleted" });
	} catch (error) {
		next(error);
	}
});

router.post("/professionals", async (req, res, next) => {
	try {
		const experience = Array.isArray(req.body.experience)
			? req.body.experience
			: String(req.body.experience || "").split(",").map((item) => item.trim()).filter(Boolean);
		const fullName = req.body.full_name || `${req.body.first_name || ""} ${req.body.last_name || ""}`.trim();
		const profession = req.body.profession || experience.join(", ");
		if (!fullName || !req.body.phone || !req.body.city || !profession) {
			throw new HttpError(400, "First name, last name, phone, city and profession are required");
		}
		const result = await query(
			`insert into professionals (full_name, email, phone, company, profession, city, message)
			 values ($1, $2, $3, $4, $5, $6, $7)
			 returning id`,
			[fullName, req.body.email || `no-email-${Date.now()}@local.gree`, req.body.phone, req.body.company || null, profession, req.body.city, req.body.message || null],
		);
		res.json({ id: result.rows[0].id, message: "Application submitted successfully" });
	} catch (error) {
		next(error);
	}
});

router.get("/professionals", ...adminOnly, async (_req, res, next) => {
	try {
		const result = await query("select * from professionals order by created_at desc");
		res.json(result.rows);
	} catch (error) {
		next(error);
	}
});

router.delete("/professionals/:id", ...adminOnly, async (req, res, next) => {
	try {
		await query("delete from professionals where id = $1", [req.params.id]);
		res.json({ message: "Deleted" });
	} catch (error) {
		next(error);
	}
});

export default router;
