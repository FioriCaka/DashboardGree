import { query, transaction } from "../db/pool.js";

async function run() {
  const res = await query(
    `select id, name, sku from products where sku like '%-GMV5' order by id asc`,
  );
  console.log(`[Cleanup] Found ${res.rows.length} duplicated -GMV5 product copies.`);
  if (!res.rows.length) {
    process.exit(0);
  }

  const ids = res.rows.map((r) => r.id);
  await transaction(async (client) => {
    const imgDel = await client.query(
      "delete from product_images where product_id = any($1::bigint[])",
      [ids],
    );
    const prodDel = await client.query(
      "delete from products where id = any($1::bigint[])",
      [ids],
    );
    console.log(
      `[Cleanup] Deleted ${prodDel.rowCount} duplicated products and ${imgDel.rowCount} copied gallery images.`,
    );
  });

  process.exit(0);
}

run().catch((err) => {
  console.error("[Cleanup] Error:", err);
  process.exit(1);
});
