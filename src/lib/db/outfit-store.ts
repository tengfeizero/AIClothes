import { getDb, parseJson } from '../db';
import { generateId } from '../utils/id';
import { getGarmentsByIds } from './garment-store';
import type { Outfit, OutfitStatus, OutfitWithGarments, Garment } from '@/types';

export interface CreateOutfitInput {
  name: string;
  description?: string;
  modelId?: string;
  scenePrompt?: string;
  garmentIds: string[];
}

function rowToOutfit(row: Record<string, unknown>): Outfit {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    model_id: (row.model_id as string) || null,
    scene_prompt: (row.scene_prompt as string) || null,
    front_image_path: (row.front_image_path as string) || null,
    side_image_path: (row.side_image_path as string) || null,
    back_image_path: (row.back_image_path as string) || null,
    item_list_image_path: (row.item_list_image_path as string) || null,
    suite_image_paths: parseJson<string[]>(row.suite_image_paths as string, []),
    status: row.status as OutfitStatus,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export function createOutfit(input: CreateOutfitInput): OutfitWithGarments {
  const db = getDb();
  const now = Date.now();
  const id = generateId('outfit');

  const insertOutfit = db.prepare(`
    INSERT INTO outfits (id, name, description, model_id, scene_prompt, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
  `);

  const insertGarment = db.prepare(`
    INSERT INTO outfit_garments (id, outfit_id, garment_id, position)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertOutfit.run(
      id,
      input.name,
      input.description || null,
      input.modelId || null,
      input.scenePrompt || null,
      now,
      now
    );

    input.garmentIds.forEach((gid, index) => {
      insertGarment.run(generateId('og'), id, gid, index);
    });
  });

  tx();

  const garments = getGarmentsByIds(input.garmentIds);

  return {
    id,
    name: input.name,
    description: input.description || null,
    model_id: input.modelId || null,
    scene_prompt: input.scenePrompt || null,
    front_image_path: null,
    side_image_path: null,
    back_image_path: null,
    item_list_image_path: null,
    suite_image_paths: [],
    status: 'draft',
    created_at: now,
    updated_at: now,
    garments,
  };
}

export function listOutfits(): OutfitWithGarments[] {
  const db = getDb();
  const outfits = db.prepare('SELECT * FROM outfits ORDER BY created_at DESC').all() as Record<string, unknown>[];

  return outfits.map((row) => {
    const outfit = rowToOutfit(row);
    const garmentRows = db.prepare(
      'SELECT garment_id FROM outfit_garments WHERE outfit_id = ? ORDER BY position'
    ).all(outfit.id) as { garment_id: string }[];
    const garmentIds = garmentRows.map((r) => r.garment_id);
    const garments = getGarmentsByIds(garmentIds);
    return { ...outfit, garments };
  });
}

export function getOutfit(id: string): OutfitWithGarments | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const outfit = rowToOutfit(row);
  const garmentRows = db.prepare(
    'SELECT garment_id FROM outfit_garments WHERE outfit_id = ? ORDER BY position'
  ).all(id) as { garment_id: string }[];
  const garmentIds = garmentRows.map((r) => r.garment_id);
  const garments = getGarmentsByIds(garmentIds);

  return { ...outfit, garments };
}

export function updateOutfit(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    modelId: string;
    scenePrompt: string;
    frontImagePath: string;
    sideImagePath: string;
    backImagePath: string;
    itemListImagePath: string;
    suiteImagePaths: string[];
    status: OutfitStatus;
  }>
): Outfit | null {
  const db = getDb();
  const now = Date.now();

  const fields: string[] = [];
  const values: unknown[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    modelId: 'model_id',
    scenePrompt: 'scene_prompt',
    frontImagePath: 'front_image_path',
    sideImagePath: 'side_image_path',
    backImagePath: 'back_image_path',
    itemListImagePath: 'item_list_image_path',
    suiteImagePaths: 'suite_image_paths',
    status: 'status',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = updates[key as keyof typeof updates];
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(column === 'suite_image_paths' ? JSON.stringify(value) : value);
    }
  }

  if (fields.length === 0) return getOutfit(id);

  fields.push('updated_at = ?');
  values.push(now, id);

  db.prepare(`UPDATE outfits SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getOutfit(id);
}

export function deleteOutfit(id: string): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM outfit_garments WHERE outfit_id = ?').run(id);
    const result = db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
    return result.changes > 0;
  });
  return tx();
}

export function setOutfitGarments(outfitId: string, garmentIds: string[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM outfit_garments WHERE outfit_id = ?').run(outfitId);
    const insert = db.prepare('INSERT INTO outfit_garments (id, outfit_id, garment_id, position) VALUES (?, ?, ?, ?)');
    garmentIds.forEach((gid, index) => {
      insert.run(generateId('og'), outfitId, gid, index);
    });
  });
  tx();
}
