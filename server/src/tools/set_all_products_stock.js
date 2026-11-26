import { query } from "../db/pool.js";

async function run() {
  const rawVal = process.argv[2];
  const stockValue = rawVal !== undefined ? Number(rawVal) : 1;

  if (!Number.isInteger(stockValue) || stockValue < 0) {
    console.error(
      "Invalid stock value. Please provide a non-negative integer (e.g. 1).",
    );
    process.exit(1);
  }

  const res = await query(
    `update products
     set stock = $1::int, amount = $1::numeric, updated_at = now()
     where deleted_at is null`,
    [stockValue],
  );

  console.log(
    `[Stock] Updated ${res.rowCount} products to stock = ${stockValue}, amount = ${stockValue}.`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("[Stock] Error:", err);
  process.exit(1);
});
