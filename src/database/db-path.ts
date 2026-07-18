import { join } from 'node:path';

/**
 * Resolves the SQLite database file path.
 *
 * Precedence:
 *   1. DB_PATH            - explicit absolute/relative path to the .db file
 *   2. DATA_DIR           - a persistent directory (e.g. a NitroCloud volume mount);
 *                           the db is placed at <DATA_DIR>/tracelens.db
 *   3. process.cwd()      - local dev default (ephemeral on scale-to-zero hosts)
 *
 * On serverless/scale-to-zero hosts, set DATA_DIR (or DB_PATH) to a mounted
 * persistent volume so the database and audit log survive restarts.
 */
export const DB_PATH: string = process.env.DB_PATH
  ? process.env.DB_PATH
  : process.env.DATA_DIR
    ? join(process.env.DATA_DIR, 'tracelens.db')
    : join(process.cwd(), 'tracelens.db');
