import path from "node:path";
import { query } from "../db/pool.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const possiblePaths = [
  "xlsx",
  "C:/Users/defri/OneDrive/Desktop/Puna/Gree/GreeProfessional/client/node_modules/xlsx",
  path.resolve(
    path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1"),
    ),
    "../../../../../GreeProfessional/client/node_modules/xlsx",
  ),
];
let XLSX = null;
for (const p of possiblePaths) {
  try {
    XLSX = require(p);
    if (XLSX) break;
  } catch {}
}
if (!XLSX) {
  throw new Error("Could not load xlsx module");
}

function safeJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function run() {
  const outPath =
    process.argv[2] ||
    "C:/Users/defri/OneDrive/Desktop/Puna/Gree/Produktet_Gree_Live.xlsx";

  const sql = `
    select p.*,
      mc.id as resolved_main_category_id,
      mc.name as main_category_name,
      sc.name as subcategory_name,
      coalesce(
        (select pi.image_path from product_images pi where pi.product_id = p.id and pi.is_main = true limit 1),
        (select pi.image_path from product_images pi where pi.product_id = p.id order by pi.position, pi.id limit 1),
        p.main_image,
        p.image
      ) as display_image,
      (select count(*)::int from product_images pi where pi.product_id = p.id) as image_count,
      coalesce(
        nullif(nullif(p.strong_points, ''), '[]'),
        (select p2.strong_points from products p2 where p2.subcategory_id = p.subcategory_id and p2.deleted_at is null and p2.strong_points is not null and length(trim(p2.strong_points)) > 4 order by p2.id desc limit 1)
      ) as resolved_strong_points,
      coalesce(
        nullif(nullif(p.documents, ''), '[]'),
        (select p2.documents from products p2 where p2.subcategory_id = p.subcategory_id and p2.deleted_at is null and p2.documents is not null and length(trim(p2.documents)) > 4 order by p2.id desc limit 1)
      ) as resolved_documents,
      coalesce(
        nullif(nullif(p.certifications, ''), '[]'),
        (select p2.certifications from products p2 where p2.subcategory_id = p.subcategory_id and p2.deleted_at is null and p2.certifications is not null and length(trim(p2.certifications)) > 4 order by p2.id desc limit 1)
      ) as resolved_certifications,
      coalesce(
        nullif(nullif(p.features, ''), '[]'),
        (select p2.features from products p2 where p2.subcategory_id = p.subcategory_id and p2.deleted_at is null and p2.features is not null and length(trim(p2.features)) > 4 order by p2.id desc limit 1)
      ) as resolved_features
    from products p
    left join subcategories sc on sc.id = p.subcategory_id
    left join main_categories mc on mc.id = coalesce(p.main_category_id, sc.main_category_id)
    where p.deleted_at is null
    order by p.id desc
  `;

  const res = await query(sql);
  const rows = res.rows;

  // Detect main categories that share the same name case-insensitively (e.g. TRAJTIMI I AJRIT vs Trajtimi i Ajrit)
  const mainNameIds = new Map();
  for (const r of rows) {
    const mName = String(r.main_category_name || "").trim().toLowerCase();
    const mId = r.resolved_main_category_id;
    if (mName && mId) {
      if (!mainNameIds.has(mName)) mainNameIds.set(mName, new Set());
      mainNameIds.get(mName).add(String(mId));
    }
  }

  const formatRow = (r) => {
    const rawMainCat = r.main_category_name || "";
    const mainId = r.resolved_main_category_id;
    const isDuplicateMainName =
      rawMainCat &&
      mainId &&
      (mainNameIds.get(rawMainCat.trim().toLowerCase())?.size || 0) > 1;
    const mainCat =
      rawMainCat && mainId && isDuplicateMainName
        ? `${rawMainCat} ( ${mainId} )`
        : rawMainCat;
    const subCat = r.subcategory_name || r.category || "";
    const fullPath =
      mainCat && subCat ? `${mainCat} -> ${subCat}` : mainCat || subCat || "";

    const featuresArr = safeJsonArray(r.resolved_features);
    const docsArr = safeJsonArray(r.resolved_documents);
    const certsArr = safeJsonArray(r.resolved_certifications);
    const strongArr = safeJsonArray(r.resolved_strong_points);

    const imgPath = r.display_image || "";
    const fullImg =
      imgPath && !imgPath.startsWith("http")
        ? `https://greeprofesional.al${imgPath.startsWith("/") ? "" : "/"}${imgPath}`
        : imgPath;

    return {
      ID: Number(r.id),
      Emri: r.name || "",
      Modeli: r.model || "",
      "Kodi i Produktit": r.product_code || "",
      "Kategoria Kryesore": mainCat,
      Nënkategoria: subCat,
      "Shtegu i Plotë": fullPath,
      "Tipi i Produktit": r.product_type || "",
      Fuqia: r.power || "",
      Karakteristika: r.product_trait || "",
      "Shfaqet në Web": r.is_visible === false ? "JO" : "PO",
      "Çmimi (Lek)": Number(r.price || 0),
      "Çmimi i Vjetër (Lek)": Number(r.old_price || 0),
      "Çmimi i Listës (Lek)": Number(r.list_price || 0),
      "Garancia (Vite)": Number(r.warranty_years ?? 3),
      "Wi-Fi": r.wifi_enabled ? "PO" : "JO",
      "Ngrohje / Ftohje": r.heating_cooling === false ? "JO" : "PO",
      Stoku: Number(r.stock || 0),
      "Në Dyqan": Number(r.in_store || 0),
      "I Veçuar (Featured)": r.is_featured ? "PO" : "JO",
      "Klasa e Energjisë": r.energy_class || "",
      SEER: r.seer || "",
      SCOP: r.scop || "",
      BTU: r.btu ?? "",
      "Numri i Fotove": Number(r.image_count || (imgPath ? 1 : 0)),
      "Foto Kryesore": fullImg,
      "Përshkrimi i Shkurtër": r.short_description || "",
      "Përshkrimi i Plotë": r.description || "",
      "Specifikimet Teknike": r.specs || "",
      "Numri i Funksioneve": featuresArr.length,
      "Funksionet (Lista)": featuresArr
        .map((f) => f?.label || f?.title || f)
        .filter(Boolean)
        .join(", "),
      "Numri i Dokumenteve": docsArr.length,
      "Dokumentet (Lista)": docsArr
        .map((d) => d?.title || d?.label || d?.name || d)
        .filter(Boolean)
        .join(", "),
      "Numri i Çertifikimeve": certsArr.length,
      "Çertifikimet (Lista)": certsArr
        .map((c) => c?.title || c?.label || c?.name || c)
        .filter(Boolean)
        .join(", "),
      "Pikat e Forta": strongArr
        .map((s) => s?.title || s?.label || s)
        .filter(Boolean)
        .join(", "),
      "Data e Krijimit": r.created_at
        ? new Date(r.created_at).toLocaleString("sq-AL")
        : "",
      "Data e Përditësimit": r.updated_at
        ? new Date(r.updated_at).toLocaleString("sq-AL")
        : "",
    };
  };

  const allMapped = rows.map(formatRow);
  const visibleMapped = rows
    .filter((r) => r.is_visible !== false)
    .map(formatRow);

  const wb = XLSX.utils.book_new();
  const wsAll = XLSX.utils.json_to_sheet(allMapped);
  const wsVisible = XLSX.utils.json_to_sheet(visibleMapped);

  XLSX.utils.book_append_sheet(
    wb,
    wsAll,
    `Te Gjithe Produktet (${allMapped.length})`,
  );
  XLSX.utils.book_append_sheet(
    wb,
    wsVisible,
    `Shfaqen ne Web (${visibleMapped.length})`,
  );

  XLSX.writeFile(wb, outPath);
  console.log(
    `[Export] Generated ${outPath} with ${allMapped.length} total products (${visibleMapped.length} visible on web).`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
