import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '../db';
import { getUploadDir } from '../utils/file';
import {
  deleteRemoteObject,
  getContentType,
  isRemoteStorageConfigured,
  listRemoteKeys,
  uploadFileToRemote,
} from './cos';
import { listModels } from '../db/model-store';

import {
  isItemCategory,
  isMaterialType,
  LOCAL_ONLY_TYPES,
  MATERIAL_LABELS,
  MATERIAL_TYPES,
  type MaterialItem,
  type MaterialType,
} from './material-types';

export { isMaterialType, MATERIAL_LABELS, MATERIAL_TYPES };
export type { MaterialItem, MaterialType };

/** 校验文件名，防止路径穿越 */
function assertSafeFilename(filename: string): void {
  if (!filename || filename.includes('..') || path.basename(filename) !== filename) {
    throw new Error('非法文件名');
  }
}

interface AssetMetadataRow {
  type: string;
  filename: string;
  title: string | null;
  category: string | null;
  tags: string | null;
  source: string | null;
  remote_url: string | null;
}

/** 读取全部素材元数据（图库导入的标题/分类/关键词等） */
function getMetadataMap(): Map<string, AssetMetadataRow> {
  const db = getDb();
  const rows = db
    .prepare('SELECT type, filename, title, category, tags, source, remote_url FROM asset_metadata')
    .all() as AssetMetadataRow[];
  return new Map(rows.map((row) => [`${row.type}/${row.filename}`, row]));
}

/** 统计素材被穿搭方案引用的次数（服装→方案关联；模特→方案模特） */
function findReferences(filename: string): { count: number; reason: string } {
  const db = getDb();
  const like = `%${filename}%`;

  const garments = db
    .prepare('SELECT id FROM garments WHERE image_path LIKE ?')
    .all(like) as Array<{ id: string }>;
  let count = 0;
  if (garments.length > 0) {
    const placeholders = garments.map(() => '?').join(',');
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM outfit_garments WHERE garment_id IN (${placeholders})`)
      .get(...garments.map((g) => g.id)) as { c: number };
    count += row.c;
  }

  const models = db
    .prepare('SELECT id FROM models WHERE identity_image_path LIKE ? OR avatar_path LIKE ?')
    .all(like, like) as Array<{ id: string }>;
  if (models.length > 0) {
    const placeholders = models.map(() => '?').join(',');
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM outfits WHERE model_id IN (${placeholders})`)
      .get(...models.map((m) => m.id)) as { c: number };
    count += row.c;
  }

  return { count, reason: count > 0 ? `被 ${count} 个穿搭方案引用` : '' };
}

export async function listMaterials(typeFilter?: MaterialType): Promise<MaterialItem[]> {
  const types: readonly MaterialType[] = typeFilter ? [typeFilter] : MATERIAL_TYPES;
  const uploadDir = getUploadDir();
  const metadataMap = getMetadataMap();

  // 模特文件与 models 表记录按文件名关联（identity_image_path 可能是本地路径或对象存储 URL）
  const modelByFilename = new Map<string, { id: string; name: string; gender: string; is_default: boolean }>();
  for (const model of listModels()) {
    const basename = decodeURIComponent(
      (model.identity_image_path || '').split('?')[0].split('/').pop() || ''
    );
    if (basename) modelByFilename.set(basename, model);
  }

  let remoteKeys = new Set<string>();
  if (isRemoteStorageConfigured()) {
    try {
      remoteKeys = new Set(await listRemoteKeys('uploads/'));
    } catch (error) {
      console.warn('[Assets] 读取对象存储列表失败，同步状态将显示为未同步:', error);
    }
  }

  const items: MaterialItem[] = [];
  for (const type of types) {
    const dir = path.join(uploadDir, type);
    let filenames: string[] = [];
    try {
      filenames = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const filename of filenames) {
      const stat = await fs.stat(path.join(dir, filename)).catch(() => null);
      if (!stat?.isFile()) continue;

      // 只有服装和模特会被穿搭方案引用，其余类型不必查引用
      const needRefs = type === 'garment' || type === 'model';
      const refs = needRefs ? findReferences(filename) : { count: 0, reason: '' };
      const meta = metadataMap.get(`${type}/${filename}`);
      const metaCategory = meta?.category || undefined;
      // 单品子类：上装 / 下装 / 连衣裙 / 配饰 / 鞋履，上传时写入元数据
      const itemCategory =
        type === 'item' && isItemCategory(metaCategory) ? metaCategory : undefined;
      const model = type === 'model' ? modelByFilename.get(filename) : undefined;
      let tags: string[] = [];
      if (meta?.tags) {
        try {
          tags = JSON.parse(meta.tags);
        } catch {
          tags = [];
        }
      }
      items.push({
        type,
        filename,
        localPath: `/uploads/${type}/${filename}`,
        size: stat.size,
        createdAt: stat.mtimeMs,
        synced: !LOCAL_ONLY_TYPES.has(type) && remoteKeys.has(`uploads/${type}/${filename}`),
        referenceCount: refs.count,
        referenceReason: refs.reason,
        title: meta?.title || model?.name || undefined,
        category: metaCategory || (model ? (model.gender === 'male' ? '男' : '女') : undefined),
        itemCategory,
        tags: Array.isArray(tags) ? tags : [],
        source: meta?.source || (model ? '定制模特' : undefined),
        remoteUrl: meta?.remote_url || undefined,
        modelId: model?.id,
        isDefault: model?.is_default,
      });
    }
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/** 删除素材：本地文件 + 对象存储副本；被引用的素材不允许删除 */
export async function deleteMaterial(type: MaterialType, filename: string): Promise<void> {
  assertSafeFilename(filename);
  const refs = findReferences(filename);
  if (refs.count > 0) {
    throw new Error(`${refs.reason}，无法删除`);
  }

  const localPath = path.join(getUploadDir(), type, filename);
  await fs.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });

  getDb().prepare('DELETE FROM asset_metadata WHERE type = ? AND filename = ?').run(type, filename);

  if (!LOCAL_ONLY_TYPES.has(type) && isRemoteStorageConfigured()) {
    await deleteRemoteObject(`uploads/${type}/${filename}`).catch((error) => {
      console.warn('[Assets] 删除对象存储副本失败:', error);
    });
  }
}

export interface AssetMetadataInput {
  type: MaterialType;
  filename: string;
  title?: string;
  category?: string;
  tags?: string[];
  source?: string;
  remoteUrl?: string;
}

/** 写入/更新素材元数据（素材中心手动上传的单品用它记录子类与名称） */
export function upsertAssetMetadata(input: AssetMetadataInput): void {
  assertSafeFilename(input.filename);
  getDb()
    .prepare(
      `INSERT INTO asset_metadata (type, filename, title, category, tags, source, remote_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(type, filename) DO UPDATE SET
         title = excluded.title,
         category = excluded.category,
         tags = excluded.tags,
         source = excluded.source,
         remote_url = excluded.remote_url`
    )
    .run(
      input.type,
      input.filename,
      input.title || null,
      input.category || null,
      JSON.stringify(input.tags || []),
      input.source || null,
      input.remoteUrl || null,
      Date.now()
    );
}

/** 把本地素材同步到对象存储，返回公网 URL */
export async function syncMaterial(type: MaterialType, filename: string): Promise<string> {
  assertSafeFilename(filename);
  if (LOCAL_ONLY_TYPES.has(type)) {
    throw new Error('生成结果仅存本地，无需同步');
  }
  if (!isRemoteStorageConfigured()) {
    throw new Error('对象存储未配置，无法同步');
  }

  const localPath = path.join(getUploadDir(), type, filename);
  const buffer = await fs.readFile(localPath);
  return uploadFileToRemote(`uploads/${type}/${filename}`, buffer, getContentType(filename));
}
