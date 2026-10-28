import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDollarBlock = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Skip single-line comments
    if (!inSingleQuote && !inDollarBlock && ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        i++;
      }
      current += "\n";
      continue;
    }

    // Toggle $$ dollar-quoted blocks (e.g. do $$ ... end $$;)
    if (!inSingleQuote && ch === "$" && next === "$") {
      inDollarBlock = !inDollarBlock;
      current += "$$";
      i++;
      continue;
    }

    // Toggle single quotes
    if (!inDollarBlock && ch === "'") {
      if (inSingleQuote && next === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !inDollarBlock && ch === ";") {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }
  return statements;
}

export async function runMigrations() {
  const sql = await fs.readFile(schemaPath, "utf8");
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      applied++;
    } catch (error) {
      skipped++;
      const preview = stmt.replace(/\s+/g, " ").slice(0, 90);
      console.warn(`[migrate] Skipped statement (${error.message}): ${preview}...`);
    }
  }

  console.log(`Database schema migrated (${applied} statements applied, ${skipped} skipped).`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runMigrations()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
