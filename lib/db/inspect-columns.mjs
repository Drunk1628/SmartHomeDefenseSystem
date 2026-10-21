
import pg from "pg";
import fs from "node:fs";

const envText = fs.readFileSync("../../.env", "utf8");

for (const line of envText.split(/\r?\n/)) {
  const match = line.match(
    /^\s*(DATABASE_URL_POOLED|DATABASE_URL)\s*=\s*(.*?)\s*$/
  );

  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const connectionString =
  process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Database URL not found in the root .env file.");
}

const pool = new pg.Pool({ connectionString });

try {
  const result = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = ANY($2)
     ORDER BY table_name, ordinal_position`,
    ["public", ["users", "homes", "devices"]]
  );

  console.table(result.rows);
} catch (error) {
  console.error("Inspection failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
