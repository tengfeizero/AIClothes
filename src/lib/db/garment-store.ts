import { getDb, parseJson, stringifyJson } from '../db';
import { generateId } from '../utils/id';
import type { Garment, GarmentCategory } from '@/types';

export interface CreateGarmentInput {
  name: string;
  category: GarmentCategory;
  imagePath: string;
  color?: string;
  tags?: string[];
}

function rowToGarment(row: Record<string, unknown>): Garment {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as GarmentCategory,
    image_path: row.image_path as string,
    color: (row.color as string) || null,
    tags: parseJson<string[]>((row.tags as string) || '[]', []),
    created_at: row.created_at as number,
  };
}

export function createGarment(input: CreateGarmentInput): Garment {
  const db = getDb();
  const now = Date.now();
  const id = generateId('garment');

  db.prepare(`
    INSERT INTO garments (id, name, category, image_path, color, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.category,
    input.imagePath,
    input.color || null,
    stringifyJson(input.tags || []),
    now
  );

  return {
    id,
    name: input.name,
    category: input.category,
    image_path: input.imagePath,
    color: input.color || null,
    tags: input.tags || [],
    created_at: now,
  };
}

export function listGarments(category?: GarmentCategory): Garment[] {
  const db = getDb();
  let rows: Record<string, unknown>[];

  if (category) {
    rows = db.prepare('SELECT * FROM garments WHERE category = ? ORDER BY created_at DESC').all(category) as Record<string, unknown>[];
  } else {
    rows = db.prepare('SELECT * FROM garments ORDER BY created_at DESC').all() as Record<string, unknown>[];
  }

  return rows.map(rowToGarment);
}

export function getGarment(id: string): Garment | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM garments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToGarment(row) : null;
}

export function getGarmentsByIds(ids: string[]): Garment[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM garments WHERE id IN (${placeholders})`).all(...ids) as Record<string, unknown>[];
  const garments = rows.map(rowToGarment);
  // Maintain order by input ids
  const idMap = new Map(garments.map((g) => [g.id, g]));
  return ids.map((id) => idMap.get(id)).filter((g): g is Garment => !!g);
}

export function deleteGarment(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM garments WHERE id = ?').run(id);
  return result.changes > 0;
}
