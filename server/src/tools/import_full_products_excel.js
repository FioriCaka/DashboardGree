import fs from "node:fs";
import path from "node:path";
import { query } from "../db/pool.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const possiblePaths = [
  "xlsx",
  "C:/Users/defri/OneDrive/Desktop/Puna/Gree/GreeProfessional/client/node_modules/xlsx",
  path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1")), "../../../../../GreeProfessional/client/node_modules/xlsx"),
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

function splitCategoryPath(rawValue) {
  return String(rawValue || "")
    .split(/->|\/|>/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCategoryNameAndId(rawName) {
  const normalized = String(rawName || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return { name: "", id: null };
  const idMatch = normalized.match(/^(.*?)\(\s*(?:id\s*[:#-]?\s*)?(\d+)\s*\)$/i);
  if (idMatch) {
    const parsedId = Number(idMatch[2]);
    const cleanName = String(idMatch[1] || "")
      .trim()
      .replace(/\s+/g, " ");
    return {
      name: cleanName || normalized,
      id: Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null,
    };
  }
  return { name: normalized, id: null };
}

async function getOrCreateMainCategoryId(rawName) {
  const { name: normalized, id: explicitId } = parseCategoryNameAndId(rawName);
  if (!normalized && !explicitId) return null;
  if (explicitId) {
    const byId = await query(
      "select id from main_categories where id = $1 limit 1",
      [explicitId],
    );
    if (byId.rows[0]) return byId.rows[0].id;
  }
  if (!normalized) return null;
  const exact = await query(
    "select id from main_categories where trim(name) = $1 limit 1",
    [normalized],
  );
  if (exact.rows[0]) return exact.rows[0].id;
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

async function getOrCreateSubcategoryId(mainCategoryId, rawName) {
  const { name: normalized, id: explicitId } = parseCategoryNameAndId(rawName);
  if (!mainCategoryId || (!normalized && !explicitId)) return null;
  if (explicitId) {
    const byId = await query(
      "select id from subcategories where id = $1 and main_category_id = $2 limit 1",
      [explicitId, mainCategoryId],
    );
    if (byId.rows[0]) return byId.rows[0].id;
  }
  if (!normalized) return null;
  const exact = await query(
    "select id from subcategories where main_category_id = $1 and trim(name) = $2 limit 1",
    [mainCategoryId, normalized],
  );
  if (exact.rows[0]) return exact.rows[0].id;
  const existing = await query(
    "select id from subcategories where main_category_id = $1 and lower(trim(name)) = lower($2) limit 1",
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
  if (!segments.length) return;
  const mainName = segments[0];
  const subName = segments.length > 1 ? segments[segments.length - 1] : null;
  const mainCategoryId = await getOrCreateMainCategoryId(mainName);
  const subcategoryId = subName
    ? await getOrCreateSubcategoryId(mainCategoryId, subName)
    : null;
  const cleanMainName = parseCategoryNameAndId(mainName).name || mainName;
  const cleanSubName = subName
    ? parseCategoryNameAndId(subName).name || subName
    : null;
  await query(
    "update products set main_category_id = $1, subcategory_id = $2, category = $3 where id = $4",
    [mainCategoryId, subcategoryId, cleanSubName || cleanMainName, productId],
  );
}

async function run() {
  const filePath = process.argv[2] || "C:/Users/defri/OneDrive/Desktop/Puna/Gree/Produktet_Gree_Live.xlsx";
  console.log(`[Import] Reading file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  console.log(`[Import] Using sheet: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  console.log(`[Import] Total rows to process: ${rows.length}`);

  const shouldUpdateExisting = !process.argv.includes("--no-update") && !process.argv.includes("--skip-existing");
  const shouldCreateNew = !process.argv.includes("--no-create") && !process.argv.includes("--skip-new");

  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let rawSpecs = row.specs || row["Specifikimet Teknike"] || "";
      if (rawSpecs) {
        rawSpecs = String(rawSpecs)
          .replace(/_x000D_\n/g, "\n")
          .replace(/_x000D_/g, "\n")
          .replace(/\r\n/g, "\n")
          .trim();
      }

      const parseBool = (val, defaultVal = false) => {
        if (val === undefined || val === null || val === "") return defaultVal;
        const str = String(val).trim().toUpperCase();
        return str === "PO" || str === "TRUE" || str === "1" || str === "YES";
      };

      const parseNum = (val, defaultVal = 0) => {
        if (val === undefined || val === null || val === "") return defaultVal;
        const num = Number(String(val).replace(/,/g, "").trim());
        return Number.isFinite(num) ? num : defaultVal;
      };

      const rawId = row.id || row.ID ? String(row.id || row.ID).trim() : null;
      const id = rawId && /^\d+$/.test(rawId) ? rawId : null;
      const code = String(
        row.product_code ||
          row["Kodi i Produktit"] ||
          row.model ||
          row["Modeli"] ||
          "",
      ).trim();
      const name = String(row.name || row["Emri"] || "").trim();
      const model = String(row.model || row["Modeli"] || "").trim();
      const price = parseNum(row.price || row["Çmimi (Lek)"]);
      const oldPrice = parseNum(row.old_price || row["Çmimi i Vjetër (Lek)"]);
      const listPrice = parseNum(row.list_price || row["Çmimi i Listës (Lek)"]);
      const warrantyYears = parseNum(row.warranty_years || row["Garancia (Vite)"], 3);
      const isVisible = parseBool(row.is_visible ?? row["Shfaqet në Web"], true);
      const isFeatured = parseBool(row.is_featured ?? row["I Veçuar (Featured)"], false);
      const wifiEnabled = parseBool(row.wifi_enabled ?? row["Wi-Fi"], false);
      const heatingCooling = parseBool(row.heating_cooling ?? row["Ngrohje / Ftohje"], true);
      const stock = parseNum(row.stock || row["Stoku"], 0);
      const inStore = parseNum(row.in_store || row["Në Dyqan"], 0);
      const energyClass = String(row.energy_class || row["Klasa e Energjisë"] || "").trim().slice(0, 50) || null;
      const seer = String(row.seer || row["SEER"] || "").trim().slice(0, 50) || null;
      const scop = String(row.scop || row["SCOP"] || "").trim().slice(0, 50) || null;
      const rawBtu = String(row.btu || row["BTU"] || "").replace(/[^0-9]/g, "");
      const btu = rawBtu ? parseInt(rawBtu, 10) : null;
      const getExcelCol = (...keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
            return row[k];
          }
        }
        const normalizedKeys = keys.map((k) => String(k).trim().toLowerCase());
        for (const [rk, rv] of Object.entries(row)) {
          if (
            normalizedKeys.includes(String(rk).trim().toLowerCase()) &&
            rv !== undefined &&
            rv !== null &&
            String(rv).trim() !== ""
          ) {
            return rv;
          }
        }
        return "";
      };
      const productType = String(getExcelCol("product_type", "Tipi i Produktit", "Tipi i produktit", "Tipi", "Product Type")).trim().slice(0, 150) || null;
      const powerVal = String(getExcelCol("power", "Fuqia", "Power", "Kapaciteti")).trim().slice(0, 100) || null;
      const productTrait = String(getExcelCol("product_trait", "Karakteristika")).trim().slice(0, 150) || null;
      const shortDesc = String(row.short_description || row["Përshkrimi i Shkurtër"] || "").trim() || null;
      const desc = String(row.description || row["Përshkrimi i Plotë"] || shortDesc || "").trim() || null;

      const rawMainCat = String(
        row.main_category_name ||
          row["Kategoria Kryesore"] ||
          row.main_category ||
          "",
      ).trim();
      const rawSubCat = String(
        row.subcategory_name ||
          row["Nënkategoria"] ||
          row.subcategory ||
          "",
      ).trim();
      const rawFullPath = String(
        row.category_path_label || row["Shtegu i Plotë"] || "",
      ).trim();
      const fullPathSegments = splitCategoryPath(rawFullPath);
      const mainHasExplicitId = /\(\s*(?:id\s*[:#-]?\s*)?\d+\s*\)\s*$/i.test(
        rawMainCat,
      );
      const pathMainHasExplicitId =
        fullPathSegments.length > 0 &&
        /\(\s*(?:id\s*[:#-]?\s*)?\d+\s*\)\s*$/i.test(fullPathSegments[0]);
      const effectiveMainCat = mainHasExplicitId
        ? rawMainCat
        : pathMainHasExplicitId
          ? fullPathSegments[0]
          : rawMainCat || fullPathSegments[0] || "";
      const effectiveSubCat =
        rawSubCat ||
        (fullPathSegments.length > 1
          ? fullPathSegments[fullPathSegments.length - 1]
          : "");
      const catPath = String(
        effectiveMainCat && effectiveSubCat
          ? `${effectiveMainCat} -> ${effectiveSubCat}`
          : rawFullPath ||
              effectiveMainCat ||
              effectiveSubCat ||
              row.category ||
              "",
      ).trim();

      let targetId = null;
      if (id) {
        const check = await query("select id from products where id = $1 and deleted_at is null", [id]);
        if (check.rows.length) targetId = check.rows[0].id;
      }
      if (!targetId && code) {
        const check = await query("select id from products where (product_code = $1 or model = $1) and deleted_at is null limit 1", [code]);
        if (check.rows.length) targetId = check.rows[0].id;
      }

      if (targetId) {
        if (!shouldUpdateExisting) {
          skippedCount++;
          continue;
        }
        await query(
          `update products
           set name = coalesce(nullif($1, ''), name),
               model = coalesce(nullif($2, ''), model),
               product_code = coalesce(nullif($3, ''), product_code),
               price = $4,
               old_price = $5,
               list_price = $6,
               warranty_years = $7,
               is_visible = $8,
               is_featured = $9,
               wifi_enabled = $10,
               heating_cooling = $11,
               stock = $12,
               in_store = $13,
               energy_class = coalesce($14, energy_class),
               seer = coalesce($15, seer),
               scop = coalesce($16, scop),
               btu = coalesce($17, btu),
               short_description = coalesce($18, short_description),
               description = coalesce($19, description),
               specs = coalesce(nullif($20, ''), specs),
               product_type = coalesce($21, product_type),
               power = coalesce($22, power),
               product_trait = coalesce($24, product_trait),
               updated_at = now()
           where id = $23`,
          [
            name,
            model,
            code,
            price,
            oldPrice,
            listPrice,
            warrantyYears,
            isVisible,
            isFeatured,
            wifiEnabled,
            heatingCooling,
            stock,
            inStore,
            energyClass,
            seer,
            scop,
            btu,
            shortDesc,
            desc,
            rawSpecs,
            productType,
            powerVal,
            targetId,
            productTrait,
          ],
        );
        if (catPath) {
          await assignCategoryPath(targetId, catPath);
        }
        updatedCount++;
      } else {
        if (!shouldCreateNew) {
          skippedCount++;
          continue;
        }
        if (!name) continue;
        const insertRes = await query(
          `insert into products
           (product_code, model, sku, name, description, short_description, specs,
            price, list_price, old_price, warranty_years, is_visible, is_featured,
            wifi_enabled, heating_cooling, stock, in_store, energy_class, seer, scop, btu, product_type, power, product_trait, tracking, exceptions_type)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'B', 'A')
           returning id`,
          [
            code || null,
            model || null,
            code || `WEB-${Date.now()}-${i}`,
            name,
            desc,
            shortDesc,
            rawSpecs || null,
            price,
            listPrice,
            oldPrice,
            warrantyYears,
            isVisible,
            isFeatured,
            wifiEnabled,
            heatingCooling,
            stock,
            inStore,
            energyClass,
            seer,
            scop,
            btu,
            productType,
            powerVal,
            productTrait,
          ],
        );
        if (catPath && insertRes.rows[0]?.id) {
          await assignCategoryPath(insertRes.rows[0].id, catPath);
        }
        createdCount++;
      }
    } catch (e) {
      console.error(`Row ${i + 1} error:`, e.message);
    }
  }

  console.log(`[Import] Completed: ${updatedCount} updated, ${createdCount} created, ${skippedCount} skipped.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal import error:", err);
  process.exit(1);
});
