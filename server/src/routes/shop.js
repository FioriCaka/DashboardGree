import { randomUUID } from "node:crypto";
import { Router } from "express";
import { query, transaction } from "../db/pool.js";
import { requireRoles } from "../auth.js";
import { HttpError } from "../http/errors.js";
import { parsePagination } from "../http/crud.js";

const router = Router();

const clientOnly = (req, _res, next) => {
  if (req.user.type !== "client" && req.user.role !== "admin")
    return next(new HttpError(403, "Vetem klientet mund te perdorin kete."));
  next();
};

const staff = requireRoles("admin", "menaxher", "shites");
const ops = requireRoles("admin", "menaxher", "teknik", "shites");

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "installation_scheduled",
  "installation_in_progress",
  "completed",
  "cancelled",
];

function generateOrderNumber() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ORD-${date}-${rand}`;
}

// ─── CART ─────────────────────────────────────────────────────────────────────

router.get("/cart", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client")
    return res.json({ data: [], meta: { subtotal: 0, installation_total: 0, total: 0 } });
  try {
    const result = await query(
      `select ci.id, ci.quantity, ci.include_installation, ci.include_maintenance,
              ci.created_at, ci.updated_at,
              p.id as product_id, p.name as product_name, p.sku, p.price, p.old_price,
              p.image, p.energy_class, p.wifi_enabled, p.warranty_years, p.stock,
              p.installation_price, p.maintenance_price, p.series
       from cart_items ci
       join products p on p.id = ci.product_id
       where ci.client_id = $1 and p.deleted_at is null
       order by ci.created_at desc`,
      [req.user.id],
    );
    const items = result.rows;
    let subtotal = 0;
    let installation_total = 0;
    for (const item of items) {
      const qty = item.quantity;
      const price = parseFloat(item.price) || 0;
      const inst = item.include_installation
        ? parseFloat(item.installation_price) || 0
        : 0;
      const maint = item.include_maintenance
        ? parseFloat(item.maintenance_price) || 0
        : 0;
      subtotal += price * qty;
      installation_total += (inst + maint) * qty;
    }
    res.json({
      data: items,
      meta: { subtotal, installation_total, total: subtotal + installation_total },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/cart", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client")
    return res.status(201).json({ data: { id: 0, product_id: req.body.product_id, quantity: req.body.quantity ?? 1 } });
  try {
    const {
      product_id,
      quantity = 1,
      include_installation = false,
      include_maintenance = false,
    } = req.body;
    if (!product_id) throw new HttpError(422, "product_id eshte i detyrueshem.");
    const prod = await query(
      "select id from products where id = $1 and deleted_at is null",
      [product_id],
    );
    if (!prod.rows[0]) throw new HttpError(404, "Produkti nuk u gjet.");
    const qty = Math.max(1, parseInt(quantity) || 1);
    const result = await query(
      `insert into cart_items (client_id, product_id, quantity, include_installation, include_maintenance)
       values ($1, $2, $3, $4, $5)
       on conflict (client_id, product_id)
       do update set quantity = cart_items.quantity + $3, include_installation = $4, include_maintenance = $5, updated_at = now()
       returning *`,
      [req.user.id, product_id, qty, Boolean(include_installation), Boolean(include_maintenance)],
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/cart/:id", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client")
    return res.json({ data: { id: req.params.id } });
  try {
    const { quantity, include_installation, include_maintenance } = req.body;
    const sets = ["updated_at = now()"];
    const params = [];
    if (quantity !== undefined) {
      params.push(Math.max(1, parseInt(quantity) || 1));
      sets.push(`quantity = $${params.length}`);
    }
    if (include_installation !== undefined) {
      params.push(Boolean(include_installation));
      sets.push(`include_installation = $${params.length}`);
    }
    if (include_maintenance !== undefined) {
      params.push(Boolean(include_maintenance));
      sets.push(`include_maintenance = $${params.length}`);
    }
    params.push(req.params.id, req.user.id);
    const result = await query(
      `update cart_items set ${sets.join(", ")}
       where id = $${params.length - 1} and client_id = $${params.length}
       returning *`,
      params,
    );
    if (!result.rows[0]) throw new HttpError(404, "Artikulli i shportes nuk u gjet.");
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/cart/all", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client") return res.json({ message: "Shporta u zbraz." });
  try {
    await query("delete from cart_items where client_id = $1", [req.user.id]);
    res.json({ message: "Shporta u zbraz." });
  } catch (error) {
    next(error);
  }
});

router.delete("/cart/:id", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client") return res.json({ message: "Artikulli u hoq.", data: { id: req.params.id } });
  try {
    const result = await query(
      "delete from cart_items where id = $1 and client_id = $2 returning *",
      [req.params.id, req.user.id],
    );
    if (!result.rows[0]) throw new HttpError(404, "Artikulli i shportes nuk u gjet.");
    res.json({ message: "Artikulli u hoq.", data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ─── ORDERS (CLIENT + STAFF) ──────────────────────────────────────────────────

router.post("/my/orders", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const clientId = isClient ? req.user.id : null;

    const {
      from_cart = false,
      product_id,
      product_name,
      product_sku,
      quantity = 1,
      unit_price = 0,
      include_installation = false,
      installation_price = 0,
      include_maintenance = false,
      maintenance_price = 0,
      delivery_name,
      delivery_phone,
      delivery_address,
      delivery_city,
      payment_method = "cash",
      preferred_installation_date,
      notes,
    } = req.body;

    if (!delivery_name?.trim() || !delivery_phone?.trim() || !delivery_address?.trim()) {
      throw new HttpError(
        422,
        "delivery_name, delivery_phone dhe delivery_address jane te detyrueshme.",
      );
    }

    let items = [];

    if (from_cart && isClient) {
      const cartResult = await query(
        `select ci.quantity, ci.include_installation, ci.include_maintenance,
                p.id as product_id, p.name as product_name, p.sku,
                p.price, p.installation_price, p.maintenance_price
         from cart_items ci
         join products p on p.id = ci.product_id
         where ci.client_id = $1 and p.deleted_at is null`,
        [clientId],
      );
      if (!cartResult.rows.length)
        throw new HttpError(422, "Shporta eshte bosh.");
      items = cartResult.rows.map((ci) => ({
        product_id: ci.product_id,
        product_name: ci.product_name,
        product_sku: ci.sku,
        quantity: ci.quantity,
        unit_price: parseFloat(ci.price) || 0,
        include_installation: ci.include_installation,
        installation_price: ci.include_installation
          ? parseFloat(ci.installation_price) || 0
          : 0,
        include_maintenance: ci.include_maintenance,
        maintenance_price: ci.include_maintenance
          ? parseFloat(ci.maintenance_price) || 0
          : 0,
      }));
    } else {
      items = [
        {
          product_id: product_id || null,
          product_name: product_name || "Produkt GREE",
          product_sku: product_sku || null,
          quantity: Math.max(1, parseInt(quantity) || 1),
          unit_price: parseFloat(unit_price) || 0,
          include_installation: Boolean(include_installation),
          installation_price: Boolean(include_installation)
            ? parseFloat(installation_price) || 0
            : 0,
          include_maintenance: Boolean(include_maintenance),
          maintenance_price: Boolean(include_maintenance)
            ? parseFloat(maintenance_price) || 0
            : 0,
        },
      ];
    }

    let subtotal = 0;
    let installation_total = 0;
    for (const item of items) {
      subtotal += item.unit_price * item.quantity;
      installation_total +=
        (item.installation_price + item.maintenance_price) * item.quantity;
    }
    const total = subtotal + installation_total;
    const order_number = generateOrderNumber();

    const order = await transaction(async (client) => {
      const orderResult = await client.query(
        `insert into orders
           (client_id, order_number, delivery_name, delivery_phone, delivery_address,
            delivery_city, payment_method, notes, subtotal, installation_total, total,
            status, preferred_installation_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12)
         returning *`,
        [
          clientId,
          order_number,
          delivery_name.trim(),
          delivery_phone.trim(),
          delivery_address.trim(),
          delivery_city?.trim() || null,
          payment_method,
          notes?.trim() || null,
          subtotal,
          installation_total,
          total,
          preferred_installation_date || null,
        ],
      );
      const newOrder = orderResult.rows[0];

      const insertedItems = [];
      for (const item of items) {
        const ir = await client.query(
          `insert into order_items
             (order_id, product_id, product_name, product_sku, quantity,
              unit_price, include_installation, installation_price,
              include_maintenance, maintenance_price)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           returning *`,
          [
            newOrder.id,
            item.product_id,
            item.product_name,
            item.product_sku,
            item.quantity,
            item.unit_price,
            item.include_installation,
            item.installation_price,
            item.include_maintenance,
            item.maintenance_price,
          ],
        );
        insertedItems.push(ir.rows[0]);
      }

      if (from_cart && isClient) {
        await client.query("delete from cart_items where client_id = $1", [
          clientId,
        ]);
      }

      return { ...newOrder, items: insertedItems };
    });

    res.status(201).json({ data: order });
  } catch (error) {
    next(error);
  }
});

router.get("/my/orders", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const { page, perPage, offset } = parsePagination(req);
    const params = [];
    const where = ["orders.deleted_at is null"];

    if (isClient) {
      params.push(req.user.id);
      where.push(`orders.client_id = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`orders.status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(
        `(lower(orders.order_number) like $${params.length} or lower(orders.delivery_name) like $${params.length})`,
      );
    }

    const whereSql = `where ${where.join(" and ")}`;
    const totalResult = await query(
      `select count(*)::int as total from orders ${whereSql}`,
      params,
    );
    const result = await query(
      `select orders.*,
              c.name as client_name, c.last_name as client_last_name, c.phone_number as client_phone
       from orders
       left join client c on c.id = orders.client_id
       ${whereSql}
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

router.get("/my/orders/:id", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const params = [req.params.id];
    const extraWhere = isClient ? ` and orders.client_id = $2` : "";
    if (isClient) params.push(req.user.id);

    const orderResult = await query(
      `select orders.*,
              c.name as client_name, c.last_name as client_last_name, c.phone_number as client_phone
       from orders
       left join client c on c.id = orders.client_id
       where orders.id = $1 and orders.deleted_at is null${extraWhere}`,
      params,
    );
    const order = orderResult.rows[0];
    if (!order) throw new HttpError(404, "Porosia nuk u gjet.");

    const itemsResult = await query(
      "select * from order_items where order_id = $1 order by id",
      [order.id],
    );
    res.json({ data: { ...order, items: itemsResult.rows } });
  } catch (error) {
    next(error);
  }
});

router.post("/my/orders/:id/cancel", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const params = [req.params.id];
    const extraWhere = isClient ? ` and client_id = $2` : "";
    if (isClient) params.push(req.user.id);

    const result = await query(
      `update orders
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
       where id = $1 and status in ('pending', 'confirmed') and deleted_at is null${extraWhere}
       returning *`,
      params,
    );
    if (!result.rows[0])
      throw new HttpError(404, "Porosia nuk u gjet ose nuk mund te anulohet.");
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ─── ORDERS (STAFF) ───────────────────────────────────────────────────────────

router.get("/orders", staff, async (req, res, next) => {
  try {
    const { page, perPage, offset } = parsePagination(req);
    const params = [];
    const where = ["orders.deleted_at is null"];

    if (req.query.status) {
      params.push(req.query.status);
      where.push(`orders.status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(
        `(lower(orders.order_number) like $${params.length}` +
          ` or lower(orders.delivery_name) like $${params.length}` +
          ` or lower(coalesce(c.name,'')) like $${params.length}` +
          ` or lower(coalesce(c.last_name,'')) like $${params.length})`,
      );
    }

    const whereSql = `where ${where.join(" and ")}`;
    const totalResult = await query(
      `select count(*)::int as total
       from orders left join client c on c.id = orders.client_id ${whereSql}`,
      params,
    );
    const result = await query(
      `select orders.*,
              c.name as client_name, c.last_name as client_last_name, c.phone_number as client_phone
       from orders
       left join client c on c.id = orders.client_id
       ${whereSql}
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

router.patch("/orders/:id/status", staff, async (req, res, next) => {
  try {
    const { status, preferred_installation_date } = req.body;
    if (!ORDER_STATUSES.includes(status))
      throw new HttpError(422, `Status invalid. Vlerat e vlefshme: ${ORDER_STATUSES.join(", ")}`);

    const sets = ["status = $1", "updated_at = now()"];
    const params = [status];

    if (status === "confirmed") sets.push("confirmed_at = now()");
    if (status === "completed") sets.push("installed_at = now()");
    if (preferred_installation_date) {
      params.push(preferred_installation_date);
      sets.push(`preferred_installation_date = $${params.length}`);
    }
    params.push(req.params.id);

    const result = await query(
      `update orders set ${sets.join(", ")}
       where id = $${params.length} and deleted_at is null
       returning *`,
      params,
    );
    if (!result.rows[0]) throw new HttpError(404, "Porosia nuk u gjet.");
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:id", staff, async (req, res, next) => {
  try {
    const orderResult = await query(
      `select orders.*,
              c.name as client_name, c.last_name as client_last_name, c.phone_number as client_phone
       from orders
       left join client c on c.id = orders.client_id
       where orders.id = $1 and orders.deleted_at is null`,
      [req.params.id],
    );
    const order = orderResult.rows[0];
    if (!order) throw new HttpError(404, "Porosia nuk u gjet.");
    const itemsResult = await query(
      "select * from order_items where order_id = $1 order by id",
      [order.id],
    );
    res.json({ data: { ...order, items: itemsResult.rows } });
  } catch (error) {
    next(error);
  }
});

// ─── WARRANTIES ───────────────────────────────────────────────────────────────

router.get("/my/warranties", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const params = isClient ? [req.user.id] : [];
    const whereSql = isClient ? "where w.client_id = $1" : "";
    const result = await query(
      `select w.*,
              c.name as client_name, c.last_name as client_last_name,
              p.sku as product_sku_db
       from warranties w
       left join client c on c.id = w.client_id
       left join products p on p.id = w.product_id
       ${whereSql}
       order by w.created_at desc`,
      params,
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/my/warranties/:id", async (req, res, next) => {
  try {
    const isClient = req.user.type === "client";
    const params = [req.params.id];
    const extraWhere = isClient ? " and w.client_id = $2" : "";
    if (isClient) params.push(req.user.id);
    const result = await query(
      `select w.*,
              c.name as client_name, c.last_name as client_last_name,
              p.sku as product_sku_db
       from warranties w
       left join client c on c.id = w.client_id
       left join products p on p.id = w.product_id
       where w.id = $1${extraWhere}`,
      params,
    );
    if (!result.rows[0]) throw new HttpError(404, "Garancia nuk u gjet.");
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/my/warranties/activate", clientOnly, async (req, res, next) => {
  if (req.user.type !== "client")
    return next(new HttpError(422, "Per te aktivizuar garancine, perdor panelin e administrimit."));
  try {
    const { qr_code, serial_number } = req.body;
    if (!qr_code && !serial_number)
      throw new HttpError(422, "qr_code ose serial_number eshte i detyrueshem.");

    const col = qr_code ? "qr_code" : "serial_number";
    const val = qr_code || serial_number;

    const result = await query(
      `update warranties
       set client_id = $1,
           activated_at = now(),
           expires_at = now() + (warranty_years * interval '1 year'),
           updated_at = now()
       where ${col} = $2 and activated_at is null
       returning *`,
      [req.user.id, val],
    );
    if (!result.rows[0])
      throw new HttpError(
        404,
        "Kodi nuk u gjet ose garancia eshte tashmë e aktivizuar.",
      );
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/warranties", ops, async (req, res, next) => {
  try {
    const {
      client_id,
      product_id,
      product_name,
      serial_number,
      warranty_years = 3,
      order_item_id,
      sale_id,
      notes,
    } = req.body;
    if (!client_id || !product_name)
      throw new HttpError(422, "client_id dhe product_name jane te detyrueshem.");

    const qr_code = randomUUID();
    const result = await query(
      `insert into warranties
         (client_id, product_id, product_name, serial_number, qr_code,
          warranty_years, order_item_id, sale_id, registered_by, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning *`,
      [
        client_id,
        product_id || null,
        product_name,
        serial_number || null,
        qr_code,
        warranty_years,
        order_item_id || null,
        sale_id || null,
        req.user.id,
        notes || null,
      ],
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
