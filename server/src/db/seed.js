import bcrypt from "bcryptjs";
import { pool, query, transaction } from "./pool.js";

const roles = ["admin", "teknik", "shites", "menaxher", "client"];
const statuses = [
  ["pending", "Pending", 1],
  ["cancelled", "Cancelled", 2],
  ["completed", "Completed", 3],
  ["problematic", "Problematic", 4],
];
const priorities = [
  ["low", "Low", 1],
  ["medium", "Medium", 2],
  ["high", "High", 3],
];

async function upsertLookup(table, rows) {
  for (const [slug, label, sortOrder] of rows) {
    await query(
      `insert into ${table} (slug, label, sort_order)
       values ($1, $2, $3)
       on conflict (slug) do update set label = excluded.label, sort_order = excluded.sort_order, updated_at = now()`,
      [slug, label, sortOrder],
    );
  }
}

async function main() {
  await transaction(async (client) => {
    for (const role of roles) {
      await client.query("insert into roles (name) values ($1) on conflict (name) do nothing", [role]);
    }
  });

  await upsertLookup("statuses", statuses);
  await upsertLookup("priorities", priorities);

  const password = await bcrypt.hash("asdasdasd", 10);
  const roleRows = await query("select id, name from roles");
  const roleId = Object.fromEntries(roleRows.rows.map((role) => [role.name, role.id]));

  const fixedUsers = [
    ["Test Menaxher", "test@example.com", "menaxher"],
    ["Admin User", "admin@example.com", "admin"],
    ["Tech User", "tech@example.com", "teknik"],
    ["Seller User", "seller@example.com", "shites"],
    ["Test Client", "client@gree.com", "client"],
  ];

  for (const [name, email, role] of fixedUsers) {
    await query(
      `insert into users (name, email, password, role_id)
       values ($1, $2, $3, $4)
       on conflict (email) do update set name = excluded.name, password = excluded.password, role_id = excluded.role_id, updated_at = now()`,
      [name, email, password, roleId[role]],
    );
  }

  await query(
    `insert into client (name, last_name, email, phone_number, address, nipt, password, role_id)
     values ('Test', 'Client', 'client@example.com', '123456789', '123 Client St', 'CL123456', $1, $2)
     on conflict (email) do update set password = excluded.password, role_id = excluded.role_id, updated_at = now()`,
    [password, roleId.client],
  );

  await query("insert into categories (name) values ('Air Conditioners') on conflict (name) do nothing");
  await query("insert into categories (name) values ('Spare Parts') on conflict (name) do nothing");
  await query(
    `insert into products (name, description, sku, category_id, price, stock, in_store, in_hand)
     select 'Gree Bora 12000 BTU', 'Split AC unit', 'GREE-BORA-12', id, 399.99, 10, 8, 2 from categories where name = 'Air Conditioners'
     on conflict (sku) do nothing`,
  );
  await query(
    `insert into products (name, description, sku, category_id, price, stock, in_store, in_hand)
     select 'Remote Control', 'Replacement remote', 'GREE-REMOTE-01', id, 19.99, 25, 20, 5 from categories where name = 'Spare Parts'
     on conflict (sku) do nothing`,
  );

  for (const [title, description] of [
    ["Installation", "Standard installation task"],
    ["Maintenance", "Routine maintenance"],
    ["Repair", "Repair service"],
  ]) {
    await query(
      "insert into technician_jobs (title, description) values ($1, $2) on conflict do nothing",
      [title, description],
    );
  }

  await query(
    `insert into news (title, content, type, published_at)
     values ('Welcome to Gree', 'Latest updates and service information.', 'blog', now())
     on conflict do nothing`,
  );

  console.log("Database seeded. Default password: asdasdasd");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
