import { getDb, parseJson, stringifyJson } from '../db';
import { generateId } from '../utils/id';
import type { GenerationRecord, GenerationType } from '@/types';

export interface CreateGenerationInput {
  outfitId: string;
  type: GenerationType;
  /** 模型厂商，如 腾讯云 MPS */
  provider: string;
  /** 模型版本号，如 WAND-tryon-1.0-flash */
  model: string;
  /** 每次调用单价（元） */
  price: number;
  /** 每套调用次数 */
  calls: number;
  /** tryon：按 [正面, 侧面, 背面] 顺序；suite：海报图数组 */
  images: string[];
  status?: 'completed' | 'failed';
  taskId?: string;
}

function rowToGeneration(row: Record<string, unknown>): GenerationRecord {
  return {
    id: row.id as string,
    outfit_id: row.outfit_id as string,
    type: row.type as GenerationType,
    provider: row.provider as string,
    model: row.model as string,
    price: row.price as number,
    calls: row.calls as number,
    total_cost: row.total_cost as number,
    images: parseJson<string[]>(row.images as string, []),
    status: (row.status as 'completed' | 'failed') || 'completed',
    task_id: (row.task_id as string) || null,
    created_at: row.created_at as number,
  };
}

export function createGeneration(input: CreateGenerationInput): GenerationRecord {
  const db = getDb();
  const id = generateId('gen');
  const now = Date.now();

  db.prepare(`
    INSERT INTO outfit_generations
      (id, outfit_id, type, provider, model, price, calls, total_cost, images, status, task_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.outfitId,
    input.type,
    input.provider,
    input.model,
    input.price,
    input.calls,
    input.price * input.calls,
    stringifyJson(input.images),
    input.status || 'completed',
    input.taskId || null,
    now
  );

  return getGeneration(id)!;
}

export function getGeneration(id: string): GenerationRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM outfit_generations WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToGeneration(row) : null;
}

export function listGenerationsByOutfit(outfitId: string): GenerationRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM outfit_generations WHERE outfit_id = ? ORDER BY created_at DESC')
    .all(outfitId) as Record<string, unknown>[];
  return rows.map(rowToGeneration);
}

/**
 * 为任务写生成记录（幂等：任务 result 里已有 generationId 则跳过）。
 * worker 与 reconcile 恢复完成时共用，避免恢复后重复记录。
 */
export async function recordGenerationForTask(
  taskId: string,
  input: CreateGenerationInput
): Promise<GenerationRecord | null> {
  // 动态 import 避免与 queue 模块循环依赖
  const { getTask, updateTask } = await import('../queue/task-store');
  const task = getTask(taskId);
  if (!task) return null;

  const result = (task.result || {}) as Record<string, unknown>;
  if (result.generationId) {
    return getGeneration(result.generationId as string);
  }

  const record = createGeneration(input);
  updateTask(taskId, { result: { ...result, generationId: record.id } });
  return record;
}
