import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL } from './schema';

let dbInstance: Database.Database | null = null;
let initialized = false;

function getDbPath(): string {
  const dbDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'aiclothes.db');
}

function initDb(db: Database.Database): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
  migrateDb(db);
  initialized = true;
}

/**
 * 轻量级迁移：为旧版本数据库补齐新增加的列。
 * CREATE TABLE IF NOT EXISTS 不会修改已存在的表，因此需要手动 ALTER TABLE。
 */
function migrateDb(db: Database.Database): void {
  const tableCols = db.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>;
  const colNames = new Set(tableCols.map((c) => c.name));

  if (!colNames.has('is_default')) {
    db.exec("ALTER TABLE models ADD COLUMN is_default INTEGER DEFAULT 0");
  }

  // 商品套图结果列（旧库无此列）
  const outfitCols = db.prepare('PRAGMA table_info(outfits)').all() as Array<{ name: string }>;
  const outfitColNames = new Set(outfitCols.map((c) => c.name));
  if (!outfitColNames.has('suite_image_paths')) {
    db.exec('ALTER TABLE outfits ADD COLUMN suite_image_paths TEXT');
  }
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = getDbPath();
    dbInstance = new Database(dbPath);
    initDb(dbInstance);
  } else if (!initialized) {
    initDb(dbInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initialized = false;
  }
}

// JSON helper for SQLite TEXT<->JSON conversion
export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson<T>(value: T): string {
  return JSON.stringify(value);
}
