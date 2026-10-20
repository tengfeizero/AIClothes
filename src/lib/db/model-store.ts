import { getDb, parseJson, stringifyJson } from '../db';
import { generateId } from '../utils/id';
import type { Model } from '@/types';

export interface CreateModelInput {
  name: string;
  identityImagePath: string;
  avatarPath?: string;
  gender?: string;
}

function rowToModel(row: Record<string, unknown>): Model {
  return {
    id: row.id as string,
    name: row.name as string,
    avatar_path: (row.avatar_path as string) || null,
    identity_image_path: row.identity_image_path as string,
    gender: (row.gender as string) || 'female',
    is_default: (row.is_default as number) === 1,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export function createModel(input: CreateModelInput): Model {
  const db = getDb();
  const now = Date.now();
  const id = generateId('model');

  // If setting as default, unset other defaults
  db.prepare('UPDATE models SET is_default = 0, updated_at = ? WHERE is_default = 1').run(now);

  const stmt = db.prepare(`
    INSERT INTO models (id, name, avatar_path, identity_image_path, gender, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const avatarPath = input.avatarPath || null;
  const gender = input.gender || 'female';

  stmt.run(id, input.name, avatarPath, input.identityImagePath, gender, now, now);

  return {
    id,
    name: input.name,
    avatar_path: avatarPath,
    identity_image_path: input.identityImagePath,
    gender,
    is_default: true,
    created_at: now,
    updated_at: now,
  };
}

export function listModels(): Model[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM models ORDER BY is_default DESC, created_at DESC'
  ).all() as Record<string, unknown>[];

  return rows.map(rowToModel);
}

export function getModel(id: string): Model | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToModel(row) : null;
}

export function getDefaultModel(): Model | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM models WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined;
  return row ? rowToModel(row) : null;
}

export function setDefaultModel(id: string): Model | null {
  const db = getDb();
  const now = Date.now();

  const model = getModel(id);
  if (!model) return null;

  db.prepare('UPDATE models SET is_default = 0, updated_at = ? WHERE is_default = 1').run(now);
  db.prepare('UPDATE models SET is_default = 1, updated_at = ? WHERE id = ?').run(now, id);

  return getModel(id);
}

export function deleteModel(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM models WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateModel(id: string, updates: Partial<Pick<Model, 'name' | 'gender'>>): Model | null {
  const db = getDb();
  const now = Date.now();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.gender !== undefined) {
    fields.push('gender = ?');
    values.push(updates.gender);
  }

  if (fields.length === 0) return getModel(id);

  fields.push('updated_at = ?');
  values.push(now, id);

  db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getModel(id);
}
