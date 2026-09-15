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

  const initialErrorCodes = [
    [
      "E0",
      "Defekt EEPROM",
      "Kujtesa e brendshme e bordit elektrik ka dështuar.",
      "Bord elektronik i dëmtuar, Tension i paqëndrueshëm",
      "Kërkohet zëvendësim i bordit. Kontaktoni servicin.",
      "high",
    ],
    [
      "E1",
      "Mbrojtje nga presioni i lartë",
      "Presioni i gazit në komprestor ka tejkaluar limitin e lejuar.",
      "Ventilatori i jashtëm i bllokuar ose i dëmtuar, Gaz freoni i tepërt, Temperatura e jashtme shumë e lartë",
      "Kontrolloni ventilatorin dhe serpentinën e jashtme. Mos e ndizni derisa servisteri të verifikojë nivelin e gazit.",
      "high",
    ],
    [
      "E2",
      "Mbrojtje nga presioni i ulët",
      "Presioni i gazit freoni është nën nivelin minimal.",
      "Rrjedhje gazi freoni, Sasia e pamjaftueshme e gazit, Temperatura e jashtme shumë e ulët",
      "Ndaloni pajisjen. Ka mundësi rrjedhje gazi — kërkohet servis i menjëhershëm.",
      "high",
    ],
    [
      "E3",
      "Mbrojtje nga rryma e lartë e kompresorit",
      "Kompresori po konsumon rrymë mbi limitin e lejuar.",
      "Tensioni i rrjetit shumë i ulët, Kompresori i bllokuar ose i dëmtuar, Gaz freoni i tepërt",
      "Kontrolloni tensionin e rrjetit elektrik. Ndaloni pajisjen dhe kontaktoni servicin.",
      "high",
    ],
    [
      "E4",
      "Mbrojtje nga temperatura e lartë e shkarkimit",
      "Temperatura e tubacionit të shkarkimit të kompresorit është shumë e lartë.",
      "Gaz freoni i pamjaftueshëm, Bllokim i rrjedhës së ajrit, Temperatura e jashtme ekstreme",
      "Lini pajisjen të pushojë 30 min. Nëse gabimi persiston, kërkohet servis.",
      "high",
    ],
    [
      "E5",
      "Mbrojtje nga mbingarkesa elektrike",
      "Rryma totale e njësisë ka tejkaluar vlerën maksimale.",
      "Tension i rrjetit jashtë normales, Defekt i bordit të kontrollit",
      "Kontrolloni burim tensionin. Nëse vazhdon, kërkohet servis.",
      "high",
    ],
    [
      "E6",
      "Defekt komunikimi (brendshme ↔ jashtme)",
      "Njësia e brendshme dhe e jashtme nuk komunikojnë si duhet.",
      "Kabllo komunikimi e dëmtuar ose e shkëputur, Bord elektronik me defekt",
      "Kontrolloni lidhjet e kablove midis njësive. Nëse vazhdon, kërkohet servis.",
      "medium",
    ],
    [
      "E7",
      "Konflikt i mënyrës",
      "Dy njësi të ndryshme janë vendosur në mënyra të kundërta (ftohje + ngrohje).",
      "Disa telekomanda aktive njëkohësisht me mënyra të ndryshme",
      "Vendosini të gjitha njësitë në të njëjtën mënyrë pune. Gabim i zakonshëm pa nevojë servisi.",
      "low",
    ],
    [
      "E8",
      "Defekt i motorit të ventilatorit të brendshëm",
      "Motori i ventilatorit të njësisë së brendshme nuk funksionon si duhet.",
      "Motor i dëmtuar, Kondensator i motorit me defekt, Bord kontrolli me defekt",
      "Ndaloni pajisjen. Kërkohet inspektim dhe ndoshta zëvendësim i motorit.",
      "medium",
    ],
    [
      "F0",
      "Defekt sensorit T1 (temperaturë ajri brendshëm)",
      "Sensori i temperaturës së ajrit të brendshëm ka dështuar.",
      "Sensor i shkëputur, Sensor i dëmtuar nga lagështia",
      "Kërkohet zëvendësim i sensorit nga tekniku.",
      "medium",
    ],
    [
      "F1",
      "Defekt sensorit T2 (serpentinë brendshme)",
      "Sensori i temperaturës së serpentinës së brendshme ka dështuar.",
      "Sensor i shkëputur ose i dëmtuar",
      "Kërkohet zëvendësim i sensorit nga tekniku.",
      "medium",
    ],
    [
      "H1",
      "Mbrojtje nga ngrica / Erë e ftohtë",
      "Pajisja është në ciklin e shkrirjes ose mbrojtjes nga era e ftohtë. Ky është funksionim normal.",
      "Temperatura e jashtme shumë e ulët, Cikël normal i shkrirjes",
      "Prisni disa minuta. Pajisja do të rifillojë vetë. Nuk kërkohet servis.",
      "low",
    ],
    [
      "H6",
      "Defekt i reagimit të motorit DC (brendshëm)",
      "Motori DC i ventilatorit të brendshëm nuk dërgon sinjal reagimi.",
      "Motor i dëmtuar, Lidhje kabllo e lirë",
      "Ndaloni pajisjen dhe kontaktoni servicin.",
      "medium",
    ],
    [
      "P0",
      "Mbrojtja IPM",
      "Mbrojtje e integruar e modulit të fuqisë inverter.",
      "Tension i paqëndrueshëm, Temperaturë shumë e lartë, Modul i dëmtuar",
      "Kërkohet servis i menjëhershëm.",
      "high",
    ],
  ];

  for (const [code, name, description, causes, action, severity] of initialErrorCodes) {
    await query(
      `insert into error_codes (code, name, description, causes, action, severity)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [code, name, description, causes, action, severity],
    );
  }

  console.log("Database seeded. Default password: asdasdasd");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
