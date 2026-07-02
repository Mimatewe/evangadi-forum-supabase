import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

// PostgreSQL connection (Supabase).
// Uses DATABASE_URL connection string, e.g.:
//   postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required (e.g. postgresql://user:pass@host:port/db)",
  );
}

// Supabase requires SSL. Allow opting out for local dev via DB_SSL=false.
const ssl =
  process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

export const db = new Pool({
  connectionString,
  ssl,
});

// Convert MySQL-style ? placeholders to PostgreSQL-style $1, $2, ...
// PostgreSQL uses numbered placeholders instead of positional ?.
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function isInsertSql(sql) {
  return /^\s*INSERT\b/i.test(sql.trim());
}

const ensureParams = (params) => {
  if (params === undefined || params === null) {
    throw new Error("SQL parameters are required");
  }

  const isArray = Array.isArray(params);
  const isObject = !isArray && typeof params === "object";
  if (!isArray && !isObject) {
    throw new Error("SQL parameters must be an array or object");
  }
};

/**
 * Execute a SQL query using PostgreSQL.
 *
 * Keeps the same calling convention as the old mysql2 version so that
 * existing services do not need to change how they read results:
 *   - SELECT / UPDATE / DELETE  -> returns an array of rows
 *   - INSERT (with RETURNING)   -> returns { insertId, affectedRows, rows }
 *
 * MySQL `?` placeholders are auto-converted to PostgreSQL `$N` placeholders,
 * so existing SQL strings with `?` and dynamic `IN (?, ?, ?)` clauses keep
 * working unchanged.
 */
export const safeExecute = async (sql, params) => {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new Error("SQL query must be a non-empty string");
  }

  ensureParams(params);

  const paramsArray = Array.isArray(params) ? params : [];
  const pgSql = convertPlaceholders(sql);

  const result = await db.query(pgSql, paramsArray);

  // Mimic mysql2 behavior:
  // - INSERT returns an object with `insertId` and `affectedRows`.
  //   PostgreSQL needs a RETURNING clause to get the generated id;
  //   services updated for Postgres add `RETURNING <pk>` to INSERTs.
  if (isInsertSql(sql)) {
    const rows = result.rows || [];
    let insertId = null;

    if (rows.length > 0) {
      const firstRow = rows[0];
      // Pick the first returned column value as the insertId.
      // Common primary-key column names are checked first for clarity.
      insertId =
        firstRow.user_id ??
        firstRow.question_id ??
        firstRow.answer_id ??
        firstRow.tag_id ??
        firstRow.vector_id ??
        firstRow.document_id ??
        firstRow.chunk_id ??
        firstRow.insert_id ??
        Object.values(firstRow)[0];
    }

    return {
      insertId,
      affectedRows: result.rowCount || 0,
      rows,
    };
  }

  // For SELECT / UPDATE / DELETE without RETURNING: return rows array.
  return result.rows;
};
