import { query, transaction } from "../db/pool.js";

async function run() {
  const sourceMainName = process.argv[2] || "MINI VRF";
  const targetMainName = process.argv[3] || "MINI VRF GMV5";
  const skuSuffix = process.argv[4] || "GMV5";

  console.log(
    `[Copy] Copying matching subcategory products from "${sourceMainName}" -> "${targetMainName}" (SKU suffix: -${skuSuffix})`,
  );

  const srcMainRes = await query(
    "select id, name from main_categories where trim(name) = $1 limit 1",
    [sourceMainName],
  );
  const tgtMainRes = await query(
    "select id, name from main_categories where trim(name) = $1 limit 1",
    [targetMainName],
  );

  if (!srcMainRes.rows[0]) {
    throw new Error(`Source main category not found: ${sourceMainName}`);
  }
  if (!tgtMainRes.rows[0]) {
    throw new Error(`Target main category not found: ${targetMainName}`);
  }

  const srcMainId = srcMainRes.rows[0].id;
  const tgtMainId = tgtMainRes.rows[0].id;

  const srcSubs = (
    await query(
      "select id, name from subcategories where main_category_id = $1 order by id",
      [srcMainId],
    )
  ).rows;
  const tgtSubs = (
    await query(
      "select id, name from subcategories where main_category_id = $1 order by id",
      [tgtMainId],
    )
  ).rows;

  const tgtSubByNormName = new Map();
  for (const s of tgtSubs) {
    tgtSubByNormName.set(String(s.name || "").trim().toLowerCase(), s);
  }

  let totalCopied = 0;
  let totalSkipped = 0;
  let totalImagesCopied = 0;

  await transaction(async (client) => {
    for (const srcSub of srcSubs) {
      const normName = String(srcSub.name || "").trim().toLowerCase();
      const tgtSub = tgtSubByNormName.get(normName);
      if (!tgtSub) continue;

      const products = (
        await client.query(
          `select * from products
           where subcategory_id = $1 and deleted_at is null
           order by id asc`,
          [srcSub.id],
        )
      ).rows;

      if (!products.length) continue;

      let subCopied = 0;
      let subSkipped = 0;

      for (const p of products) {
        // Check if already exists in target subcategory (by name or product_code)
        const dupCheck = await client.query(
          `select id from products
           where subcategory_id = $1
             and deleted_at is null
             and (
               lower(trim(name)) = lower(trim($2))
               or ($3::text is not null and $3::text <> '' and product_code = $3)
             )
           limit 1`,
          [tgtSub.id, p.name || "", p.product_code || null],
        );

        if (dupCheck.rows.length) {
          subSkipped++;
          totalSkipped++;
          continue;
        }

        // Generate unique SKU
        let newSku = p.sku
          ? `${p.sku}-${skuSuffix}`
          : `${skuSuffix}-${p.id}-${Date.now()}`;
        const skuCheck = await client.query(
          "select id from products where sku = $1 limit 1",
          [newSku],
        );
        if (skuCheck.rows.length) {
          newSku = `${newSku}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        const insertRes = await client.query(
          `insert into products (
             name, description, short_description, sku, category,
             main_category_id, subcategory_id,
             price, old_price, list_price, price_range, amount,
             image, main_image, stock, in_store, in_hand,
             btu, area_m2, energy_class, seer, scop,
             wifi_enabled, heating_cooling, series, warranty_years,
             installation_price, maintenance_price, manual_url,
             product_code, model, environments, specs, features,
             tracking, exceptions_type, is_featured, sort_order, is_visible,
             strong_points, documents, certifications,
             product_type, power, btu_info_image
           ) values (
             $1, $2, $3, $4, $5,
             $6, $7,
             $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17,
             $18, $19, $20, $21, $22,
             $23, $24, $25, $26,
             $27, $28, $29,
             $30, $31, $32, $33, $34,
             $35, $36, $37, $38, $39,
             $40, $41, $42,
             $43, $44, $45
           ) returning id`,
          [
            p.name,
            p.description,
            p.short_description,
            newSku,
            tgtSub.name,
            tgtMainId,
            tgtSub.id,
            p.price,
            p.old_price,
            p.list_price,
            p.price_range,
            p.amount,
            p.image,
            p.main_image,
            p.stock,
            p.in_store,
            p.in_hand,
            p.btu,
            p.area_m2,
            p.energy_class,
            p.seer,
            p.scop,
            p.wifi_enabled,
            p.heating_cooling,
            p.series,
            p.warranty_years,
            p.installation_price,
            p.maintenance_price,
            p.manual_url,
            p.product_code,
            p.model,
            p.environments,
            p.specs,
            p.features,
            p.tracking,
            p.exceptions_type,
            p.is_featured,
            p.sort_order,
            p.is_visible,
            p.strong_points,
            p.documents,
            p.certifications,
            p.product_type,
            p.power,
            p.btu_info_image,
          ],
        );

        const newProductId = insertRes.rows[0].id;

        // Copy product_images
        const imgs = (
          await client.query(
            "select image_path, is_main, position from product_images where product_id = $1 order by position asc, id asc",
            [p.id],
          )
        ).rows;

        for (const img of imgs) {
          await client.query(
            `insert into product_images (product_id, image_path, is_main, position)
             values ($1, $2, $3, $4)`,
            [newProductId, img.image_path, img.is_main, img.position],
          );
          totalImagesCopied++;
        }

        subCopied++;
        totalCopied++;
      }

      console.log(
        `  - ${srcSub.name}: copied ${subCopied}, skipped ${subSkipped}`,
      );
    }
  });

  console.log(
    `[Copy] Done! Total copied: ${totalCopied} products (${totalImagesCopied} gallery images), skipped: ${totalSkipped}.`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("[Copy] Error:", err);
  process.exit(1);
});
