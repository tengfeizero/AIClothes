import { getDb, parseJson, stringifyJson } from '../db';
import { generateId } from '../utils/id';
import type { TaskType, TaskStatus, TaskRecord } from '@/types';

export interface CreateTaskInput {
  type: TaskType;
  params: Record<string, unknown>;
  provider?: string;
}

export function createTask(input: CreateTaskInput): TaskRecord {
  const db = getDb();
  const now = Date.now();
  const id = generateId('task');

  const stmt = db.prepare(`
    INSERT INTO tasks (id, type, status, params, result, error, progress, provider_task_id, provider, created_at, updated_at, completed_at)
    VALUES (?, ?, 'pending', ?, NULL, NULL, 0, NULL, ?, ?, ?, NULL)
  `);

  stmt.run(id, input.type, stringifyJson(input.params), input.provider || null, now, now);

  return {
    id,
    type: input.type,
    status: 'pending',
    params: input.params,
    result: null,
    error: null,
    progress: 0,
    provider_task_id: null,
    provider: input.provider || null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
}

export function getTask(id: string): TaskRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    params: parseJson(row.params as string, {}),
    result: row.result ? parseJson(row.result as string, {}) : null,
    error: (row.error as string) || null,
    progress: row.progress as number,
    provider_task_id: (row.provider_task_id as string) || null,
    provider: (row.provider as string) || null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    completed_at: (row.completed_at as number) || null,
  };
}

export function updateTask(
  id: string,
  updates: Partial<Pick<TaskRecord, 'status' | 'result' | 'error' | 'progress' | 'provider_task_id' | 'params'>>
): void {
  const db = getDb();
  const now = Date.now();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.result !== undefined) {
    fields.push('result = ?');
    values.push(stringifyJson(updates.result));
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.provider_task_id !== undefined) {
    fields.push('provider_task_id = ?');
    values.push(updates.provider_task_id);
  }
  if (updates.params !== undefined) {
    fields.push('params = ?');
    values.push(stringifyJson(updates.params));
  }

  if (updates.status === 'completed' || updates.status === 'failed') {
    fields.push('completed_at = ?');
    values.push(now);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTask(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getPendingTasks(limit: number = 3): TaskRecord[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC LIMIT ?'
  ).all('pending', limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    params: parseJson(row.params as string, {}),
    result: row.result ? parseJson(row.result as string, {}) : null,
    error: (row.error as string) || null,
    progress: row.progress as number,
    provider_task_id: (row.provider_task_id as string) || null,
    provider: (row.provider as string) || null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    completed_at: (row.completed_at as number) || null,
  }));
}

export function getStaleProcessingTasks(timeoutMs: number = 5 * 60 * 1000): TaskRecord[] {
  const db = getDb();
  const cutoff = Date.now() - timeoutMs;
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE status = ? AND updated_at < ?'
  ).all('processing', cutoff) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    params: parseJson(row.params as string, {}),
    result: row.result ? parseJson(row.result as string, {}) : null,
    error: (row.error as string) || null,
    progress: row.progress as number,
    provider_task_id: (row.provider_task_id as string) || null,
    provider: (row.provider as string) || null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    completed_at: (row.completed_at as number) || null,
  }));
}

export function listTasks(limit: number = 20): TaskRecord[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    params: parseJson(row.params as string, {}),
    result: row.result ? parseJson(row.result as string, {}) : null,
    error: (row.error as string) || null,
    progress: row.progress as number,
    provider_task_id: (row.provider_task_id as string) || null,
    provider: (row.provider as string) || null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    completed_at: (row.completed_at as number) || null,
  }));
}

export interface PaginatedTasks {
  tasks: TaskRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { all: number; processing: number; completed: number; failed: number };
}

export function listTasksPaginated(
  page: number = 1,
  pageSize: number = 20,
  type?: string
): PaginatedTasks {
  const db = getDb();
  const offset = (page - 1) * pageSize;
  const typeCondition = type ? 'WHERE type = ?' : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM tasks ${typeCondition}`).get(...(type ? [type] : [])) as { count: number }).count;
  const processingCount = (db.prepare(
    `SELECT COUNT(*) as count FROM tasks ${typeCondition ? typeCondition + ' AND' : 'WHERE'} status IN ('pending', 'processing')`
  ).get(...(type ? [type] : [])) as { count: number }).count;
  const completedCount = (db.prepare(
    `SELECT COUNT(*) as count FROM tasks ${typeCondition ? typeCondition + ' AND' : 'WHERE'} status = 'completed'`
  ).get(...(type ? [type] : [])) as { count: number }).count;
  const failedCount = (db.prepare(
    `SELECT COUNT(*) as count FROM tasks ${typeCondition ? typeCondition + ' AND' : 'WHERE'} status = 'failed'`
  ).get(...(type ? [type] : [])) as { count: number }).count;

  const rows = db.prepare(
    `SELECT * FROM tasks ${typeCondition} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...(type ? [type, pageSize, offset] : [pageSize, offset])) as Record<string, unknown>[];

  const tasks = rows.map((row) => ({
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    params: parseJson(row.params as string, {}),
    result: row.result ? parseJson(row.result as string, {}) : null,
    error: (row.error as string) || null,
    progress: row.progress as number,
    provider_task_id: (row.provider_task_id as string) || null,
    provider: (row.provider as string) || null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    completed_at: (row.completed_at as number) || null,
  }));

  return {
    tasks,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    counts: { all: total, processing: processingCount, completed: completedCount, failed: failedCount },
  };
}
