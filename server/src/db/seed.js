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
      await client.query(
        "insert into roles (name) values ($1) on conflict (name) do nothing",
        [role],
      );
    }
  });

  await upsertLookup("statuses", statuses);
  await upsertLookup("priorities", priorities);

  const password = await bcrypt.hash("asdasdasd", 10);
  const roleRows = await query("select id, name from roles");
  const roleId = Object.fromEntries(
    roleRows.rows.map((role) => [role.name, role.id]),
  );

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

  const categories = ["Split", "VRF", "Chiller", "Aksesore"];
  for (const category of categories) {
    await query(
      "insert into categories (name) values ($1) on conflict (name) do nothing",
      [category],
    );
  }

  const categoryRows = await query("select id, name from categories");
  const categoryId = Object.fromEntries(
    categoryRows.rows.map((category) => [category.name, category.id]),
  );
  const products = [
    [
      "Set Inverter Fairy 18 BTU",
      "Kondicioner inverter per ambiente familjare dhe zyra.",
      "GREE-FAIRY-18",
      "Split",
      55000,
      70000,
      16,
      10,
      6,
    ],
    [
      "Set Inverter Lomo 12 BTU",
      "Model ekonomik dhe efikas per dhoma te vogla.",
      "GREE-LOMO-12",
      "Split",
      43000,
      58000,
      18,
      12,
      6,
    ],
    [
      "Set Inverter Pular 24 BTU",
      "Kapacitet i larte per sallone dhe hapesira me te medha.",
      "GREE-PULAR-24",
      "Split",
      69000,
      82000,
      12,
      8,
      4,
    ],
    [
      "Gree Bora 12 BTU",
      "Split AC me ftohje/ngrohje dhe konsum te ulet.",
      "GREE-BORA-12",
      "Split",
      39900,
      49900,
      20,
      15,
      5,
    ],
    [
      "Gree U-Crown 18 BTU",
      "Seri premium me performance te larte dhe dizajn elegant.",
      "GREE-UCROWN-18",
      "Split",
      78000,
      92000,
      8,
      5,
      3,
    ],
    [
      "Gree Console 12 BTU",
      "Njesi dysheme/tavan per ambiente ku muri nuk eshte opsion.",
      "GREE-CONSOLE-12",
      "Split",
      62000,
      74000,
      7,
      4,
      3,
    ],
    [
      "Gree Duct 24 BTU",
      "Sistem kanalor per zgjidhje diskrete klimatizimi.",
      "GREE-DUCT-24",
      "Split",
      88000,
      105000,
      6,
      4,
      2,
    ],
    [
      "Gree Mini VRF",
      "Zgjidhje VRF per biznese, apartamente dhe vila.",
      "GREE-MINI-VRF",
      "VRF",
      145000,
      168000,
      5,
      3,
      2,
    ],
    [
      "Gree Modular Chiller",
      "Sistem chiller per objekte komerciale dhe industriale.",
      "GREE-CHILLER-MOD",
      "Chiller",
      320000,
      360000,
      2,
      1,
      1,
    ],
    [
      "Gree Remote Control",
      "Telekomande zevendesuese per modelet kryesore Gree.",
      "GREE-REMOTE-01",
      "Aksesore",
      1990,
      2500,
      35,
      28,
      7,
    ],
  ];

  for (const [
    name,
    description,
    sku,
    category,
    price,
    oldPrice,
    stock,
    inStore,
    inHand,
  ] of products) {
    await query(
      `insert into products (name, description, sku, category_id, price, old_price, stock, in_store, in_hand)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (sku) do update set
         name = excluded.name,
         description = excluded.description,
         category_id = excluded.category_id,
         price = excluded.price,
         old_price = excluded.old_price,
         stock = excluded.stock,
         in_store = excluded.in_store,
         in_hand = excluded.in_hand,
         updated_at = now()`,
      [
        name,
        description,
        sku,
        categoryId[category],
        price,
        oldPrice,
        stock,
        inStore,
        inHand,
      ],
    );
  }

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
