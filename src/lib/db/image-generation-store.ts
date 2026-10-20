import { getDb, parseJson, stringifyJson } from '../db';
import { generateId } from '../utils/id';
import type { ImageGenerationRecord } from '@/types';

export interface CreateImageGenerationInput {
  taskType: 'tryon' | 'replicate' | 'suite' | 'model3d' | 'generate';
  /** 模型厂商，如 腾讯云 MPS */
  provider: string;
  /** 模型版本号，如 WAND-tryon-1.0-flash */
  model: string;
  /** 每次调用单价（元） */
  price: number;
  /** 调用次数 */
  calls: number;
  images: string[];
  status?: 'completed' | 'failed';
  taskId?: string;
}

function rowToRecord(row: Record<string, unknown>): ImageGenerationRecord {
  return {
    id: row.id as string,
    task_type: row.task_type as 'tryon' | 'replicate' | 'suite' | 'model3d' | 'generate',
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

export function createImageGeneration(input: CreateImageGenerationInput): ImageGenerationRecord {
  const db = getDb();
  const id = generateId('img');
  const now = Date.now();

  db.prepare(`
    INSERT INTO image_generations
      (id, task_type, provider, model, price, calls, total_cost, images, status, task_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.taskType,
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

  return getImageGeneration(id)!;
}

export function getImageGeneration(id: string): ImageGenerationRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM image_generations WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

export function listImageGenerations(taskType?: 'tryon' | 'replicate' | 'suite' | 'model3d' | 'generate'): ImageGenerationRecord[] {
  const db = getDb();
  const rows = taskType
    ? (db
        .prepare('SELECT * FROM image_generations WHERE task_type = ? ORDER BY created_at DESC')
        .all(taskType) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM image_generations ORDER BY created_at DESC')
        .all() as Record<string, unknown>[]);
  return rows.map(rowToRecord);
}

/**
 * 为单图任务写生成记录（幂等：任务 result 里已有 generationId 则跳过）。
 * worker 与 reconcile 恢复完成时共用，避免恢复后重复记录。
 */
export async function recordImageGenerationForTask(
  taskId: string,
  input: CreateImageGenerationInput
): Promise<ImageGenerationRecord | null> {
  // 动态 import 避免与 queue 模块循环依赖
  const { getTask, updateTask } = await import('../queue/task-store');
  const task = getTask(taskId);
  if (!task) return null;

  const result = (task.result || {}) as Record<string, unknown>;
  if (result.generationId) {
    return getImageGeneration(result.generationId as string);
  }

  const record = createImageGeneration(input);
  updateTask(taskId, { result: { ...result, generationId: record.id } });
  return record;
}
